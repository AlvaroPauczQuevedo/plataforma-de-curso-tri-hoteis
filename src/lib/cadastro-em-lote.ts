/**
 * O cadastro de vários funcionários, já com o banco.
 *
 * Separado da server action de propósito, e não por gosto de camada: a action
 * é a FRONTEIRA — ela confere sessão e alcance — e isto é a REGRA. Com as duas
 * juntas, a regra só era exercitável com uma sessão de verdade, e por isso não
 * era exercitada.
 *
 * Mora fora de `actions/` também por segurança: tudo que é exportado de um
 * arquivo `"use server"` vira um endereço alcançável de fora. Uma função que
 * cria usuários não pode ser uma dessas — a trava precisa estar antes dela,
 * não dentro.
 */
import { db } from "@/lib/db";
import { hashPassword, senhaProvisoria } from "@/lib/password";
import { logAdminActivity } from "@/lib/activity-log";
import { sincronizarUsuario } from "@/lib/matricula-automatica";
import {
  MAXIMO_DE_PESSOAS,
  lerPessoas,
  resolverConflitos,
} from "@/lib/lote-de-funcionarios";

/**
 * Uma linha do resultado.
 *
 * A senha vem junto porque é a única vez que ela existe em texto: não é
 * gravada em lugar nenhum, e quem cadastrou precisa dela na tela para entregar
 * à pessoa. Fechou a tela, acabou — dali em diante só redefinindo.
 */
export type PessoaCadastrada = {
  nome: string;
  usuario: string;
  senha: string | null;
  problema: string | null;
};

export type ResultadoDoLoteDePessoas =
  | { ok: false; error: string; pessoas?: PessoaCadastrada[] }
  | { ok: true; pessoas: PessoaCadastrada[] };

/**
 * Cadastra o lote. Quem chama já conferiu sessão e alcance.
 *
 * TUDO OU NADA: se qualquer linha tiver problema, nada é gravado e a lista
 * volta inteira marcada. Gravar as boas e reclamar do resto deixaria quem
 * cadastra com uma lista pela metade para reconciliar à mão — pior do que
 * corrigir duas linhas e colar de novo.
 */
export async function executarLoteDeFuncionarios(params: {
  adminId: string;
  texto: string;
  unidadeId?: string | null;
  departmentId?: string | null;
}): Promise<ResultadoDoLoteDePessoas> {
  const lidas = lerPessoas(params.texto);

  if (lidas.length === 0) {
    return { ok: false, error: "Cole ao menos um nome, um por linha." };
  }
  if (lidas.length > MAXIMO_DE_PESSOAS) {
    return {
      ok: false,
      error:
        `São ${lidas.length} pessoas e o limite é ${MAXIMO_DE_PESSOAS} por vez. ` +
        "Confira se não colou a planilha inteira.",
    };
  }

  /*
    Os logins já gravados, para o desempate. Traz todos porque a comparação é
    contra a rede inteira: nome de usuário é único na plataforma, e não por
    hotel — duas Ana Lima em cidades diferentes ainda precisam de logins
    distintos.
  */
  const existentes = new Set(
    (await db.user.findMany({ select: { username: true } })).map((u) => u.username)
  );

  const resolvidas = resolverConflitos(lidas, existentes);
  const comProblema = resolvidas.filter((p) => p.problema);

  if (comProblema.length > 0) {
    return {
      ok: false,
      error:
        `${comProblema.length} de ${resolvidas.length} linha(s) precisam de ajuste. ` +
        "Nada foi cadastrado.",
      pessoas: resolvidas.map((p) => ({
        nome: p.nome,
        usuario: p.usuario,
        senha: null,
        problema: p.problema,
      })),
    };
  }

  const criadas: PessoaCadastrada[] = [];

  for (const pessoa of resolvidas) {
    const senha = senhaProvisoria();
    const passwordHash = await hashPassword(senha);

    const criado = await db.user.create({
      data: {
        name: pessoa.nome,
        username: pessoa.usuario,
        position: pessoa.cargo ?? undefined,
        unidadeId: params.unidadeId || null,
        departmentId: params.departmentId || null,
        role: "EMPLOYEE",
        passwordHash,
        // Senha gerada por outra pessoa: vale só até o primeiro acesso.
        mustChangePassword: true,
      },
    });

    /*
      Já entra matriculado no que for obrigatório no setor dele, igual ao
      cadastro individual.

      Não é detalhe: sem isto, sessenta pessoas cadastradas em lote nasceriam
      fora dos treinamentos obrigatórios do próprio departamento, e a tela de
      Conformidade as mostraria em dia — porque não deveriam nada a ninguém. O
      relatório que a auditoria olha ficaria correto e vazio ao mesmo tempo.
    */
    await sincronizarUsuario(criado.id, params.adminId);

    criadas.push({
      nome: pessoa.nome,
      usuario: pessoa.usuario,
      senha,
      problema: null,
    });
  }

  /*
    Um registro para o lote, e não um por pessoa: o que interessa na auditoria
    é "fulano cadastrou a equipe de tal hotel". Sessenta linhas iguais
    afogariam o histórico.

    A senha provisória NÃO entra — o histórico é permanente e vai para todo
    backup, enquanto a senha é de uso único e já está na tela de quem
    cadastrou. É a mesma decisão de `createEmployee`.
  */
  await logAdminActivity({
    adminId: params.adminId,
    action: "CRIAR_FUNCIONARIOS_EM_LOTE",
    targetType: "User",
    details: `${criadas.length}: ${criadas.map((p) => p.usuario).join(", ")}`.slice(0, 1000),
  });

  return { ok: true, pessoas: criadas };
}
