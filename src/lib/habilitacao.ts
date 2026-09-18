/**
 * Habilitação do instrutor: quem aplica o treinamento pode aplicá-lo?
 *
 * ---
 *
 * **O risco que isto fecha.**
 *
 * A plataforma emite "CERTIFICADO DE CONCLUSÃO" e a empresa o apresenta à
 * fiscalização. Se o treinamento exigia instrutor legalmente habilitado e quem
 * o aplicou não era, o certificado não prova o que afirma — a empresa acredita
 * estar regular, a Conformidade mostra verde, e o buraco só aparece quando
 * alguém cobra. Que é tarde, e é o pior momento possível.
 *
 * A trava é no ato de **publicar**: curso marcado como exigindo habilitação não
 * sai do rascunho sem comprovante anexado e dentro da validade.
 *
 * ---
 *
 * **Por que a responsabilidade é declarada, e não presumida.**
 *
 * A plataforma não tem como verificar se um certificado de instrutor é
 * autêntico — não há cadastro nacional para consultar, e cada conselho tem o
 * seu. Fingir que valida seria pior que não validar: daria segurança falsa a
 * quem confia na tela.
 *
 * Então ela faz a única coisa honesta possível: **exige o documento, registra
 * quem o anexou, e faz essa pessoa declarar por escrito que responde por ele.**
 * Quem anexa documento falso passa a ter nome, data e origem gravados ao lado
 * da declaração que assinou.
 *
 * Isso não impede a fraude. Impede que ela seja anônima — e move a
 * responsabilidade de "a empresa não sabia" para uma pessoa identificada que
 * afirmou saber.
 */

/**
 * O termo que quem anexa o comprovante aceita.
 *
 * Gravado POR EXTENSO em cada habilitação, e não referenciado desta constante:
 * o texto pode ser reescrito amanhã, e numa disputa o que importa é o que a
 * pessoa leu quando clicou. Ver `HabilitacaoDeInstrutor.termoAceito`.
 */
export const TERMO_DE_HABILITACAO =
  "Declaro que o comprovante anexado é autêntico e está vigente, e que a pessoa " +
  "nele identificada possui a habilitação legal exigida para aplicar este " +
  "treinamento. Estou ciente de que a apresentação de documento falso ou " +
  "adulterado é de minha inteira responsabilidade, nas esferas civil, " +
  "administrativa, fiscal e penal, e de que este registro — com meu nome, data e " +
  "origem do acesso — constitui prova dessa declaração.";

export type SituacaoDaHabilitacao = "valida" | "vencida" | "sem_validade";

export type HabilitacaoParaSituacao = {
  validoAte: Date | null;
};

/**
 * Em que estado está um comprovante.
 *
 * `sem_validade` **não** é sinônimo de válido para sempre. É o comprovante em
 * que ninguém declarou prazo, e ele precisa de olho humano: certificado de
 * instrutor e registro profissional costumam vencer, e tratar a ausência de
 * data como "vale sempre" transformaria esquecimento em permissão eterna.
 *
 * Ele ainda **libera** a publicação — recusar travaria comprovante legítimo que
 * de fato não tem prazo —, mas a tela o destaca para conferência.
 */
export function situacaoDaHabilitacao(
  habilitacao: HabilitacaoParaSituacao,
  agora: Date
): SituacaoDaHabilitacao {
  if (habilitacao.validoAte === null) return "sem_validade";
  return habilitacao.validoAte.getTime() > agora.getTime() ? "valida" : "vencida";
}

/** Um comprovante vencido não sustenta publicação. Sem prazo declarado, sim. */
export function habilitacaoSustentaPublicacao(
  habilitacao: HabilitacaoParaSituacao,
  agora: Date
): boolean {
  return situacaoDaHabilitacao(habilitacao, agora) !== "vencida";
}

/**
 * `null` quando o curso pode ser publicado; a mensagem quando não pode.
 *
 * Só bloqueia quando o curso foi **marcado** como exigindo habilitação. A marca
 * é decisão de quem cadastra o curso: a plataforma não tem como saber que
 * "Trabalho em Altura" exige instrutor habilitado e "Atendimento ao Hóspede"
 * não — isso é conhecimento do negócio, não do código.
 */
export function motivoParaNaoPublicar(
  curso: { exigeInstrutorHabilitado: boolean },
  habilitacoes: readonly HabilitacaoParaSituacao[],
  agora: Date
): string | null {
  if (!curso.exigeInstrutorHabilitado) return null;

  if (habilitacoes.length === 0) {
    return (
      "Este treinamento exige instrutor habilitado. Anexe o comprovante de " +
      "habilitação antes de publicar."
    );
  }

  if (!habilitacoes.some((h) => habilitacaoSustentaPublicacao(h, agora))) {
    return (
      "O comprovante de habilitação anexado está vencido. Anexe um vigente " +
      "antes de publicar."
    );
  }

  return null;
}

/**
 * O aviso que a tela mostra sobre um curso JÁ publicado.
 *
 * Diferente de `motivoParaNaoPublicar`, que barra. Aqui o curso já está no ar e
 * o comprovante venceu depois — despublicar sozinho tiraria o treinamento do
 * ar sem ninguém decidir isso, e no meio de uma turma. O certo é avisar alto e
 * deixar a decisão com quem responde pelo curso.
 */
export function avisoDeHabilitacao(
  curso: { exigeInstrutorHabilitado: boolean; publicado: boolean },
  habilitacoes: readonly HabilitacaoParaSituacao[],
  agora: Date
): string | null {
  if (!curso.exigeInstrutorHabilitado || !curso.publicado) return null;

  if (habilitacoes.length === 0) {
    return "Curso publicado SEM comprovante de habilitação do instrutor.";
  }

  const vigentes = habilitacoes.filter((h) => habilitacaoSustentaPublicacao(h, agora));
  if (vigentes.length === 0) {
    return "O comprovante de habilitação VENCEU. Os certificados emitidos a partir de agora podem não ser aceitos.";
  }

  if (vigentes.every((h) => situacaoDaHabilitacao(h, agora) === "sem_validade")) {
    return "O comprovante não tem validade declarada. Confira se ainda está vigente.";
  }

  return null;
}
