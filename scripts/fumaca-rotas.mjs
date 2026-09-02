/**
 * Teste de fumaça das rotas de API, por HTTP de verdade.
 *
 * O `scripts/fumaca.mjs` navega pelas TELAS e exige que respondam. Estas rotas
 * ele não alcança: a entrega de arquivo por trecho (`Range`), o teto de avisos
 * de erro do navegador, e os dois downloads em PDF. Todas têm teste de unidade
 * da regra pura — e nenhuma delas seria exercitada como o navegador as usa, com
 * cabeçalho, código de status e corpo, se não fosse por aqui.
 *
 * A diferença importa. O teste de unidade prova que a aritmética da faixa está
 * certa; só a requisição prova que a rota escreve o `Content-Range` que o
 * player espera e devolve os bytes que prometeu. E, no caso dos PDFs, só ela
 * prova que a autorização continua recusando quem deve ser recusado — que é a
 * metade da regra que um teste de "funciona" nunca alcança.
 *
 * Uso:
 *   FUMACA_SENHA_ADMIN=... FUMACA_SENHA_FUNCIONARIO=... \
 *   FUMACA_ADMIN=... FUMACA_VIDEO_ID=... [demais ids] \
 *   node scripts/fumaca-rotas.mjs [url-base]
 *
 * Os ids saem de `scripts/preparar-fumaca.mjs`. O que faltar é pulado, com
 * aviso — assim o roteiro serve tanto ao CI quanto a uma conferência rápida
 * contra um ambiente já existente.
 */

const BASE = (process.argv[2] || process.env.FUMACA_URL || "http://localhost:3000").replace(/\/$/, "");

const ADMIN = process.env.FUMACA_ADMIN;
const SENHA_ADMIN = process.env.FUMACA_SENHA_ADMIN ?? process.env.FUMACA_SENHA;
const SENHA_FUNCIONARIO = process.env.FUMACA_SENHA_FUNCIONARIO;

const VIDEO_ID = process.env.FUMACA_VIDEO_ID;
const CERT_ID = process.env.FUMACA_CERT_ID;
const CERT_DONO = process.env.FUMACA_CERT_DONO;
const CERT_ESTRANHO = process.env.FUMACA_CERT_ESTRANHO;
const PROVA_ID = process.env.FUMACA_PROVA_ID;

if (!ADMIN || !SENHA_ADMIN) {
  console.error("Defina FUMACA_ADMIN e FUMACA_SENHA_ADMIN.");
  process.exit(2);
}

/* --------------------------------------------------------------- cookies */

let cookies = new Map();

function guardarCookies(resposta) {
  for (const linha of resposta.headers.getSetCookie?.() ?? []) {
    const [par] = linha.split(";");
    const separador = par.indexOf("=");
    if (separador > 0) {
      cookies.set(par.slice(0, separador).trim(), par.slice(separador + 1).trim());
    }
  }
}

const cabecalhoDeCookie = () =>
  [...cookies].map(([nome, valor]) => `${nome}=${valor}`).join("; ");

async function buscar(caminho, opcoes = {}) {
  const resposta = await fetch(`${BASE}${caminho}`, {
    ...opcoes,
    redirect: "manual",
    headers: { ...(opcoes.headers ?? {}), cookie: cabecalhoDeCookie() },
  });
  guardarCookies(resposta);
  return resposta;
}

/** Entra como alguém, descartando a sessão anterior. */
async function entrar(email, senha) {
  cookies = new Map();

  const csrf = await (await buscar("/api/auth/csrf")).json();

  await buscar("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrfToken: csrf.csrfToken,
      email,
      password: senha,
      callbackUrl: `${BASE}/`,
      json: "true",
    }),
  });

  const sessao = await (await buscar("/api/auth/session")).json();
  if (!sessao?.user) throw new Error(`login recusado para ${email}`);
  return sessao.user;
}

/* ------------------------------------------------------------ asserções */

const falhas = [];
const pulados = [];

function conferir(nome, condicao, detalhe) {
  if (condicao) {
    console.log(`  ok   ${nome}`);
  } else {
    console.log(`  FALHA ${nome} — ${detalhe}`);
    falhas.push(`${nome}: ${detalhe}`);
  }
}

