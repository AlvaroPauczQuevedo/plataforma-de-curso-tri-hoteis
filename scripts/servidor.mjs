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

const ip = ipDaRede();
const url = process.env.NEXTAUTH_URL || `http://${ip}:${porta}`;

console.log(`\n  Academia Corporativa Tri Hotéis`);
console.log(`  Nesta máquina:  http://localhost:${porta}`);
console.log(`  Na rede local:  http://${ip}:${porta}`);
console.log(`  NEXTAUTH_URL:   ${url}\n`);

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
