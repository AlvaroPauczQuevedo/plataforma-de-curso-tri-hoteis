import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emailDeBoasVindas,
  emailDeRedefinicao,
  enderecoPublico,
  enviarEmail,
  envioDisponivel,
  paraHtml,
} from "../src/lib/email";

const env = process.env as Record<string, string | undefined>;

function comSmtp<T>(fn: () => T): T {
  const antes = { ...env };
  Object.assign(env, {
    SMTP_HOST: "smtp.exemplo.test",
    SMTP_PORT: "587",
    SMTP_USER: "u",
    SMTP_PASS: "p",
    SMTP_FROM: "Academia <nao-responda@exemplo.test>",
  });
  try {
    return fn();
  } finally {
    for (const chave of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]) {
      if (antes[chave] === undefined) delete env[chave];
      else env[chave] = antes[chave];
    }
  }
}

describe("Envio de e-mail — configuração", () => {
  it("fica desligado sem as variáveis de SMTP", () => {
    assert.equal(envioDisponivel(), false);
  });

  it("liga quando todas as variáveis estão presentes", () => {
    assert.equal(comSmtp(() => envioDisponivel()), true);
  });

  /**
   * Faltando uma variável, ligar seria pior do que ficar desligado: o envio
   * falharia a cada cadastro em vez de simplesmente não acontecer.
   */
  it("continua desligado se faltar uma variável", () => {
    comSmtp(() => {
      delete env.SMTP_PASS;
      assert.equal(envioDisponivel(), false);
    });
  });

  it("desligado, não tenta enviar e diz o porquê", async () => {
    const r = await enviarEmail({ para: "a@b.test", assunto: "x", texto: "y" });
    assert.deepEqual(r, { enviado: false, motivo: "sem-configuracao" });
  });
});

describe("Mensagens da plataforma", () => {
  it("as boas-vindas levam e-mail e senha provisória", () => {
    const m = emailDeBoasVindas("Maria Silva", "maria@trihoteis.com.br", "ABCD-1234");

    assert.equal(m.para, "maria@trihoteis.com.br");
    assert.match(m.texto, /Maria/);
    assert.match(m.texto, /ABCD-1234/);
    assert.match(m.texto, /maria@trihoteis\.com\.br/);
    assert.doesNotMatch(m.texto, /Silva,/, "trata pelo primeiro nome");
  });

  it("a redefinição leva o link completo e o prazo", () => {
    const m = emailDeRedefinicao("João Souza", "joao@trihoteis.com.br", "tok-123");

    assert.match(m.texto, new RegExp(`${enderecoPublico()}/redefinir-senha/tok-123`));
    assert.match(m.texto, /1 hora/);
    assert.match(m.texto, /uma vez/);
  });

  /**
   * O nome vem do cadastro, que é digitado por outra pessoa. Sem escape, um
   * nome com marcação entraria cru no HTML do e-mail.
   */
  it("o corpo em HTML escapa o que veio do cadastro", () => {
    const m = emailDeBoasVindas("<script>alert(1)</script>", "x@y.test", "S");
    const html = paraHtml(m.texto);

    assert.doesNotMatch(html, /<script>/, "a marcação não passa crua");
    assert.match(html, /&lt;script&gt;/, "vai escapada");
  });

  it("aspas e e-comercial também são escapados", () => {
    const html = paraHtml('Pousada "Sol & Mar" <interna>');

    assert.match(html, /&quot;Sol &amp; Mar&quot;/);
    assert.match(html, /&lt;interna&gt;/);
  });

  it("parágrafos e quebras viram marcação, não texto corrido", () => {
    const html = paraHtml("Primeiro\nsegunda linha\n\nOutro parágrafo");

    assert.match(html, /Primeiro<br>segunda linha/);
    assert.equal((html.match(/<p /g) ?? []).length, 3, "dois parágrafos mais a assinatura");
  });
});