const ehPdf = (corpo) => corpo.subarray(0, 4).toString() === "%PDF";

/* ------------------------------------------- entrega de arquivo por trecho */

async function testarFaixas(tamanho) {
  console.log(`\nEntrega por trecho (arquivo de ${tamanho} bytes)`);

  const inteiro = await buscar(`/api/files/${VIDEO_ID}`);
  const corpoInteiro = Buffer.from(await inteiro.arrayBuffer());
  conferir(
    "sem Range devolve 200 com o arquivo inteiro",
    inteiro.status === 200 && corpoInteiro.length === tamanho,
    `status ${inteiro.status}, ${corpoInteiro.length} bytes`
  );
  conferir(
    "sem Range anuncia Accept-Ranges",
    inteiro.headers.get("accept-ranges") === "bytes",
    `accept-ranges = ${inteiro.headers.get("accept-ranges")}`
  );

  const meio = await buscar(`/api/files/${VIDEO_ID}`, { headers: { range: "bytes=100-199" } });
  const corpoMeio = Buffer.from(await meio.arrayBuffer());
  conferir("trecho no meio devolve 206", meio.status === 206, `status ${meio.status}`);
  conferir(
    "trecho no meio entrega exatamente 100 bytes",
    corpoMeio.length === 100,
    `${corpoMeio.length} bytes`
  );
  conferir(
    "Content-Range do trecho está correto",
    meio.headers.get("content-range") === `bytes 100-199/${tamanho}`,
    `content-range = ${meio.headers.get("content-range")}`
  );
  conferir(
    "Content-Length bate com o corpo",
    Number(meio.headers.get("content-length")) === corpoMeio.length,
    `content-length ${meio.headers.get("content-length")} vs ${corpoMeio.length} bytes`
  );

  const ultimo = await buscar(`/api/files/${VIDEO_ID}`, {
    headers: { range: `bytes=${tamanho - 1}-${tamanho - 1}` },
  });
  const corpoUltimo = Buffer.from(await ultimo.arrayBuffer());
  conferir(
    "o último byte é entregável",
    ultimo.status === 206 && corpoUltimo.length === 1,
    `status ${ultimo.status}, ${corpoUltimo.length} bytes`
  );

  const alemDoFim = await buscar(`/api/files/${VIDEO_ID}`, {
    headers: { range: `bytes=${tamanho - 10}-999999` },
  });
  const corpoAlem = Buffer.from(await alemDoFim.arrayBuffer());
  conferir(
    "pedir além do fim apara em vez de recusar",
    alemDoFim.status === 206 && corpoAlem.length === 10,
    `status ${alemDoFim.status}, ${corpoAlem.length} bytes`
  );
  conferir(
    "Content-Length nunca é negativo",
    Number(alemDoFim.headers.get("content-length")) > 0,
    `content-length = ${alemDoFim.headers.get("content-length")}`
  );

  const fora = await buscar(`/api/files/${VIDEO_ID}`, {
    headers: { range: `bytes=${tamanho + 500}-${tamanho + 900}` },
  });
  await fora.arrayBuffer();
  conferir(
    "começar depois do fim devolve 416",
    fora.status === 416,
    `status ${fora.status} (era 206 com Content-Length negativo)`
  );
  conferir(
    "o 416 informa o tamanho real do arquivo",
    fora.headers.get("content-range") === `bytes */${tamanho}`,
    `content-range = ${fora.headers.get("content-range")}`
  );
}

/* ------------------------------------------------------------ downloads */

