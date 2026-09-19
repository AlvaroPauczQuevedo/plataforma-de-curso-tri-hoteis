/**
 * Gera, em PDF, o Registro de Operações de Tratamento de Dados Pessoais.
 *
 * É o documento do Art. 37 da LGPD, que o controlador precisa manter — e é o
 * que o jurídico pede quando pergunta "como vocês tratam os dados?".
 *
 * ---
 *
 * **Por que é um script, e não um arquivo escrito à mão.**
 *
 * Um registro de tratamento desatualizado é pior que nenhum: ele afirma, com
 * aparência de documento oficial, coisas que o sistema deixou de fazer. Os
 * prazos de retenção e a janela de expediente saem daqui LIDOS DO CÓDIGO, pelas
 * mesmas funções que a aplicação usa — então não há como o papel e o sistema
 * discordarem sobre um número.
 *
 * A prosa continua sendo escrita, e é ela que precisa de revisão jurídica.
 *
 * ---
 *
 * JavaScript puro, como o backup, e pelo mesmo motivo operacional: em produção
 * a aplicação roda no build `standalone`, onde o `tsx` não existe. Isto precisa
 * rodar no servidor, com o `node` que já está lá.
 *
 * Uso: node scripts/registro-de-tratamento.mjs [destino.pdf]
 */
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
/*
  Os textos vêm do MESMO módulo que alimenta as telas. É o que faz a revisão
  jurídica valer: o advogado aprova exatamente o que o funcionário lê.
*/
import {
  AVISO_SECOES,
  AVISO_SUBTITULO,
  AVISO_TITULO,
  TERMO_DE_HABILITACAO,
  TEXTOS_DO_SISTEMA,
  avisoContato,
  encarregadoEmUmaLinha,
} from "../src/lib/textos-lgpd.mjs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

/* ------------------------------------------------------------------ estilo */

const LARANJA = rgb(1, 0.416, 0);
const GRAFITE = rgb(0.11, 0.098, 0.09);
const CINZA = rgb(0.4, 0.38, 0.36);
const BORDA = rgb(0.85, 0.83, 0.81);
const REALCE = rgb(0.96, 0.95, 0.94);

const L = 595; // A4 retrato
const A = 842;
const MARGEM = 50;
const UTIL = L - MARGEM * 2;
const RODAPE = 60;

/* ------------------------------------- valores lidos da configuração real */

/**
 * Os prazos, tal como o sistema os aplica.
 *
 * Reimplementado aqui em vez de importado de `src/lib/retencao.ts` porque
 * aquele módulo importa o cliente Prisma, e este script não deve abrir conexão
 * com o banco só para escrever um número. A leitura das variáveis é a mesma; a
 * duplicação é de quatro linhas e está anotada dos dois lados.
 */
function prazos() {
  const dia = (variavel, padrao) => {
    const texto = process.env[variavel]?.trim();
    if (!texto) return padrao;
    const n = Number(texto);
    return Number.isInteger(n) && n > 0 ? n : padrao;
  };

  return {
    ativa: process.env.RETENCAO_ATIVA === "true",
    acesso: dia("RETENCAO_ACESSO_DIAS", 180),
    atividade: dia("RETENCAO_ATIVIDADE_DIAS", 1825),
    ip: dia("RETENCAO_IP_DIAS", 180),
  };
}

function janelaDeExpediente() {
  const hora = (variavel, padrao) => {
    const texto = process.env[variavel]?.trim();
    if (!texto) return padrao;
    const n = Number(texto);
    return Number.isInteger(n) && n >= 0 && n <= 23 ? n : padrao;
  };
  const inicio = hora("EXPEDIENTE_INICIO", 6);
  const fim = hora("EXPEDIENTE_FIM", 22);
  return inicio >= fim ? "de segunda a sábado, das 6h às 22h"
    : `de segunda a sábado, das ${inicio}h às ${fim}h`;
}

