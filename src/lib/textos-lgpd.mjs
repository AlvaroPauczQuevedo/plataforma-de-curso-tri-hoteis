/**
 * Os textos de LGPD que o sistema mostra ao titular — fonte única.
 *
 * ---
 *
 * **Por que um módulo só, e por que `.mjs`.**
 *
 * Estes textos aparecem em dois lugares: nas telas da plataforma e no anexo do
 * Registro de Operações, que vai à revisão jurídica. Se fossem duas cópias, a
 * revisão perderia o sentido no dia em que uma mudasse — o advogado aprovaria
 * um texto e o funcionário leria outro, e ninguém notaria, porque nada quebra.
 *
 * `.mjs` e não `.ts` porque o gerador do registro é JavaScript puro: ele roda
 * no servidor, onde o `tsx` não existe (mesma razão do `backup.mjs`). Um
 * módulo sem imports e sem tipos é o que os dois conseguem ler.
 *
 * ---
 *
 * **Texto simples, sem marcação.** Ênfase e links são decisão de apresentação,
 * e ficam na tela. O que está aqui é o conteúdo — que é o que se revisa e o que
 * se aprova.
 */

/* ----------------------------------------------------------- encarregado */

/**
 * O canal do encarregado (Art. 41, §2º, I).
 *
 * Vem do ambiente porque muda sem publicação: trocar o responsável não deveria
 * exigir alterar código. Sem configuração, o sistema aponta um canal que
 * existe — o setor de treinamento — em vez de mostrar espaço em branco.
 */
export function encarregado() {
  const nome = process.env.ENCARREGADO_NOME?.trim() || null;
  const email = process.env.ENCARREGADO_EMAIL?.trim() || null;
  const whatsapp = process.env.ENCARREGADO_WHATSAPP?.trim() || null;

  if (!nome && !email && !whatsapp) return null;
  return { nome, email, whatsapp };
}

/** Uma linha só, para o documento e para o rodapé da tela. */
export function encarregadoEmUmaLinha() {
  const e = encarregado();
  if (!e) return null;

  const canais = [e.email, e.whatsapp].filter(Boolean).join(" · ");
  return e.nome ? `${e.nome}${canais ? ` — ${canais}` : ""}` : canais;
}

/* ------------------------------------------------- aviso de privacidade */

export const AVISO_TITULO = "Aviso de privacidade";

export const AVISO_SUBTITULO =
  "Como a Academia Corporativa trata os seus dados pessoais, conforme a Lei Geral de " +
  "Proteção de Dados (Lei 13.709/2018).";

/**
 * O aviso, seção a seção.
 *
 * `paragrafos` é texto corrido; `itens` é lista. A tela decide como exibir.
 */
export const AVISO_SECOES = [
  {
    titulo: "Quem trata os seus dados",
    paragrafos: [
      "A rede Tri Hotéis é a controladora: é ela quem decide quais dados são coletados " +
        "nesta plataforma e para quê.",
    ],
  },
  {
    titulo: "O que coletamos",
    paragrafos: ["Apenas o necessário para registrar o seu treinamento:"],
    itens: [
      "Identificação: nome, nome de usuário, cargo, departamento e hotel.",
      "Contato, se você quiser informar: e-mail pessoal e telefone. Os dois são " +
        "opcionais — não informar não impede o seu acesso.",
      "Treinamento: cursos atribuídos, progresso, notas de prova, certificados e presenças.",
      "Uso da plataforma: data e hora das entradas, e o endereço de rede (IP) no momento " +
        "de aceitar um documento ou marcar presença.",
    ],
    depois: [
      "Não coletamos CPF, RG, data de nascimento, dados de saúde, biometria, dados " +
        "financeiros nem a sua localização.",
    ],
  },
  {
    titulo: "Por que tratamos, e com que base legal",
    itens: [
      "Treinamentos obrigatórios — porque a legislação exige que a empresa capacite os " +
        "seus profissionais e comprove que o fez (Art. 7º, II da LGPD).",
      "Sua conta, progresso e certificados — para executar o contrato de trabalho " +
        "(Art. 7º, V).",
      "Registros de acesso — para segurança da plataforma e para você mesma poder " +
        "conferir o seu histórico.",
      "E-mail e telefone — com o seu consentimento (Art. 7º, I), que você pode retirar a " +
        "qualquer momento apagando o campo em Meu perfil.",
    ],
  },
  {
    titulo: "Quem vê os seus dados",
    paragrafos: [
      "O setor de treinamento e os administradores do seu departamento. Um administrador " +
        "de um setor não alcança as contas de outro.",
      "Os dados não são vendidos nem compartilhados com terceiros para fins comerciais. " +
        "Comprovantes de treinamento podem ser apresentados a auditorias e à fiscalização " +
        "do trabalho — que é a razão de eles existirem.",
    ],
  },
  {
    titulo: "Por quanto tempo guardamos",
    paragrafos: [
      "Registros de treinamento são mantidos enquanto forem necessários para comprovar o " +
        "cumprimento das normas — inclusive depois de um desligamento, conforme a lei " +
        "autoriza (Art. 16, I).",
      "Dados de uso têm prazo menor: tentativas de login são descartadas em 24 horas, e o " +
        "endereço de rede registrado em aceites e presenças é apagado do registro depois " +
        "do prazo definido, preservando o aceite em si.",
    ],
  },
  {
    titulo: "Seus direitos",
    paragrafos: ["O Art. 18 da LGPD garante a você, e esta plataforma atende:"],
    itens: [
      "Ver tudo que temos sobre você — na tela Meus dados, sem precisar pedir a ninguém.",
      "Levar os seus dados — o botão naquela mesma tela exporta tudo em arquivo.",
      "Corrigir — nome, e-mail e telefone em Meu perfil; o resto, pelo setor de treinamento.",
      "Saber com quem compartilhamos — está descrito acima.",
    ],
    depois: [
      "Sobre apagar: registros de treinamento obrigatório não podem ser eliminados " +
        "enquanto servirem de prova do cumprimento da norma — é o limite que o próprio " +
        "Art. 16, I estabelece. Pedidos de exclusão são analisados, e a recusa, quando " +
        "houver, é justificada a você.",
    ],
  },
  {
    titulo: "Como a plataforma protege",
    itens: [
      "Sua senha é guardada cifrada e de forma irreversível — ninguém a lê, nem os " +
        "administradores.",
      "O acesso é bloqueado temporariamente após tentativas seguidas de senha errada.",
      "Arquivos e certificados só abrem para quem está autenticado.",
      "Toda ação administrativa sobre a sua conta fica registrada.",
    ],
  },
];

