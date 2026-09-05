/**
 * Avisos por WhatsApp, sem API e sem custo.
 *
 * Esta rede não tem e-mail corporativo, e o pessoal é opcional — o resultado
 * é que **não existia nenhum caminho até o funcionário**. Nem para entregar
 * senha, nem para cobrar treinamento vencendo. Toda comunicação dependia de
 * alguém lembrar de falar com alguém, pessoalmente.
 *
 * WhatsApp, essa gente tem. E dá para usar sem API oficial, sem aprovação da
 * Meta e sem mensalidade: um link `wa.me` com o texto já montado. Quem
 * administra clica, o WhatsApp abre com a mensagem pronta, ele confere e
 * envia. Funciona do celular dele, no corredor do hotel.
 *
 * É deliberadamente MANUAL. Um envio automático em massa exigiria a API paga
 * (ou uma biblioteca não oficial, que derruba o número da empresa), e para
 * algumas dezenas de pessoas o clique resolve. O que não existia era o
 * caminho — não a automação dele.
 */

/** Faixa válida de DDD no Brasil. Não existe 10, nem 00 a 09. */
const DDD_MINIMO = 11;
const DDD_MAXIMO = 99;

/**
 * Reduz o que foi digitado a dígitos com DDI: `5541999999999`.
 *
 * Aceita de bom grado o que uma pessoa escreve — `(41) 99999-9999`,
 * `+55 41 99999 9999`, `041 999999999` — porque recusar formatação obrigaria
 * quem cadastra a digitar tudo colado, dezenas de vezes.
 *
 * Guardar normalizado é o que permite montar o link sem depender de como cada
 * um preencheu: o `wa.me` só aceita dígitos.
 */
export function normalizarTelefone(bruto: string): string {
  let digitos = (bruto ?? "").replace(/\D/g, "");

  // "041" e "0041": o zero de operadora não entra em número internacional.
  digitos = digitos.replace(/^0+/, "");

  // Já veio com o DDI: separa para validar o que sobra como número nacional.
  if (digitos.length > 11 && digitos.startsWith("55")) {
    digitos = digitos.slice(2);
  }

  return digitos ? `55${digitos}` : "";
}

/**
 * `null` quando o número serve; a mensagem para a tela quando não serve.
 *
 * Recebe o valor JÁ normalizado. Confere só o que é objetivamente errado —
 * tamanho e DDD —, sem exigir que seja celular: número fixo com WhatsApp
 * Business existe, e recusá-lo bloquearia um caso legítimo. Se o número não
 * tiver WhatsApp, o link abre avisando, e ninguém se machuca.
 */
export function motivoDeTelefoneInvalido(telefone: string): string | null {
  if (!telefone) return "Informe o telefone.";
  if (!telefone.startsWith("55")) return "O número precisa ser brasileiro.";

  const nacional = telefone.slice(2);

  if (nacional.length < 10) {
    return "Número curto demais. Informe com DDD, por exemplo (41) 99999-9999.";
  }
  if (nacional.length > 11) {
    return "Número longo demais. Confira os dígitos.";
  }

  const ddd = Number(nacional.slice(0, 2));
  if (ddd < DDD_MINIMO || ddd > DDD_MAXIMO) {
    return `DDD inválido (${nacional.slice(0, 2)}). Informe com DDD, por exemplo (41) 99999-9999.`;
  }

  return null;
}

/**
 * Como o número aparece na tela: `(41) 99999-9999`.
 *
 * O que é guardado é bom para máquina e ruim para gente. Quem confere um
 * cadastro precisa reconhecer o número de bate-pronto, e `5541999999999` não
 * se lê — é assim que um dígito errado passa despercebido.
 */
export function formatarTelefone(telefone: string | null | undefined): string {
  if (!telefone) return "—";
  const nacional = telefone.startsWith("55") ? telefone.slice(2) : telefone;

  if (nacional.length === 11) {
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 7)}-${nacional.slice(7)}`;
  }
  if (nacional.length === 10) {
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 6)}-${nacional.slice(6)}`;
  }
  return telefone;
}

/**
 * O link que abre a conversa com o texto pronto.
 *
 * `wa.me` é o endereço oficial do WhatsApp para isto, e funciona tanto no
 * aplicativo do celular quanto no WhatsApp Web — o administrador usa de onde
 * estiver, sem instalar nada.
 */
export function linkDeWhatsApp(telefone: string, mensagem: string): string {
  return `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`;
}

/* ------------------------------------------------------------- mensagens */

/**
 * Entrega de acesso, com a senha.
 *
 * Só pode ser montada no instante em que a senha existe — no cadastro ou logo
 * depois de uma redefinição. Ela não é recuperável depois, e é justamente por
 * isso que este atalho vale: hoje a senha aparece uma vez na tela e some, e
 * quem perdeu o papel vira um pedido de redefinição.
 *
 * Mandar senha por WhatsApp não é pior do que o papel que ela substitui: a
 * conversa é cifrada de ponta a ponta, o papel circula pelo balcão. E ela vale
 * até o primeiro acesso, quando a plataforma exige a troca.
 */
export function mensagemDeCredencial(entrada: {
  nome: string;
  username: string;
  senha: string;
  endereco: string;
}): string {
  const primeiroNome = entrada.nome.trim().split(" ")[0];
  return [
    `Oi, ${primeiroNome}! Seu acesso à Academia Corporativa Tri Hotéis está pronto.`,
    ``,
    `Endereço: ${entrada.endereco}`,
    `Usuário: ${entrada.username}`,
    `Senha: ${entrada.senha}`,
    ``,
    `No primeiro acesso a plataforma vai pedir que você crie uma senha sua. Qualquer dúvida, é só chamar.`,
  ].join("\n");
}

/**
 * Cobrança de quem recebeu acesso e não entrou.
 *
 * Vai SEM senha, de propósito: quem manda esta mensagem está olhando a lista
 * de Primeiro acesso, onde a senha original já não existe. Fingir que existe
 * levaria a inventar uma, e uma senha inventada num aviso é pior do que aviso
 * nenhum.
 */
export function mensagemDeLembrete(entrada: {
  nome: string;
  username: string;
  endereco: string;
}): string {
  const primeiroNome = entrada.nome.trim().split(" ")[0];
  return [
    `Oi, ${primeiroNome}! Passando para lembrar do seu treinamento na Academia Corporativa Tri Hotéis.`,
    ``,
    `Endereço: ${entrada.endereco}`,
    `Usuário: ${entrada.username}`,
    ``,
    `Se você não tem mais a senha, me avise que eu gero outra.`,
  ].join("\n");
}

/**
 * Cobrança de treinamento obrigatório com prazo apertado ou vencido.
 */
export function mensagemDePrazo(entrada: {
  nome: string;
  curso: string;
  diasRestantes: number | null;
  endereco: string;
}): string {
  const primeiroNome = entrada.nome.trim().split(" ")[0];

  const situacao =
    entrada.diasRestantes === null
      ? "está pendente"
      : entrada.diasRestantes < 0
        ? `venceu há ${Math.abs(entrada.diasRestantes)} dia(s)`
        : entrada.diasRestantes === 0
          ? "vence hoje"
          : `vence em ${entrada.diasRestantes} dia(s)`;

  return [
    `Oi, ${primeiroNome}! O treinamento "${entrada.curso}" ${situacao}.`,
    ``,
    `Acesse em ${entrada.endereco} para concluir.`,
    ``,
    `Se precisar de ajuda para entrar, me chame.`,
  ].join("\n");
}