async function testarPdfs() {
  console.log("\nDownloads em PDF");

  if (CERT_ID && CERT_DONO && SENHA_FUNCIONARIO) {
    await entrar(CERT_DONO, SENHA_FUNCIONARIO);
    const r = await buscar(`/api/certificados/${CERT_ID}/pdf`);
    const corpo = Buffer.from(await r.arrayBuffer());
    conferir(
      "o dono baixa o próprio certificado",
      r.status === 200 && ehPdf(corpo),
      `status ${r.status}, ${corpo.length} bytes`
    );
    conferir(
      "o certificado vem como anexo",
      (r.headers.get("content-disposition") ?? "").startsWith("attachment"),
      `content-disposition = ${r.headers.get("content-disposition")}`
    );
    /*
      O QR de conferência são centenas de retângulos, um por módulo escuro. Um
      certificado que voltasse sem ele passaria nas conferências acima — é PDF,
      é anexo — e chegaria ao auditor sem o que o faz conferível. O tamanho é a
      prova barata de que o desenho aconteceu.
    */
    conferir(
      "o certificado traz o QR de conferência",
      corpo.length > 20000,
      `${corpo.length} bytes — pequeno demais para conter o QR`
    );

    if (CERT_ESTRANHO) {
      await entrar(CERT_ESTRANHO, SENHA_FUNCIONARIO);
      const alheio = await buscar(`/api/certificados/${CERT_ID}/pdf`);
      await alheio.arrayBuffer();
      conferir(
        "outro funcionário recebe 403 no certificado alheio",
        alheio.status === 403,
        `status ${alheio.status}`
      );
    } else {
      pulados.push("recusa do certificado alheio (FUMACA_CERT_ESTRANHO ausente)");
    }

    // Sem sessão nenhuma.
    cookies = new Map();
    const semSessao = await fetch(`${BASE}/api/certificados/${CERT_ID}/pdf`, {
      redirect: "manual",
    });
    await semSessao.arrayBuffer();
    conferir("sem sessão recebe 401", semSessao.status === 401, `status ${semSessao.status}`);
  } else {
    pulados.push("certificado em PDF (faltam ids ou a senha do funcionário)");
  }

  if (PROVA_ID) {
    await entrar(ADMIN, SENHA_ADMIN);
    const r = await buscar(`/api/provas/${PROVA_ID}/pdf`);
    const corpo = Buffer.from(await r.arrayBuffer());
    conferir(
      "administrador baixa a prova em PDF",
      r.status === 200 && ehPdf(corpo),
      `status ${r.status}`
    );
    conferir("o PDF da prova tem corpo", corpo.length > 500, `${corpo.length} bytes`);
  } else {
    pulados.push("prova em PDF (FUMACA_PROVA_ID ausente)");
  }
}

/* ------------------------------------------------------- teto de avisos */

async function testarTetoDeAvisos(teto) {
  console.log(`\nTeto de avisos do navegador (limite ${teto}/min)`);

  const disparos = teto + 25;
  const status = new Set();

  for (let i = 0; i < disparos; i += 1) {
    const r = await fetch(`${BASE}/api/erros`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ digest: `1234567${i}`, url: `/tela-de-teste/${i}` }),
    });
    status.add(r.status);
  }

  conferir(
    "todo aviso responde 204, dentro ou fora do teto",
    status.size === 1 && status.has(204),
    `status vistos: ${[...status].join(", ")}`
  );

  return disparos;
}

/* ---------------------------------------------------------------- início */

const usuario = await entrar(ADMIN, SENHA_ADMIN);
console.log(`Autenticado como ${usuario.name ?? usuario.email} em ${BASE}`);

if (VIDEO_ID) {
  const cabeca = await buscar(`/api/files/${VIDEO_ID}`);
  const tamanho = Number(cabeca.headers.get("content-length"));
  await cabeca.arrayBuffer();

  if (!tamanho || tamanho < 300) {
    falhas.push(`arquivo de teste pequeno demais (${tamanho} bytes)`);
  } else {
    await testarFaixas(tamanho);
  }
} else {
  pulados.push("entrega por trecho (FUMACA_VIDEO_ID ausente)");
}

await testarPdfs();

const disparos = await testarTetoDeAvisos(Number(process.env.ERROS_CLIENTE_LIMITE ?? 60));

console.log("");
for (const p of pulados) console.log(`  (pulado) ${p}`);

if (falhas.length === 0) {
  console.log(`\nTodas as conferências passaram. ${disparos} avisos disparados.\n`);
  process.exit(0);
}

console.error(`\n${falhas.length} falha(s):\n`);
for (const f of falhas) console.error(`  x ${f}`);
console.error("");
process.exit(1);
