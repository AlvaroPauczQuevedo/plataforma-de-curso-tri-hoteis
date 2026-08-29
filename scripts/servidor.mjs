/**
 * Sobe o Next (dev ou produção) publicando na rede local.
 *
 * O NextAuth 4 precisa de NEXTAUTH_URL para montar os redirecionamentos de
 * login; sem a variável ele assume http://localhost:3000 e quem entra pelo IP
 * da rede é jogado para a máquina errada depois de autenticar. Como o IP vem
 * do DHCP e muda, fixá-lo no .env quebra o acesso sem aviso — então ele é
 * detectado a cada inicialização. Um NEXTAUTH_URL já definido no ambiente
 * (domínio definitivo, por exemplo) tem prioridade e é respeitado.
 */
import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
import { createRequire } from "node:module";

const comando = process.argv[2] === "dev" ? "dev" : "start";
const porta = process.env.PORT ?? "3000";

/** Primeiro IPv4 real da máquina (ignora loopback e interfaces virtuais). */
function ipDaRede() {
  const candidatos = [];
  for (const [nome, enderecos] of Object.entries(networkInterfaces())) {
    for (const endereco of enderecos ?? []) {
      if (endereco.family !== "IPv4" || endereco.internal) continue;
      if (/^(vEthernet|VirtualBox|VMware|Loopback)/i.test(nome)) continue;
      candidatos.push(endereco.address);
    }
  }
  // Redes locais (192.168.x, 10.x, 172.16–31.x) na frente de qualquer outra.
  const privado = candidatos.find((ip) =>
    /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)
  );
  return privado ?? candidatos[0] ?? "localhost";
}

const producao = process.env.NODE_ENV === "production";

/**
 * Barreiras de produção.
 *
 * As duas falhas que estas checagens evitam são silenciosas: com NEXTAUTH_URL
 * ausente o login "funciona" mas devolve o usuário para localhost; com o
 * segredo de desenvolvimento, quem conhecer o valor fabrica uma sessão de
 * administrador. Recusar a subida é melhor do que descobrir depois.
 */
function exigirConfiguracaoDeProducao() {
  const problemas = [];

  if (!process.env.NEXTAUTH_URL) {
    problemas.push(
      [
        "NEXTAUTH_URL não definida.",
        "Precisa ser o endereço público real, ex.: https://faculdade.trihoteis.com.br",
        "Sem ela o NextAuth assume localhost e o login volta para a máquina errada.",
      ].join("\n     ")
    );
  }

  const segredo = process.env.NEXTAUTH_SECRET || "";
  if (segredo.length < 32) {
    problemas.push(
      [
        "NEXTAUTH_SECRET ausente ou curto demais (mínimo 32 caracteres).",
        "Gere um próprio:",
        `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`,
      ].join("\n     ")
    );
  } else if (/dev|teste|test|troque|change|secret/i.test(segredo)) {
    problemas.push(
      "NEXTAUTH_SECRET parece ser um valor de exemplo. Gere um próprio e aleatório."
    );
  }

  if (!process.env.STORAGE_DIR) {
    problemas.push(
      [
        "STORAGE_DIR não definida — os arquivos enviados ficariam dentro da pasta",
        "do projeto e seriam perdidos na próxima publicação. Aponte para um",
        "caminho fora do projeto, ex.: /home/usuario/dados-faculdade/uploads",
      ].join("\n     ")
    );
  }

  if (problemas.length === 0) return;

  console.error("\n  Configuração de produção incompleta:\n");
  for (const problema of problemas) console.error(`   - ${problema}\n`);
  console.error("  Defina as variáveis e suba novamente.\n");
  process.exit(1);
}

if (producao) exigirConfiguracaoDeProducao();

const ip = ipDaRede();
const url = process.env.NEXTAUTH_URL || `http://${ip}:${porta}`;

console.log(`\n  Academia Corporativa Tri Hotéis`);
console.log(`  Nesta máquina:  http://localhost:${porta}`);
if (!producao) console.log(`  Na rede local:  http://${ip}:${porta}`);
console.log(`  NEXTAUTH_URL:   ${url}`);
console.log(
  `  Arquivos:       ${process.env.STORAGE_DIR ?? "storage/uploads (dentro do projeto)"}\n`
);

// Chama o binário do Next pelo próprio Node: no Windows, spawn de um .cmd
// falha com EINVAL a partir do Node 24.
const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const filho = spawn(
  process.execPath,
  [nextBin, comando, "-H", "0.0.0.0", "-p", porta],
  { stdio: "inherit", env: { ...process.env, NEXTAUTH_URL: url } }
);

filho.on("exit", (code) => process.exit(code ?? 0));
