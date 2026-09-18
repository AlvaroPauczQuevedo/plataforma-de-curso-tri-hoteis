/**
 * Retenção de dados pessoais: o que se apaga, o que se anonimiza, e quando.
 *
 * A LGPD manda encerrar o tratamento quando a finalidade se exaure (Art. 15) e
 * eliminar o dado, salvo as exceções do Art. 16 — entre elas, cumprir obrigação
 * legal. Guardar para sempre "porque não custa nada" é justamente o que a lei
 * não admite.
 *
 * ---
 *
 * **Por que isto nasce DESLIGADO.**
 *
 * Apagar dado pessoal é irreversível, e o prazo de cada tipo é uma decisão
 * JURÍDICA, não técnica. Ligar por padrão seria eu escolhendo, pelo código,
 * por quanto tempo a empresa guarda a prova de que treinou alguém — e errar
 * para baixo destrói a evidência que a auditoria pede, o que é pior do que
 * guardar demais.
 *
 * Então: o mecanismo existe, os prazos são configuráveis, e nada roda até
 * `RETENCAO_ATIVA=true`. Antes disso, `dias` ainda vale para o RELATÓRIO —
 * dá para ver quanto seria apagado sem apagar nada. Ver `executarRetencao`.
 *
 * ---
 *
 * **Apagar não é a única saída.**
 *
 * O IP gravado num aceite de documento é dado pessoal, mas o ACEITE é prova de
 * conformidade e precisa sobreviver. Nesse caso a regra é `anonimizar`: some o
 * IP, fica o registro. O Art. 12 diz que dado anonimizado deixa de ser dado
 * pessoal — é o melhor dos dois lados, e some só o que não tinha mais
 * finalidade.
 *
 * As decisões de prazo estão em `docs/lgpd.md`, com o motivo de cada uma.
 */
import { db } from "@/lib/db";

/** Liga o expurgo. Sem isto, tudo roda em modo simulação. */
export function retencaoAtiva(): boolean {
  return process.env.RETENCAO_ATIVA === "true";
}

function diasDoAmbiente(variavel: string, padrao: number): number {
  const bruto = Number(process.env[variavel]);
  // Zero ou negativo desligaria o prazo em silêncio; o padrão é mais seguro.
  return Number.isInteger(bruto) && bruto > 0 ? bruto : padrao;
}

export type AcaoDeRetencao = "apagar" | "anonimizar";

export type RegraDeRetencao = {
  /** Como a regra aparece no relatório. */
  nome: string;
  dias: number;
  acao: AcaoDeRetencao;
  /** O motivo do prazo, para quem ler o relatório entender a escolha. */
  porque: string;
};

/**
 * As regras, com os prazos-padrão.
 *
 * **Todos precisam de confirmação do jurídico.** Os padrões abaixo são o que
 * consigo defender tecnicamente, não uma decisão legal:
 *
 * - **180 dias para registro de acesso** é o prazo que o Marco Civil da
 *   Internet (Lei 12.965/2014, Art. 15) fixa para registros de aplicação. Não
 *   é certo que ele alcance uma plataforma interna, mas adotá-lo resolve a
 *   dúvida pelo lado seguro: atende quem entenda que alcança, e é curto o
 *   bastante para não guardar histórico de navegação de ninguém por anos.
 *
 * - **5 anos para a trilha administrativa** porque ela é o registro de QUEM
 *   fez o quê com a conta dos outros — é a prova de responsabilização do
 *   Art. 6º, X, e a que responde "quem apagou o certificado dessa pessoa?".
 *   O horizonte acompanha a prescrição trabalhista.
 *
 * - **180 dias para o IP** de aceite e de presença, ANONIMIZANDO. O IP ali é
 *   evidência de origem no momento do ato; passado o período em que uma
 *   contestação é plausível, ele não tem mais finalidade — mas o aceite e a
 *   presença continuam valendo como prova, e são mantidos.
 *
 * O que NÃO tem regra aqui, deliberadamente: progresso, certificado, conclusão
 * externa e matrícula. São a prova de que a pessoa foi treinada, e o Art. 16, I
 * autoriza conservá-los para cumprir obrigação legal — as NRs e a fiscalização
 * trabalhista. Apagá-los por prazo seria destruir exatamente o que a plataforma
 * existe para provar.
 */
export function regrasDeRetencao(): RegraDeRetencao[] {
  return [
    {
      nome: "Registros de acesso (AccessLog)",
      dias: diasDoAmbiente("RETENCAO_ACESSO_DIAS", 180),
      acao: "apagar",
      porque: "Marco Civil, Art. 15 — 6 meses é o piso defensável.",
    },
    {
      nome: "Trilha administrativa (AdminActivityLog)",
      dias: diasDoAmbiente("RETENCAO_ATIVIDADE_DIAS", 1825),
      acao: "apagar",
      porque: "Responsabilização (Art. 6º, X) e prescrição trabalhista.",
    },
    {
      nome: "IP nos aceites de documento",
      dias: diasDoAmbiente("RETENCAO_IP_DIAS", 180),
      acao: "anonimizar",
      porque: "O aceite é prova e fica; o IP perde a finalidade.",
    },
    {
      nome: "IP nas listas de presença",
      dias: diasDoAmbiente("RETENCAO_IP_DIAS", 180),
      acao: "anonimizar",
      porque: "A presença é prova e fica; o IP perde a finalidade.",
    },
  ];
}

