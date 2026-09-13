/**
 * Lembretes automáticos de treinamento obrigatório.
 *
 * A Conformidade já sabe, nome a nome, quem está vencendo e quem está
 * atrasado. Só que ela é uma TELA: fica parada até alguém lembrar de abrir.
 * Treinamento vencido não avisa que venceu, e o custo disso aparece na
 * auditoria, não no dia a dia.
 *
 * Aqui a cobrança sai sozinha. A rotina roda por agendador (ver
 * `/api/tarefas`), lê a mesma conta da Conformidade — a MESMA função, não uma
 * cópia — e transforma cada pendência num aviso.
 *
 * Três decisões que valem explicar:
 *
 *  - **Nada de rematrícula automática.** `lib/reciclagem` explica por quê:
 *    resetar o progresso apagaria o certificado, que é justamente o papel que
 *    a auditoria pede. Esta rotina AVISA; refazer a matrícula continua sendo
 *    ato de quem administra.
 *  - **Um aviso por estágio, não por execução.** O agendador repete; sem
 *    memória, a mesma pendência viraria um aviso por dia até virar ruído que
 *    se aprende a ignorar. `LembreteEnviado` guarda o que já saiu, com a chave
 *    (pessoa, curso, estágio) — "vencendo" e "atrasado" são notícias
 *    diferentes e cada uma passa uma vez.
 *  - **E-mail sai sozinho; WhatsApp entra numa fila.** Não há API de WhatsApp
 *    aqui, e isso é deliberado no projeto (ver `lib/whatsapp`). Quem tem
 *    e-mail confirmado recebe na hora; o resto — a maioria desta rede — vira
 *    uma lista de links `wa.me` prontos para alguém disparar. Fingir que o
 *    WhatsApp é automático seria pior do que assumir que ele é manual.
 */
import { db } from "@/lib/db";
import { levantarObrigacoes, type Situacao } from "@/lib/conformidade";
import { emailDeLembreteDeTreinamento, enderecoPublico, enviarEmail } from "@/lib/email";
import { linkDeWhatsApp, mensagemDePrazo } from "@/lib/whatsapp";

/** Os dois estágios que geram aviso. "em_dia" e "pendente" não devem nada. */
export type EstagioDeLembrete = "vencendo" | "atrasado";

export type PendenciaDeLembrete = {
  userId: string;
  courseId: string;
  estagio: EstagioDeLembrete;
  /** Negativo quando o prazo já passou. Nulo quando não há prazo. */
  diasRestantes: number | null;
};

/** A chave que impede o mesmo aviso de sair duas vezes. */
export function chaveDoLembrete(userId: string, courseId: string, estagio: string): string {
  return `${userId}|${courseId}|${estagio}`;
}

/**
 * Quais obrigações merecem aviso agora, descontando o que já foi avisado.
 *
 * Pura, e é onde mora toda a decisão — o resto do módulo é banco e envio. Por
 * isso dá para exercitar a virada de um prazo e a repetição do agendador em
 * teste, sem relógio real e sem caixa de e-mail.
 */
export function selecionarLembretes(
  linhas: { userId: string; courseId: string; situacao: Situacao; diasRestantes: number | null }[],
  jaEnviados: Set<string>
): PendenciaDeLembrete[] {
  const escolhidas: PendenciaDeLembrete[] = [];

  for (const linha of linhas) {
    if (linha.situacao !== "vencendo" && linha.situacao !== "atrasado") continue;

    const estagio: EstagioDeLembrete = linha.situacao;
    if (jaEnviados.has(chaveDoLembrete(linha.userId, linha.courseId, estagio))) continue;

    escolhidas.push({
      userId: linha.userId,
      courseId: linha.courseId,
      estagio,
      diasRestantes: linha.diasRestantes,
    });
  }

  return escolhidas;
}

export type ItemDaFilaDeWhatsApp = {
  nome: string;
  telefone: string | null;
  curso: string;
  estagio: EstagioDeLembrete;
  /** Link `wa.me` pronto, ou nulo quando a pessoa não tem telefone. */
  link: string | null;
};