export const AVISO_RODAPE =
  "Este aviso descreve o funcionamento atual da plataforma. Ele é revisto sempre que o " +
  "tratamento mudar.";

/** O bloco de contato, que muda conforme o encarregado esteja indicado. */
export function avisoContato() {
  const linha = encarregadoEmUmaLinha();
  return linha
    ? `Dúvidas ou pedidos sobre os seus dados: ${linha}.`
    : "Dúvidas ou pedidos sobre os seus dados: procure o setor de treinamento ou o seu " +
        "gestor, que encaminham ao responsável.";
}

/* -------------------------------------- outros textos de LGPD do sistema */

export const TEXTO_MEUS_DADOS_INTRO =
  "Tudo que esta plataforma guarda sobre você. É seu direito ver e levar (Lei Geral de " +
  "Proteção de Dados, Art. 18).";

export const TEXTO_MEUS_DADOS_SENHA =
  "Sua senha é guardada de forma cifrada e irreversível — nem os administradores " +
  "conseguem lê-la. Se você esquecer, ela é substituída, nunca recuperada.";

export const TEXTO_MEUS_DADOS_EXCLUSAO =
  "Registros de treinamento obrigatório não podem ser apagados enquanto você estiver na " +
  "empresa: eles são a prova de que a empresa cumpriu a norma, e a lei exige que sejam " +
  "mantidos (LGPD, Art. 16, I).";

export const TEXTO_AVISO_EXPEDIENTE =
  "Este é um treinamento obrigatório, e você está fora do horário de trabalho. " +
  "Treinamento obrigatório deve ser feito durante a sua jornada — se você está em turno " +
  "agora, siga normalmente. Na dúvida, fale com o seu gestor antes de continuar.";

/**
 * Onde cada texto aparece — usado no anexo do Registro de Operações.
 *
 * É a lista que o jurídico revisa: são as afirmações que a plataforma faz ao
 * titular, e é por elas que a empresa responde.
 */
/**
 * O termo que quem anexa comprovante de habilitação de instrutor aceita.
 *
 * Mora aqui, com os demais textos de responsabilidade, porque é dos mais
 * pesados que a plataforma apresenta: quem clica assume consequências civis,
 * administrativas, fiscais e penais. Precisa estar sob a mesma revisão.
 *
 * Cada habilitação grava este texto POR EXTENSO no banco, no momento do
 * aceite: ele pode ser reescrito amanhã, e numa disputa o que vale é o que a
 * pessoa leu quando clicou.
 */
export const TERMO_DE_HABILITACAO =
  "Declaro que o comprovante anexado é autêntico e está vigente, e que a pessoa " +
  "nele identificada possui a habilitação legal exigida para aplicar este " +
  "treinamento. Estou ciente de que a apresentação de documento falso ou " +
  "adulterado é de minha inteira responsabilidade, nas esferas civil, " +
  "administrativa, fiscal e penal, e de que este registro — com meu nome, data e " +
  "origem do acesso — constitui prova dessa declaração.";

export const TEXTOS_DO_SISTEMA = [
  { onde: "Tela 'Meus dados' — abertura", texto: TEXTO_MEUS_DADOS_INTRO },
  { onde: "Tela 'Meus dados' — sobre a senha", texto: TEXTO_MEUS_DADOS_SENHA },
  { onde: "Tela 'Meus dados' — sobre exclusão", texto: TEXTO_MEUS_DADOS_EXCLUSAO },
  { onde: "Tela do curso — fora do expediente", texto: TEXTO_AVISO_EXPEDIENTE },
];