/* ------------------------------------------------------------ regra pura */

/** A data-limite de um prazo: o que for mais antigo que ela está vencido. */
export function limiteDe(agora: Date, dias: number): Date {
  return new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000);
}

export type LinhaDoRelatorio = {
  nome: string;
  acao: AcaoDeRetencao;
  dias: number;
  porque: string;
  /** Quantos registros estão vencidos. */
  alcancados: number;
  /** `false` em simulação: nada foi tocado. */
  aplicado: boolean;
};

export type RelatorioDeRetencao = {
  quando: Date;
  ativa: boolean;
  linhas: LinhaDoRelatorio[];
  totalAlcancado: number;
};

/**
 * Resume o relatório numa frase.
 *
 * Existe para o log da rotina e para a tela: em simulação, a frase precisa
 * deixar claro que NADA foi apagado, senão quem lê o log acha que foi.
 */
export function resumoDaRetencao(relatorio: RelatorioDeRetencao): string {
  if (relatorio.totalAlcancado === 0) {
    return relatorio.ativa
      ? "Nada vencido: não havia o que expurgar."
      : "Nada vencido (simulação: RETENCAO_ATIVA está desligada).";
  }

  const registros = `${relatorio.totalAlcancado} registro(s)`;
  return relatorio.ativa
    ? `${registros} expurgado(s) ou anonimizado(s).`
    : `${registros} VENCIDO(S), e nada foi tocado — RETENCAO_ATIVA está desligada. ` +
        "Confirme os prazos com o jurídico antes de ligar.";
}

/* --------------------------------------------------------- o expurgo */

/**
 * Conta e, se ligado, aplica.
 *
 * Contar SEMPRE, aplicar só com a chave ligada: é o que permite rodar a rotina
 * em produção durante semanas e ver o que ela faria, antes de deixá-la apagar
 * qualquer coisa. O relatório é idêntico nos dois modos, menos o `aplicado`.
 */
export async function executarRetencao(agora = new Date()): Promise<RelatorioDeRetencao> {
  const ativa = retencaoAtiva();
  const [acesso, atividade, ipAceite, ipPresenca] = regrasDeRetencao();

  const linhas: LinhaDoRelatorio[] = [];

  /* --- registros de acesso: apagar */
  {
    const onde = { createdAt: { lt: limiteDe(agora, acesso.dias) } };
    const alcancados = await db.accessLog.count({ where: onde });
    if (ativa && alcancados > 0) await db.accessLog.deleteMany({ where: onde });
    linhas.push({ ...acesso, alcancados, aplicado: ativa && alcancados > 0 });
  }

  /* --- trilha administrativa: apagar */
  {
    const onde = { createdAt: { lt: limiteDe(agora, atividade.dias) } };
    const alcancados = await db.adminActivityLog.count({ where: onde });
    if (ativa && alcancados > 0) await db.adminActivityLog.deleteMany({ where: onde });
    linhas.push({ ...atividade, alcancados, aplicado: ativa && alcancados > 0 });
  }

  /*
    --- IP dos aceites: anonimizar, preservando o aceite.

    `ip: ""` e não `null`: a coluna é obrigatória com padrão vazio, e o vazio já
    é o valor de "não registrado" no resto do sistema. Trocar por texto do tipo
    "anonimizado" faria a tela exibir isso como se fosse uma origem.
  */
  {
    const onde = { aceitoEm: { lt: limiteDe(agora, ipAceite.dias) }, NOT: { ip: "" } };
    const alcancados = await db.aceiteDeDocumento.count({ where: onde });
    if (ativa && alcancados > 0) {
      await db.aceiteDeDocumento.updateMany({ where: onde, data: { ip: "" } });
    }
    linhas.push({ ...ipAceite, alcancados, aplicado: ativa && alcancados > 0 });
  }

  /* --- IP das presenças: idem. Aqui a coluna aceita nulo. */
  {
    const onde = {
      registradaEm: { lt: limiteDe(agora, ipPresenca.dias) },
      NOT: { ip: null },
    };
    const alcancados = await db.presencaEmSessao.count({ where: onde });
    if (ativa && alcancados > 0) {
      await db.presencaEmSessao.updateMany({ where: onde, data: { ip: null } });
    }
    linhas.push({ ...ipPresenca, alcancados, aplicado: ativa && alcancados > 0 });
  }

  return {
    quando: agora,
    ativa,
    linhas,
    totalAlcancado: linhas.reduce((soma, l) => soma + l.alcancados, 0),
  };
}
