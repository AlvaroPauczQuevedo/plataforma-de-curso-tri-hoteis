/**
 * Confere se o envio de e-mail está realmente funcionando.
 *
 * Existe porque a configuração de SMTP falha em silêncio de propósito: uma
 * senha errada ou uma porta bloqueada não derrubam nada, `enviarEmail` devolve
 * `{ enviado: false }` e a plataforma segue. Isso é certo em produção — não se
 * perde um cadastro porque o e-mail não saiu —, mas significa que sem este
 * script a única forma de descobrir que o SMTP está quebrado é alguém precisar
 * dele e não receber.
 *
 * Usa o MESMO caminho da aplicação (`lib/email`), e não uma conexão própria:
 * um teste que conecta de outro jeito pode passar enquanto a plataforma falha.
 *
 * Uso:
 *   npm run email:testar -- voce@gmail.com
 */
import { enviarEmail, enderecoPublico, envioDisponivel } from "../src/lib/email.ts";
import { formatDateTime } from "../src/lib/utils.ts";

const VARIAVEIS = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"];

console.log("");
console.log("Configuração encontrada:");
for (const nome of VARIAVEIS) { 
  const valor = process.env[nome];
  // A senha nunca é impressa: este comando costuma rodar com alguém olhando a
  // tela, e o terminal fica no histórico.
  const mostrado = !valor
    ? "(vazia)"
    : nome === "SMTP_PASS"
      ? `(definida, ${valor.length} caracteres)`
      : valor;
  console.log(`  ${nome.padEnd(11)} ${mostrado}`);
}
console.log(`  ${"SMTP_SECURE".padEnd(11)} ${process.env.SMTP_SECURE || "(automático pela porta)"}`);
console.log("");

const faltando = VARIAVEIS.filter((n) => !process.env[n]);
if (faltando.length > 0) {
  console.error(`Faltam ${faltando.length} variável(is): ${faltando.join(", ")}`);
  console.error("O envio fica desligado até TODAS as cinco estarem preenchidas.");
  console.error("Enquanto isso, o campo de e-mail some do Perfil e nada é enviado.\n");
  process.exit(1);
}

if (!envioDisponivel()) {
  console.error("As cinco estão preenchidas, mas a plataforma não reconheceu. Confira espaços em branco.\n");
  process.exit(1);
}

const destino = process.argv[2]?.trim();
if (!destino) {
  console.error("Informe para onde mandar o teste:");
  console.error("  npm run email:testar -- voce@gmail.com\n");
  process.exit(1);
}

console.log(`Enviando para ${destino}...`);

const resultado = await enviarEmail({
  para: destino,
  assunto: "Teste de envio — Academia Corporativa Tri Hotéis",
  texto: [
    "Esta mensagem confirma que o envio de e-mail da Academia Corporativa está funcionando.",
    `Endereço da plataforma: ${enderecoPublico()}`,
    // Pelo mesmo formatador das telas: no servidor, `toLocaleString` sairia em UTC.
    `Enviada em ${formatDateTime(new Date())}.`,
    "Se você recebeu isto, os funcionários já conseguem cadastrar o e-mail pessoal e recuperar a senha sozinhos.",
  ].join("\n\n"),
});

console.log("");
if (resultado.enviado) {
  console.log("ENVIADO. Confira a caixa de entrada — e também o SPAM.");
  console.log("");
  console.log("Se cair no spam, o problema não é a configuração daqui: falta");
  console.log("SPF, DKIM e DMARC no domínio remetente. Sem esses registros o");
  console.log("link de confirmação e o de nova senha somem na caixa de spam de");
  console.log("todo mundo, e o recurso parece quebrado sem dar erro nenhum.");
  console.log("");
  process.exit(0);
}

console.error("FALHOU.");
console.error(`  motivo: ${resultado.motivo}`);
if (resultado.detalhe) console.error(`  detalhe: ${resultado.detalhe}`);
console.error("");
console.error("Suspeitos mais comuns, nesta ordem:");
console.error("  - SMTP_PASS errada, ou senha da conta onde o provedor exige senha de aplicativo;");
console.error("  - SMTP_PORT/SMTP_SECURE trocados (465 é TLS direto, 587 é STARTTLS);");
console.error("  - SMTP_FROM com endereço de um domínio que este servidor não pode enviar;");
console.error("  - porta de saída bloqueada pela hospedagem.");
console.error("");
process.exit(1);
