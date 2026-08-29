import { DatabaseSync } from "node:sqlite";
import path from "path";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";

/**
 * Sincronização de funcionários com a intranet.
 *
 * A intranet é a dona do cadastro de pessoas: é lá que existem matrícula,
 * setor, cargo e situação (ativo, afastado, desligado). Aqui esses dados são
 * apenas um espelho — quem contrata, transfere ou desliga é o RH, na intranet.
 *
 * A leitura é feita direto no arquivo SQLite dela, em modo somente-leitura.
 * Isso evita depender da intranet estar no ar e não exige nenhuma alteração
 * naquele sistema. O caminho vem de INTRANET_DB_PATH no .env; sem essa
 * variável a sincronização fica desligada e a plataforma segue funcionando de
 * forma independente.
 *
 * As senhas NÃO são copiadas: os dois sistemas guardam apenas hashes, que não
 * podem ser convertidos de um para o outro. Cada conta nova nasce com uma
 * senha provisória, exibida uma única vez para o administrador entregar ao
 * funcionário, e a plataforma exige a troca no primeiro acesso.
 */

export type SyncOutcome = {
  criados: Array<{ nome: string; email: string; matricula: string; senhaProvisoria: string }>;
  atualizados: number;
  desativados: number;
  ignorados: Array<{ nome: string; motivo: string }>;
};

type EmployeeRow = {
  id: string;
  registration: string;
  full_name: string;
  social_name: string;
  email_corporate: string;
  status: string;
  position_name: string | null;
  department_name: string | null;
};

export function intranetDbPath(): string | null {
  const bruto = process.env.INTRANET_DB_PATH;
  if (!bruto?.trim()) return null;
  return path.isAbsolute(bruto) ? bruto : path.join(process.cwd(), bruto);
}

export function syncDisponivel(): boolean {
  return intranetDbPath() !== null;
}

/**
 * Chave de comparação de setores, sem acento e sem caixa.
 *
 * A intranet grava "Recepcao" e esta plataforma já tinha "Recepção": comparar
 * o texto cru criaria dois departamentos para o mesmo setor, quebrando os
 * filtros e o gráfico do painel.
 */
function chaveDepartamento(nome: string): string {
  return nome
    .trim()
    .normalize("NFD")
    .replace(new RegExp("[\u0300-\u036f]", "g"), "")
    .toLowerCase();
}

/** Senha provisória curta, fácil de ditar por telefone e sem caracteres ambíguos. */
function senhaProvisoria(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let saida = "";
  for (let i = 0; i < 8; i += 1) {
    saida += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  }
  return `Tri-${saida}`;
}

function lerFuncionariosDaIntranet(caminho: string): EmployeeRow[] {
  const intranet = new DatabaseSync(caminho, { readOnly: true });
  try {
    return intranet
      .prepare(
        `SELECT e.id, e.registration, e.full_name, e.social_name, e.email_corporate, e.status,
                p.name AS position_name, d.name AS department_name
           FROM employees e
           LEFT JOIN positions p ON p.id = e.position_id
           LEFT JOIN departments d ON d.id = e.department_id
          ORDER BY e.registration`
      )
      .all() as unknown as EmployeeRow[];
  } finally {
    intranet.close();
  }
}

/**
 * Espelha o cadastro da intranet.
 *
 * Regras:
 *  - funcionário novo vira conta com senha provisória e troca obrigatória;
 *  - funcionário existente tem nome, e-mail, cargo, setor e matrícula atualizados;
 *  - desligado na intranet é desativado aqui, nunca apagado — o histórico de
 *    treinamento e os certificados precisam sobreviver ao desligamento;
 *  - contas criadas direto nesta plataforma (sem vínculo com a intranet) não
 *    são tocadas, inclusive o administrador.
 */
export async function sincronizarComIntranet(): Promise<SyncOutcome> {
  const caminho = intranetDbPath();
  if (!caminho) {
    throw new Error(
      "Sincronização não configurada. Defina INTRANET_DB_PATH no arquivo .env apontando para o banco da intranet."
    );
  }

  let funcionarios: EmployeeRow[];
  try {
    funcionarios = lerFuncionariosDaIntranet(caminho);
  } catch (erro) {
    throw new Error(
      `Não foi possível ler o cadastro da intranet em ${caminho}. ` +
        `Confira o caminho em INTRANET_DB_PATH. (${(erro as Error).message})`
    );
  }

  const resultado: SyncOutcome = {
    criados: [],
    atualizados: 0,
    desativados: 0,
    ignorados: [],
  };

  // Setores da intranet viram departamentos aqui, criados sob demanda.
  const departamentos = new Map<string, string>();
  for (const existente of await db.department.findMany()) {
    departamentos.set(chaveDepartamento(existente.name), existente.id);
  }

  async function departamentoId(nome: string | null): Promise<string | null> {
    if (!nome?.trim()) return null;
    const chave = chaveDepartamento(nome);
    const jaTem = departamentos.get(chave);
    if (jaTem) return jaTem;
    const criado = await db.department.create({ data: { name: nome.trim() } });
    departamentos.set(chave, criado.id);
    return criado.id;
  }

  for (const funcionario of funcionarios) {
    const nome = funcionario.social_name || funcionario.full_name;
    const email = funcionario.email_corporate.trim().toLowerCase();

    if (!email) {
      resultado.ignorados.push({
        nome,
        motivo: "sem e-mail corporativo na intranet (o login desta plataforma é por e-mail)",
      });
      continue;
    }

    const ativo = funcionario.status !== "DESLIGADO";
    const setorId = await departamentoId(funcionario.department_name);

    // Reencontra pela âncora da intranet; se ainda não houver vínculo, cai no
    // e-mail para adotar uma conta que já existia antes da integração.
    const existente =
      (await db.user.findUnique({ where: { intranetEmployeeId: funcionario.id } })) ??
      (await db.user.findUnique({ where: { email } }));

    if (existente) {
      const eraAtivo = existente.active;
      await db.user.update({
        where: { id: existente.id },
        data: {
          name: nome,
          email,
          position: funcionario.position_name ?? existente.position,
          departmentId: setorId ?? existente.departmentId,
          matricula: funcionario.registration,
          intranetEmployeeId: funcionario.id,
          // Administrador desta plataforma não perde o acesso por causa da
          // situação dele no cadastro de pessoal.
          active: existente.role === "ADMIN" ? existente.active : ativo,
          syncedAt: new Date(),
        },
      });
      if (eraAtivo && !ativo && existente.role !== "ADMIN") resultado.desativados += 1;
      else resultado.atualizados += 1;
      continue;
    }

    if (!ativo) continue; // desligado que nunca existiu aqui não precisa de conta

    const senha = senhaProvisoria();
    await db.user.create({
      data: {
        name: nome,
        email,
        passwordHash: await hashPassword(senha),
        role: "EMPLOYEE",
        active: true,
        position: funcionario.position_name,
        departmentId: setorId,
        matricula: funcionario.registration,
        intranetEmployeeId: funcionario.id,
        mustChangePassword: true,
        syncedAt: new Date(),
      },
    });
    resultado.criados.push({
      nome,
      email,
      matricula: funcionario.registration,
      senhaProvisoria: senha,
    });
  }

  return resultado;
}
