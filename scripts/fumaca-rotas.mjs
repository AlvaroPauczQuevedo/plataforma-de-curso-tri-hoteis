/**
 * Teste de fumaça das rotas de API, por HTTP de verdade.
 *
 * O `scripts/fumaca.mjs` navega pelas TELAS e exige que respondam. Estas duas
 * rotas ele não alcança: a entrega de arquivo por trecho (`Range`) e o teto de
 * avisos de erro do navegador. Ambas foram reescritas, ambas têm teste de
 * unidade da regra pura — e nenhuma das duas tinha sido exercitada como o
 * navegador as usa, com cabeçalho, código de status e corpo.
 *
 * A diferença importa: o teste de unidade prova que a aritmética da faixa está
 * certa; só a requisição prova que a rota escreve o `Content-Range` que o
 * player espera e devolve o número de bytes que prometeu.
 *
 * Uso:
 *   FUMACA_EMAIL=... FUMACA_SENHA=... node scripts/fumaca-rotas.mjs [url-base]
 */

const BASE = (process.argv[2] || process.env.FUMACA_URL || "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.FUMACA_EMAIL;
const SENHA = process.env.FUMACA_SENHA;
/** Id de um FileAsset de vídeo, para exercitar a entrega por trecho. */
const VIDEO_ID = process.env.FUMACA_VIDEO_ID;

if (!EMAIL || !SENHA) {
  console.error("Defina FUMACA_EMAIL e FUMACA_SENHA.");
  process.exit(2);
}

/* --------------------------------------------------------------- cookies */

const cookies = new Map();

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

async function entrar() {
  const csrf = await (await buscar("/api/auth/csrf")).json();

  await buscar("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrfToken: csrf.csrfToken,
      email: EMAIL,
      password: SENHA,
      callbackUrl: `${BASE}/`,
      json: "true",
    }),
  });

  const sessao = await (await buscar("/api/auth/session")).json();
  if (!sessao?.user) throw new Error("login recusado");
  return sessao.user;
}

/* ------------------------------------------------------------ asserções */

const falhas = [];

function conferir(nome, condicao, detalhe) {
  if (condicao) {
    console.log(`  ok   ${nome}`);
  } else {
    console.log(`  FALHA ${nome} — ${detalhe}`);
    falhas.push(`${nome}: ${detalhe}`);
  }
}

/* ------------------------------------------- entrega de arquivo por trecho */

async function testarFaixas(tamanho) {
  console.log(`\nEntrega por trecho (arquivo de ${tamanho} bytes)`);

  // Sem Range: arquivo inteiro, 200.
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

  // Trecho no meio: 206, com Content-Range e o número exato de bytes.
  const meio = await buscar(`/api/files/${VIDEO_ID}`, {
    headers: { range: "bytes=100-199" },
  });
  const corpoMeio = Buffer.from(await meio.arrayBuffer());
  conferir(
    "trecho no meio devolve 206",
    meio.status === 206,
    `status ${meio.status}`
  );
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

  // Último byte: a borda que o defeito errava.
  const ultimo = await buscar(`/api/files/${VIDEO_ID}`, {
    headers: { range: `bytes=${tamanho - 1}-${tamanho - 1}` },
  });
  const corpoUltimo = Buffer.from(await ultimo.arrayBuffer());
  conferir(
    "o último byte é entregável",
    ultimo.status === 206 && corpoUltimo.length === 1,
    `status ${ultimo.status}, ${corpoUltimo.length} bytes`
  );

  // Pedir além do fim: normal, apara no último byte.
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

  // Começar depois do fim: 416, com o tamanho real.
  const foraDoArquivo = await buscar(`/api/files/${VIDEO_ID}`, {
    headers: { range: `bytes=${tamanho + 500}-${tamanho + 900}` },
  });
  await foraDoArquivo.arrayBuffer();
  conferir(
    "começar depois do fim devolve 416",
    foraDoArquivo.status === 416,
    `status ${foraDoArquivo.status} (era 206 com Content-Length negativo)`
  );
  conferir(
    "o 416 informa o tamanho real do arquivo",
    foraDoArquivo.headers.get("content-range") === `bytes */${tamanho}`,
    `content-range = ${foraDoArquivo.headers.get("content-range")}`
  );
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

const usuario = await entrar();
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
  console.log("\n(FUMACA_VIDEO_ID não definido — entrega por trecho não testada)");
}

const disparos = await testarTetoDeAvisos(Number(process.env.ERROS_CLIENTE_LIMITE ?? 60));

console.log("");
if (falhas.length === 0) {
  console.log(`Todas as conferências passaram. ${disparos} avisos disparados.\n`);
  process.exit(0);
}

console.error(`${falhas.length} falha(s):\n`);
for (const f of falhas) console.error(`  x ${f}`);
console.error("");
process.exit(1);
