/**
 * Teste de fumaça: abre todas as telas, autenticado, e exige que respondam.
 *
 * Existe por causa de uma lacuna concreta. A plataforma tem mais de cento e
 * quarenta testes de unidade, e nenhum deles RENDERIZA uma página — todos
 * exercitam regras puras. Isso deixou passar duas vezes o mesmo tipo de falha:
 * erro de serialização entre componente de servidor e de cliente, que os tipos
 * não pegam, o build não pega, e só aparece quando a tela é aberta de verdade.
 * Um deles ficou dias no ar.
 *
 * Então o teste aqui não verifica conteúdo: verifica que a tela RESPONDE. É
 * pouco, e é exatamente o que faltava.
 *
 * Navega em vez de usar uma lista fixa de rotas, de propósito: as telas mais
 * frágeis são as que dependem de dado real — curso, aula, prova, funcionário —
 * e os endereços delas contêm ids que só existem no banco. Seguindo os links a
 * partir das listagens, o teste alcança essas telas sem precisar conhecer id
 * nenhum, e cobre sozinho o que for criado depois.
 *
 * Uso:
 *   FUMACA_USUARIO=... FUMACA_SENHA=... node scripts/fumaca.mjs [url-base]
 *
 * A url-base padrão é http://localhost:3000. Aponte para produção para
 * conferir uma publicação — as credenciais nunca ficam no arquivo.
 */

const BASE = (process.argv[2] || process.env.FUMACA_URL || "http://localhost:3000").replace(/\/$/, "");
const USUARIO = process.env.FUMACA_USUARIO;
const SENHA = process.env.FUMACA_SENHA;
const LIMITE = Number(process.env.FUMACA_LIMITE ?? 60);

if (!USUARIO || !SENHA) {
  console.error("Defina FUMACA_USUARIO e FUMACA_SENHA. Nunca escreva credenciais neste arquivo.");
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

/* ----------------------------------------------------------------- login */

async function entrar() {
  const csrf = await (await buscar("/api/auth/csrf")).json();

  const corpo = new URLSearchParams({
    csrfToken: csrf.csrfToken,
    username: USUARIO,
    password: SENHA,
    callbackUrl: `${BASE}/`,
    json: "true",
  });

  await buscar("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: corpo,
  });

  const sessao = await (await buscar("/api/auth/session")).json();
  if (!sessao?.user) throw new Error("login recusado — confira usuário e senha");
  return sessao.user;
}

/* ------------------------------------------------------------- navegação */

const SEMENTES = [
  "/admin",
  "/admin/funcionarios",
  "/admin/funcionarios/novo",
  "/admin/cursos",
  "/admin/cursos/novo",
  "/admin/provas",
  "/admin/provas/nova",
  "/admin/matriculas",
  "/admin/conformidade",
  "/admin/relatorios",
  "/admin/atividades",
  "/admin/erros",
  "/admin/configuracoes",
  "/",
  "/meus-cursos",
  "/provas",
  "/historico",
  "/certificados",
  "/perfil",
];

/*
  Fora do alcance da navegação: sair encerraria a sessão no meio do teste, e
  as rotas de arquivo devolvem binário, que não tem link para seguir.
*/
const IGNORAR = /^\/(api|_next)\/|\/logout|\/sair/;

function linksDe(html) {
  return [...html.matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1]);
}

/**
 * A tela quebrou mesmo respondendo 200?
 *
 * O Next devolve 200 com o limite de erro renderizado quando um componente
 * quebra durante o streaming. Sem esta checagem, o teste diria que está tudo
 * bem justamente no caso que ele existe para pegar.
 */
function pareceTelaDeErro(html) {
  return (
    html.includes("Algo deu errado nesta tela") ||
    html.includes("Código para o suporte:") ||
    html.includes("Application error: a client-side exception")
  );
}

async function navegar() {
  const fila = [...SEMENTES];
  const vistos = new Set(fila);
  const falhas = [];
  let visitadas = 0;

  while (fila.length > 0 && visitadas < LIMITE) {
    const caminho = fila.shift();
    visitadas++;

    let resposta;
    try {
      resposta = await buscar(caminho);
    } catch (erro) {
      falhas.push(`${caminho} — não respondeu: ${erro.message}`);
      continue;
    }

    if (resposta.status >= 400) {
      falhas.push(`${caminho} — HTTP ${resposta.status}`);
      continue;
    }

    // 3xx é legítimo: /admin redireciona, o portal manda para /meus-cursos.
    if (resposta.status >= 300) {
      console.log(`  ${caminho} → ${resposta.status}`);
      continue;
    }

    const html = await resposta.text();

    if (pareceTelaDeErro(html)) {
      falhas.push(`${caminho} — respondeu 200, mas renderizou a tela de erro`);
      continue;
    }

    console.log(`  ${caminho} → 200`);

    for (const link of linksDe(html)) {
      if (vistos.has(link) || IGNORAR.test(link)) continue;
      vistos.add(link);
      fila.push(link);
    }
  }

  return { falhas, visitadas };
}

/* ---------------------------------------------------------------- início */

const usuario = await entrar();
console.log(`\nAutenticado como ${usuario.name ?? USUARIO}.`);
console.log(`Navegando em ${BASE} (limite de ${LIMITE} telas)\n`);

const { falhas, visitadas } = await navegar();

if (falhas.length === 0) {
  console.log(`\n${visitadas} tela(s) responderam. Nenhuma falha.\n`);
  process.exit(0);
}

console.error(`\n${falhas.length} falha(s) em ${visitadas} tela(s):\n`);
for (const falha of falhas) console.error(`  ✗ ${falha}`);
console.error("");
process.exit(1);