export type RelatorioDeLembretes = {
  quando: string;
  /** Quantas obrigações a Conformidade devolveu nesta passagem. */
  avaliadas: number;
  /** Quantos avisos novos esta execução decidiu disparar. */
  novos: number;
  porEmail: number;
  naFila: number;
  semCanal: number;
  fila: ItemDaFilaDeWhatsApp[];
};

/**
 * Roda a passagem de lembretes.
 *
 * Idempotente dentro de cada estágio: chamar duas vezes seguidas não manda o
 * mesmo aviso duas vezes, porque a segunda encontra o registro da primeira.
 * É o que permite o agendador ser generoso na frequência sem virar spam.
 */
export async function dispararLembretes(agora = new Date()): Promise<RelatorioDeLembretes> {
  const { linhas } = await levantarObrigacoes({}, agora);

  const registrados = await db.lembreteEnviado.findMany({
    select: { userId: true, courseId: true, estagio: true },
  });
  const jaEnviados = new Set(
    registrados.map((r) => chaveDoLembrete(r.userId, r.courseId, r.estagio))
  );

  const escolhidas = selecionarLembretes(linhas, jaEnviados);

  const relatorio: RelatorioDeLembretes = {
    quando: agora.toISOString(),
    avaliadas: linhas.length,
    novos: escolhidas.length,
    porEmail: 0,
    naFila: 0,
    semCanal: 0,
    fila: [],
  };

  if (escolhidas.length === 0) return relatorio;

  // Nome, e-mail e telefone só das pessoas que vão ser avisadas; título só dos
  // cursos que entram no aviso. Mesma economia da Conformidade.
  const pessoas = new Map(
    (
      await db.user.findMany({
        where: { id: { in: [...new Set(escolhidas.map((e) => e.userId))] } },
        select: { id: true, name: true, email: true, telefone: true },
      })
    ).map((p) => [p.id, p])
  );
  const cursos = new Map(
    (
      await db.course.findMany({
        where: { id: { in: [...new Set(escolhidas.map((e) => e.courseId))] } },
        select: { id: true, title: true },
      })
    ).map((c) => [c.id, c])
  );

  for (const pendencia of escolhidas) {
    const pessoa = pessoas.get(pendencia.userId);
    const curso = cursos.get(pendencia.courseId);
    if (!pessoa || !curso) continue; // apagado entre uma consulta e outra

    let canal: "EMAIL" | "WHATSAPP_PENDENTE" = "WHATSAPP_PENDENTE";

    if (pessoa.email) {
      const envio = await enviarEmail(
        emailDeLembreteDeTreinamento({
          nome: pessoa.name,
          email: pessoa.email,
          curso: curso.title,
          estagio: pendencia.estagio,
          diasRestantes: pendencia.diasRestantes,
        })
      );
      if (envio.enviado) {
        canal = "EMAIL";
        relatorio.porEmail += 1;
      }
    }

    if (canal === "WHATSAPP_PENDENTE") {
      const mensagem = mensagemDePrazo({
        nome: pessoa.name,
        curso: curso.title,
        diasRestantes: pendencia.diasRestantes,
        endereco: enderecoPublico(),
      });

      relatorio.fila.push({
        nome: pessoa.name,
        telefone: pessoa.telefone,
        curso: curso.title,
        estagio: pendencia.estagio,
        link: pessoa.telefone ? linkDeWhatsApp(pessoa.telefone, mensagem) : null,
      });

      if (pessoa.telefone) relatorio.naFila += 1;
      else relatorio.semCanal += 1;
    }

    /*
      Registrado mesmo quando não houve canal nenhum.

      Sem isso, quem não tem e-mail nem telefone reapareceria na fila a cada
      execução, para sempre, empurrando para fora quem dá para alcançar. A
      pendência continua visível na Conformidade, que é a tela feita para ela.
    */
    await db.lembreteEnviado.create({
      data: {
        userId: pendencia.userId,
        courseId: pendencia.courseId,
        estagio: pendencia.estagio,
        canal,
      },
    });
  }

  return relatorio;
}
