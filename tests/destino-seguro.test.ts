import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { destinoSeguro } from "../src/lib/destino-seguro";

/**
 * Para onde o login manda depois de autenticar.
 *
 * O `callbackUrl` vem da query e ia direto para o `router.push`. Um link com
 * `callbackUrl` externo jogava a pessoa recém-logada num site de phishing. A
 * regra é aceitar só caminho interno; tudo mais vira o destino padrão.
 */

const PADRAO = "/";

describe("Caminho interno passa", () => {
  it("aceita uma rota do próprio site", () => {
    assert.equal(destinoSeguro("/admin/funcionarios", PADRAO), "/admin/funcionarios");
    assert.equal(destinoSeguro("/cursos/abc/aulas/xyz", PADRAO), "/cursos/abc/aulas/xyz");
  });

  it("sem callbackUrl, usa o padrão", () => {
    assert.equal(destinoSeguro(undefined, "/admin"), "/admin");
    assert.equal(destinoSeguro("", "/admin"), "/admin");
  });
});

describe("Redirecionamento externo é recusado", () => {
  it("URL com esquema não passa", () => {
    assert.equal(destinoSeguro("https://mau.example", PADRAO), PADRAO);
    assert.equal(destinoSeguro("http://mau.example", PADRAO), PADRAO);
    assert.equal(destinoSeguro("javascript:alert(1)", PADRAO), PADRAO);
  });

  it("protocol-relative não passa", () => {
    // O navegador completa o esquema sozinho: //mau vira https://mau.
    assert.equal(destinoSeguro("//mau.example", PADRAO), PADRAO);
    assert.equal(destinoSeguro("//mau.example/painel", PADRAO), PADRAO);
  });

  it("a contrabarra depois da primeira / também não passa", () => {
    // Alguns navegadores tratam /\ e \ como //.
    assert.equal(destinoSeguro("/\\mau.example", PADRAO), PADRAO);
  });

  it("caminho que não começa com barra não passa", () => {
    assert.equal(destinoSeguro("mau.example", PADRAO), PADRAO);
    assert.equal(destinoSeguro("../fora", PADRAO), PADRAO);
  });
});