const encarregado = encarregadoEmUmaLinha();

/* ---------------------------------------------------------------- conteúdo */

const P = prazos();

const emAnos = (dias) =>
  dias >= 365 ? `${Math.round(dias / 365)} ano(s)` : `${dias} dias`;

const DOCUMENTO = [
  { tipo: "titulo", texto: "1. Identificação" },
  {
    tipo: "campos",
    itens: [
      ["Controladora", "Rede Tri Hotéis"],
      ["Sistema", "Academia Corporativa — plataforma de treinamento corporativo"],
      ["Titulares", "Empregados da rede, ativos e desligados"],
      ["Encarregado", encarregado ?? "A indicar (LGPD, Art. 41)"],
    ],
  },
  {
    tipo: "paragrafo",
    texto:
      "A plataforma registra a capacitação dos empregados da rede: cursos atribuídos, " +
      "progresso, avaliações, certificados, aceite de documentos internos e presença em " +
      "treinamentos aplicados em sala. É de uso exclusivamente interno, sem acesso " +
      "público a dados pessoais.",
  },

  { tipo: "titulo", texto: "2. Finalidades e bases legais" },
  {
    tipo: "paragrafo",
    texto:
      "O tratamento NÃO se apoia em consentimento para as finalidades essenciais. Na " +
      "relação de emprego há subordinação, e o consentimento seria frágil (Art. 5º, XII) " +
      "e revogável a qualquer tempo (Art. 8º, §5º) — bastaria uma revogação para a " +
      "empresa perder a comprovação de treinamento que a legislação a obriga a manter.",
  },
  {
    tipo: "tabela",
    cabecalho: ["Finalidade", "Base legal", "Art. 7º"],
    larguras: [0.46, 0.38, 0.16],
    linhas: [
      ["Treinamento obrigatório por exigência legal ou sanitária", "Cumprimento de obrigação legal e regulatória", "II"],
      ["Conta de acesso, progresso e certificados", "Execução de contrato de trabalho", "V"],
      ["Registros de acesso e trilha de auditoria", "Obrigação legal e legítimo interesse", "II e IX"],
      ["E-mail pessoal e telefone (opcionais)", "Consentimento do titular", "I"],
    ],
  },
  {
    tipo: "paragrafo",
    texto:
      "A última linha é a única em que o consentimento é a base correta, e é colhido como " +
      "tal: os dois campos são opcionais, não condicionam o acesso à plataforma, e o " +
      "e-mail só é gravado após confirmação por link enviado ao próprio endereço. O " +
      "titular pode retirá-los a qualquer momento pela tela de perfil.",
  },

  { tipo: "titulo", texto: "3. Categorias de dados tratados" },
  {
    tipo: "tabela",
    cabecalho: ["Categoria", "Dados"],
    larguras: [0.3, 0.7],
    linhas: [
      ["Identificação", "Nome, nome de usuário, cargo, departamento, hotel, matrícula"],
      ["Contato (opcional)", "E-mail pessoal confirmado, telefone celular"],
      ["Autenticação", "Senha cifrada (bcrypt), data do último acesso, contador de tentativas"],
      ["Treinamento", "Matrículas, progresso por aula, notas, certificados, presenças"],
      ["Uso da plataforma", "Data e hora de entrada; endereço IP em aceites e presenças"],
      ["Imagem", "Fotografia de perfil, quando enviada pelo próprio titular"],
    ],
  },
  {
    tipo: "destaque",
    titulo: "Não há tratamento de dado pessoal sensível",
    texto:
      "A plataforma não coleta CPF, RG, data de nascimento, dados de saúde, biometria, " +
      "filiação sindical, origem racial, convicção religiosa, opinião política, dados " +
      "financeiros ou geolocalização. Nenhuma das categorias do Art. 5º, II é tratada. " +
      "A fotografia de perfil não é utilizada para identificação biométrica e, por isso, " +
      "não constitui dado biométrico. Em consequência, não incidem as regras específicas " +
      "dos Art. 11 a 13.",
  },

  { tipo: "titulo", texto: "4. Compartilhamento" },
  {
    tipo: "paragrafo",
    texto:
      "Os dados não são vendidos nem compartilhados com terceiros para fins comerciais. " +
      "O acesso interno é limitado: administradores alcançam apenas as contas dos " +
      "departamentos sob sua responsabilidade, e a regra é aplicada no servidor, não " +
      "apenas na interface.",
  },
  {
    tipo: "paragrafo",
    texto:
      "Comprovantes de treinamento podem ser apresentados a auditorias e à fiscalização " +
      "do trabalho — finalidade que justifica a própria existência do registro.",
  },
  {
    tipo: "pendencia",
    texto:
      "TRANSFERÊNCIA INTERNACIONAL (Art. 33): a aplicação é hospedada em provedor com " +
      "centros de dados em diferentes países. É necessário confirmar em qual deles o " +
      "servidor da rede está alocado. Se estiver fora do Brasil, incidem os requisitos " +
      "do Art. 33. O provedor de hospedagem atua como operador (Art. 39), o que " +
      "recomenda a guarda do respectivo instrumento contratual.",
  },

  { tipo: "titulo", texto: "5. Prazos de retenção" },
  {
    tipo: "tabela",
    cabecalho: ["Dado", "Prazo", "Ação ao vencer"],
    larguras: [0.5, 0.22, 0.28],
    linhas: [
      ["Tentativas de login (com IP)", "24 horas", "Eliminação"],
      ["Token de redefinição de senha", "1 hora", "Expiração"],
      ["Link de confirmação de e-mail", "24 horas", "Expiração"],
      ["Registros de acesso", emAnos(P.acesso), "Eliminação"],
      ["Registro de ações administrativas", emAnos(P.atividade), "Eliminação"],
      ["IP em aceites e presenças", emAnos(P.ip), "Anonimização"],
    ],
  },
  {
    tipo: "paragrafo",
    texto:
      "A anonimização do endereço IP preserva o aceite e o registro de presença, que são " +
      "prova de conformidade, e elimina apenas o dado pessoal que já não tem finalidade. " +
      "Dado anonimizado deixa de ser dado pessoal (Art. 12).",
  },
  {
    tipo: "paragrafo",
    texto:
      "Registros de treinamento — matrículas, progresso, certificados e conclusões — não " +
      "têm prazo de eliminação. São conservados para cumprimento de obrigação legal, nos " +
      "termos do Art. 16, I: eliminá-los destruiria justamente a comprovação que a " +
      "legislação exige que a empresa mantenha, inclusive após o desligamento.",
  },
  {
    tipo: "paragrafo",
    texto:
      "Dados eliminados da base permanecem nas cópias de segurança até a rotação natural " +
      "destas, por até quatorze dias.",
  },
  P.ativa
    ? {
        tipo: "destaque",
        titulo: "Expurgo automático ATIVO",
        texto: "A rotina diária aplica os prazos acima, eliminando e anonimizando o que vence.",
      }
    : {
        tipo: "pendencia",
        texto:
          "EXPURGO AUTOMÁTICO DESLIGADO. O mecanismo está implementado e roda em modo de " +
          "simulação: identifica e relata o que está vencido, sem eliminar nada. Os prazos " +
          "acima são propostas técnicas e aguardam confirmação jurídica antes da ativação. " +
          "A eliminação é irreversível, e prazo curto demais destrói comprovação exigível.",
      },

  { tipo: "titulo", texto: "6. Medidas de segurança (Art. 46)" },
  {
    tipo: "lista",
    itens: [
      "Senhas armazenadas com bcrypt; em nenhuma hipótese são legíveis, inclusive por administradores.",
      "Tokens de redefinição gravados como resumo criptográfico (SHA-256), não em texto claro.",
      "Bloqueio por tentativas, em duas camadas independentes: por conta e por origem de rede.",
      "Tempo de resposta uniforme no login, impedindo a descoberta de quais contas existem.",
      "Perfil e situação da conta relidos do banco a cada requisição: a revogação de acesso é imediata.",
      "Segregação de acesso por departamento, aplicada no servidor.",
      "Arquivos e certificados acessíveis apenas mediante sessão autenticada.",
      "Exportações em planilha neutralizadas contra injeção de fórmula.",
      "Registro de toda ação administrativa, com autor, alvo, data e origem.",
    ],
  },

  { tipo: "titulo", texto: "7. Direitos do titular (Art. 18)" },
  {
    tipo: "tabela",
    cabecalho: ["Direito", "Como é atendido"],
    larguras: [0.32, 0.68],
    linhas: [
      ["Confirmação e acesso (I, II)", "Tela 'Meus dados': o titular vê tudo que a plataforma guarda sobre ele, sem requerimento"],
      ["Portabilidade (V)", "Exportação em JSON, formato interoperável, na mesma tela"],
      ["Correção (III)", "Nome, e-mail e telefone pelo próprio titular; demais dados pelo setor de treinamento"],
      ["Informação sobre uso compartilhado (VII)", "Descrita no aviso de privacidade, público e acessível sem autenticação"],
      ["Revogação de consentimento (IX)", "Remoção dos campos de e-mail e telefone pelo próprio titular"],
    ],
  },
  {
    tipo: "paragrafo",
    texto:
      "Quanto à eliminação (VI): pedidos são analisados individualmente. Registros de " +
      "treinamento obrigatório não são eliminados enquanto necessários à comprovação do " +
      "cumprimento de obrigação legal, limite reconhecido pelo Art. 16, I e pelo Art. 18, " +
      "§4º. A recusa, quando houver, é fundamentada ao titular.",
  },
  {
    tipo: "subtitulo",
    texto: "7.1. Procedimento de atendimento",
  },
  {
    tipo: "paragrafo",
    texto:
      "A maior parte dos pedidos não chega a virar requerimento: confirmação, acesso e " +
      "portabilidade são atendidos pelo próprio titular, autenticado, na tela 'Meus " +
      "dados'. O procedimento abaixo trata do que sobra.",
  },
  {
    tipo: "tabela",
    cabecalho: ["Etapa", "Como se dá"],
    larguras: [0.26, 0.74],
    linhas: [
      ["Canal", encarregado ? `Encarregado: ${encarregado}` : "Encarregado, quando indicado; até lá, setor de treinamento ou gestor imediato"],
      ["Identificação", "O pedido só é atendido após confirmação de que o requerente é o titular. Pedido recebido por canal não autenticado exige conferência presencial ou por meio já cadastrado"],
      ["Registro", "Todo pedido é registrado com data de entrada, natureza, resposta e data de saída"],
      ["Prazo — acesso", "Imediato em formato simplificado; até 15 dias em declaração completa (Art. 19, I e II)"],
      ["Prazo — demais", "15 dias, contados do recebimento"],
      ["Recusa", "Sempre fundamentada por escrito, com indicação do dispositivo legal, e comunicada ao titular no mesmo prazo"],
    ],
  },
  {
    tipo: "destaque",
    titulo: "A conferência de identidade não é formalidade",
    texto:
      "Entregar a ficha de um empregado a quem se passa por ele é, em si, um incidente de " +
      "segurança — e o requerimento seria a prova de que a entrega foi deliberada. É a " +
      "razão de a tela 'Meus dados' exigir sessão autenticada e ignorar qualquer " +
      "identificador informado na requisição: ela devolve os dados de quem está logado, e " +
      "de mais ninguém.",
  },
  {
    tipo: "pendencia",
    texto:
      "O procedimento acima é proposta técnica, redigida a partir do que o sistema já " +
      "suporta. Depende de aprovação e da designação formal do responsável pelo canal.",
  },

  { tipo: "titulo", texto: "8. Transparência (Art. 9º)" },
  {
    tipo: "paragrafo",
    texto:
      "A plataforma disponibiliza aviso de privacidade em página pública, acessível sem " +
      "autenticação e vinculada à tela de acesso — de modo que possa ser lido antes do " +
      "primeiro ingresso. O aviso informa a controladora, os dados coletados, as " +
      "finalidades e respectivas bases legais, o compartilhamento, os prazos e os " +
      "direitos do titular.",
  },
  {
    tipo: "paragrafo",
    texto:
      "Trata-se de AVISO, e não de termo de consentimento: a página informa, sem colher " +
      "assinatura, em coerência com as bases legais declaradas no item 2.",
  },
  {
    tipo: "pendencia",
    texto:
      "O texto do aviso descreve com fidelidade o funcionamento do sistema, tendo sido " +
      "conferido contra o código. Ainda assim, requer revisão jurídica antes de ser " +
      "considerado peça formal.",
  },

  { tipo: "titulo", texto: "9. Registro de jornada" },
  {
    tipo: "paragrafo",
    texto:
      `A plataforma registra o instante e a duração do estudo. Como treinamento ` +
      `obrigatório constitui tempo à disposição do empregador, foram adotadas duas ` +
      `medidas preventivas: aviso ao titular que inicia treinamento obrigatório fora da ` +
      `janela de expediente (${janelaDeExpediente()}), e painel de conferência para o ` +
      `setor de pessoal identificar e corrigir a prática.`,
  },
  {
    tipo: "paragrafo",
    texto:
      "O painel é expressamente identificado como lista de conferência, e não de " +
      "irregularidades: a rede opera em regime de turnos, e empregados em jornada noturna " +
      "legítima constam da lista.",
  },

  { tipo: "titulo", texto: "10. Habilitação de instrutor" },
  {
    tipo: "paragrafo",
    texto:
      "Cursos que exigem instrutor legalmente habilitado somente são publicados mediante " +
      "anexação de comprovante vigente. O sistema registra quem anexou o documento, a " +
      "data, a origem do acesso e o inteiro teor do termo de responsabilidade aceito, " +
      "pelo qual o declarante assume as consequências civis, administrativas, fiscais e " +
      "penais decorrentes de documento falso ou adulterado.",
  },
  {
    tipo: "paragrafo",
    texto:
      "A plataforma não verifica a autenticidade do documento — inexiste base consultável " +
      "para tanto. A medida não previne a fraude; suprime o seu anonimato.",
  },

  { tipo: "titulo", texto: "11. Anexo — textos apresentados ao titular" },
  {
    tipo: "paragrafo",
    texto:
      "Transcrição literal do que a plataforma informa ao empregado. São as afirmações " +
      "pelas quais a empresa responde, e é sobre elas que incide a revisão jurídica. Os " +
      "textos abaixo são lidos do mesmo módulo que alimenta as telas: não há como o que " +
      "consta aqui divergir do que o titular lê.",
  },
  { tipo: "subtitulo", texto: `11.1. ${AVISO_TITULO} (página pública, sem exigência de login)` },
  { tipo: "citacao", texto: AVISO_SUBTITULO },
  ...AVISO_SECOES.flatMap((secao) => [
    { tipo: "rotulo", texto: secao.titulo },
    ...(secao.paragrafos ?? []).map((t) => ({ tipo: "citacao", texto: t })),
    ...(secao.itens ?? []).map((t) => ({ tipo: "citacao", texto: `— ${t}` })),
    ...(secao.depois ?? []).map((t) => ({ tipo: "citacao", texto: t })),
  ]),
  { tipo: "rotulo", texto: "Fale conosco" },
  { tipo: "citacao", texto: avisoContato() },

  { tipo: "subtitulo", texto: "11.2. Demais avisos nas telas" },
  ...TEXTOS_DO_SISTEMA.flatMap((t) => [
    { tipo: "rotulo", texto: t.onde },
    { tipo: "citacao", texto: t.texto },
  ]),

  { tipo: "subtitulo", texto: "11.3. Termo aceito por quem anexa habilitação de instrutor" },
  { tipo: "citacao", texto: TERMO_DE_HABILITACAO },

  { tipo: "titulo", texto: "12. Pontos pendentes de decisão jurídica" },
  {
    tipo: "lista",
    itens: [
      "Confirmação dos prazos de retenção e autorização para ativar o expurgo automático.",
      "Revisão do texto do aviso de privacidade.",
      "Indicação do encarregado e divulgação do canal de contato (Art. 41).",
      "Aprovação do procedimento de atendimento ao titular proposto no item 7.1.",
      "Confirmação do país de hospedagem e, se for o caso, adequação ao Art. 33.",
      "Guarda do instrumento contratual com o provedor de hospedagem, na condição de operador (Art. 39).",
      "Plano de resposta a incidente de segurança (Art. 48).",
      "Definição do prazo de conservação dos dados de contato após o desligamento.",
    ],
  },
];

/* ------------------------------------------------------------- composição */

function quebrar(texto, fonte, corpo, largura) {
  const palavras = String(texto).split(/\s+/);
  const linhas = [];
  let atual = "";

  for (const palavra of palavras) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (fonte.widthOfTextAtSize(tentativa, corpo) <= largura) {
      atual = tentativa;
    } else {
      if (atual) linhas.push(atual);
      atual = palavra;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

async function gerar() {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const italico = await doc.embedFont(StandardFonts.HelveticaOblique);

  const geradoEm = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  let page;
  let y = 0;
  let numero = 0;

  function rodape() {
    page.drawText(
      "Registro de Operações de Tratamento — Academia Corporativa Tri Hotéis",
      { x: MARGEM, y: 32, size: 7.5, font: regular, color: CINZA }
    );
    const n = String(numero);
    page.drawText(n, {
      x: L - MARGEM - regular.widthOfTextAtSize(n, 7.5),
      y: 32,
      size: 7.5,
      font: regular,
      color: CINZA,
    });
  }

  function novaPagina() {
    if (page) rodape();
    page = doc.addPage([L, A]);
    numero += 1;
    y = A - MARGEM;
  }

  /** Garante espaço; abre página nova quando não cabe. */
  function reservar(altura) {
    if (y - altura < RODAPE) novaPagina();
  }

  function paragrafo(texto, { fonte = regular, corpo = 9.5, cor = GRAFITE, recuo = 0 } = {}) {
    const linhas = quebrar(texto, fonte, corpo, UTIL - recuo);
    for (const linha of linhas) {
      reservar(corpo + 4);
      page.drawText(linha, { x: MARGEM + recuo, y, size: corpo, font: fonte, color: cor });
      y -= corpo + 4;
    }
  }

  novaPagina();

  /* ----- capa */
  page.drawRectangle({ x: 0, y: A - 108, width: L, height: 108, color: GRAFITE });
  page.drawRectangle({ x: 0, y: A - 112, width: L, height: 4, color: LARANJA });

  page.drawText("Registro de Operações de", {
    x: MARGEM, y: A - 48, size: 19, font: bold, color: rgb(1, 1, 1),
  });
  page.drawText("Tratamento de Dados Pessoais", {
    x: MARGEM, y: A - 70, size: 19, font: bold, color: rgb(1, 1, 1),
  });
  page.drawText("Academia Corporativa Tri Hoteis  |  LGPD, Art. 37", {
    x: MARGEM, y: A - 92, size: 9, font: regular, color: rgb(0.78, 0.76, 0.74),
  });

  y = A - 132;
  paragrafo(`Documento gerado em ${geradoEm}.`, { corpo: 8.5, cor: CINZA });
  y -= 6;
  paragrafo(
    "Descreve o tratamento de dados pessoais realizado pela plataforma, com base em " +
      "levantamento técnico do sistema. Os prazos e configurações apresentados são lidos " +
      "da configuração vigente no momento da geração. Os pontos assinalados como " +
      "pendentes dependem de decisão jurídica.",
    { fonte: italico, corpo: 9, cor: CINZA }
  );
  y -= 10;

  /* ----- corpo */
  for (const bloco of DOCUMENTO) {
    if (bloco.tipo === "titulo") {
      reservar(40);
      y -= 10;
      page.drawText(bloco.texto, { x: MARGEM, y, size: 12, font: bold, color: GRAFITE });
      y -= 6;
      page.drawLine({
        start: { x: MARGEM, y },
        end: { x: MARGEM + UTIL, y },
        thickness: 1.2,
        color: LARANJA,
      });
      y -= 14;
      continue;
    }

    if (bloco.tipo === "subtitulo") {
      reservar(30);
      y -= 6;
      page.drawText(bloco.texto, { x: MARGEM, y, size: 10, font: bold, color: GRAFITE });
      y -= 14;
      continue;
    }

    /* Rótulo do trecho citado: diz DE ONDE o texto foi transcrito. */
    if (bloco.tipo === "rotulo") {
      reservar(24);
      y -= 3;
      page.drawText(bloco.texto, { x: MARGEM, y, size: 8.5, font: bold, color: CINZA });
      y -= 12;
      continue;
    }

    /*
      Citação literal: recuada e com barra à esquerda, para o leitor distinguir
      o que a plataforma DIZ do que este documento AFIRMA sobre ela. Num anexo
      de revisão, confundir os dois seria o pior defeito possível.
    */
    if (bloco.tipo === "citacao") {
      const corpo = 8.5;
      const recuo = 14;
      const linhas = quebrar(bloco.texto, italico, corpo, UTIL - recuo - 4);
      const altura = linhas.length * (corpo + 3.5);

      reservar(altura + 6);

      page.drawRectangle({
        x: MARGEM, y: y - altura + 9, width: 2, height: altura, color: LARANJA,
      });
      for (const linha of linhas) {
        page.drawText(linha, {
          x: MARGEM + recuo, y, size: corpo, font: italico, color: GRAFITE,
        });
        y -= corpo + 3.5;
      }
      y -= 5;
      continue;
    }

    if (bloco.tipo === "paragrafo") {
      paragrafo(bloco.texto);
      y -= 6;
      continue;
    }

    if (bloco.tipo === "campos") {
      for (const [rotulo, valor] of bloco.itens) {
        reservar(16);
        page.drawText(`${rotulo}:`, { x: MARGEM, y, size: 9.5, font: bold, color: GRAFITE });
        const largura = bold.widthOfTextAtSize(`${rotulo}: `, 9.5);
        page.drawText(valor, {
          x: MARGEM + largura, y, size: 9.5, font: regular, color: GRAFITE,
        });
        y -= 15;
      }
      y -= 4;
      continue;
    }

    if (bloco.tipo === "lista") {
      for (const item of bloco.itens) {
        reservar(16);
        page.drawText("•", { x: MARGEM + 2, y, size: 9.5, font: regular, color: LARANJA });
        paragrafo(item, { recuo: 14 });
        y -= 3;
      }
      y -= 4;
      continue;
    }

    if (bloco.tipo === "destaque" || bloco.tipo === "pendencia") {
      const ehPendencia = bloco.tipo === "pendencia";
      const corpo = 9;
      const textoLinhas = quebrar(bloco.texto, regular, corpo, UTIL - 24);
      const alturaTitulo = bloco.titulo ? 15 : 0;
      const altura = textoLinhas.length * (corpo + 3.5) + alturaTitulo + 18;

      reservar(altura + 8);

      page.drawRectangle({
        x: MARGEM, y: y - altura + 10, width: UTIL, height: altura,
        color: REALCE, borderColor: ehPendencia ? LARANJA : BORDA, borderWidth: ehPendencia ? 1.2 : 0.8,
      });

      let yInterno = y - 4;
      if (bloco.titulo) {
        page.drawText(bloco.titulo, {
          x: MARGEM + 12, y: yInterno, size: 9.5, font: bold, color: GRAFITE,
        });
        yInterno -= 14;
      }
      for (const linha of textoLinhas) {
        page.drawText(linha, {
          x: MARGEM + 12, y: yInterno, size: corpo, font: regular, color: GRAFITE,
        });
        yInterno -= corpo + 3.5;
      }

      y -= altura + 8;
      continue;
    }

    if (bloco.tipo === "tabela") {
      const corpo = 8.5;
      const colunas = bloco.larguras.map((f) => UTIL * f);

      const desenharCabecalho = () => {
        reservar(26);
        page.drawRectangle({
          x: MARGEM, y: y - 4, width: UTIL, height: 18, color: GRAFITE,
        });
        let x = MARGEM + 6;
        bloco.cabecalho.forEach((titulo, i) => {
          page.drawText(titulo, { x, y: y + 1, size: corpo, font: bold, color: rgb(1, 1, 1) });
          x += colunas[i];
        });
        y -= 22;
      };

      desenharCabecalho();

      for (const linha of bloco.linhas) {
        const celulas = linha.map((texto, i) =>
          quebrar(texto, regular, corpo, colunas[i] - 12)
        );
        const alturaLinha = Math.max(...celulas.map((c) => c.length)) * (corpo + 3) + 7;

        if (y - alturaLinha < RODAPE) {
          novaPagina();
          desenharCabecalho();
        }

        let x = MARGEM + 6;
        celulas.forEach((linhasDaCelula, i) => {
          let yCelula = y;
          for (const texto of linhasDaCelula) {
            page.drawText(texto, { x, y: yCelula, size: corpo, font: regular, color: GRAFITE });
            yCelula -= corpo + 3;
          }
          x += colunas[i];
        });

        y -= alturaLinha;
        page.drawLine({
          start: { x: MARGEM, y: y + 4 },
          end: { x: MARGEM + UTIL, y: y + 4 },
          thickness: 0.5,
          color: BORDA,
        });
      }
      y -= 10;
      continue;
    }

    /*
      Tipo desconhecido FALHA, e não é ignorado em silêncio. Foi o que quase
      aconteceu quando o bloco `subtitulo` foi criado sem o tratamento aqui: o
      documento sairia com uma seção a menos e ninguém notaria, porque um PDF
      não reclama do que falta nele.
    */
    throw new Error(`Bloco de tipo desconhecido no documento: "${bloco.tipo}"`);
  }

  /* ----- nota final */
  reservar(70);
  y -= 8;
  page.drawLine({
    start: { x: MARGEM, y }, end: { x: MARGEM + UTIL, y }, thickness: 0.8, color: BORDA,
  });
  y -= 14;
  paragrafo(
    "Este documento foi elaborado a partir de levantamento técnico do sistema, e descreve " +
      "o que a plataforma efetivamente faz. Não constitui parecer jurídico. A qualificação " +
      "legal das operações aqui descritas, bem como a decisão sobre os pontos pendentes, " +
      "compete a quem responde juridicamente pela rede.",
    { fonte: italico, corpo: 8.5, cor: CINZA }
  );

  rodape();
  return doc.save();
}

const destino = process.argv[2] ?? "registro-de-tratamento.pdf";
const bytes = await gerar();
await writeFile(destino, bytes);
console.log(`Registro gerado: ${path.resolve(destino)}`);
