import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { criarAdministrador, criarFuncionario, db, encerrar } from "./ambiente";

// Depois do ambiente, que já apontou DATABASE_URL para o banco temporário.
import {
  documentoAlcanca,
  documentosDaPessoa,
  situacaoDoAceite,
  situacaoDoDocumento,
} from "../src/lib/documentos";

after(encerrar);

/**
 * Aceite de documentos.
 *
 * A regra que dá sentido ao módulo é a VERSÃO: documento revisado é outro
 * texto, e quem aceitou a v1 volta a dever. Sem isso, uma política atualizada
 * continuaria "aceita" por gente que nunca leu a mudança — um registro que
 * parece conformidade e não é. É o que estes testes protegem.
 */

let n = 0;
async function criarDocumento(opcoes: {
  versao?: number;
  publicado?: boolean;
  departamentos?: string[];
} = {}) {
  const autor = await criarAdministrador();
  const arquivo = await db.fileAsset.create({
    data: {
      filename: `doc-${(n += 1)}.pdf`,
      originalName: "politica.pdf",
      mimeType: "application/pdf",
      size: 10,
      storagePath: `pdfs/doc-${n}.pdf`,
      kind: "PDF",
      uploadedById: autor.id,
    },
  });

  return db.documento.create({
    data: {
      titulo: `Documento ${n}`,
      arquivoId: arquivo.id,
      createdById: autor.id,
      versao: opcoes.versao ?? 1,
      publicado: opcoes.publicado ?? true,
      ...(opcoes.departamentos?.length
        ? { departamentos: { create: opcoes.departamentos.map((departmentId) => ({ departmentId })) } }
        : {}),
    },
  });
}

const setor = (nome: string) => db.department.create({ data: { name: `${nome}-${(n += 1)}` } });

describe("Situação pela versão", () => {
  it("nunca aceitou é pendente", () => {
    assert.equal(situacaoDoAceite(1, null), "pendente");
  });

  it("aceitou a versão que está no ar é aceito", () => {
    assert.equal(situacaoDoAceite(2, 2), "aceito");
  });

  it("aceitou versão anterior é REVISADO, não pendente", () => {
    /*
      Estado próprio de propósito: quem já assinou uma vez merece saber que o
      texto mudou, e não receber a mesma cobrança de quem nunca leu nada.
    */
    assert.equal(situacaoDoAceite(3, 1), "revisado");
  });
});

describe("Alcance do documento", () => {
  it("sem departamento, alcança a rede inteira", () => {
    assert.equal(documentoAlcanca([], []), true);
    assert.equal(documentoAlcanca([], ["qualquer"]), true);
  });

  it("com departamento, alcança quem é dele", () => {
    assert.equal(documentoAlcanca(["a"], ["a", "b"]), true);
    assert.equal(documentoAlcanca(["a"], ["b"]), false);
  });
});

describe("Listagem do funcionário", () => {
  it("mostra documento publicado do setor dela, e esconde rascunho", async () => {
    const s = await setor("Recepcao");
    const pessoa = await criarFuncionario({ departmentId: s.id });

    const publicado = await criarDocumento({ departamentos: [s.id] });
    await criarDocumento({ departamentos: [s.id], publicado: false });

    const lista = await documentosDaPessoa(pessoa.id);

    assert.equal(lista.length, 1, "só o publicado aparece");
    assert.equal(lista[0].id, publicado.id);
    assert.equal(lista[0].situacao, "pendente");
  });

  it("não mostra documento de outro setor", async () => {
    const meu = await setor("Cozinha");
    const alheio = await setor("Manutencao");
    const pessoa = await criarFuncionario({ departmentId: meu.id });

    await criarDocumento({ departamentos: [alheio.id] });

    assert.deepEqual(await documentosDaPessoa(pessoa.id), []);
  });

  it("documento sem setor alcança quem não tem setor nenhum", async () => {
    const pessoa = await criarFuncionario();
    const doc = await criarDocumento();

    const lista = await documentosDaPessoa(pessoa.id);
    assert.equal(lista.some((d) => d.id === doc.id), true);
  });

  it("depois de aceitar fica aceito; revisado volta a pendência", async () => {
    const pessoa = await criarFuncionario();
    const doc = await criarDocumento();

    await db.aceiteDeDocumento.create({
      data: { userId: pessoa.id, documentoId: doc.id, versao: 1 },
    });

    const depoisDoAceite = (await documentosDaPessoa(pessoa.id)).find((d) => d.id === doc.id);
    assert.equal(depoisDoAceite?.situacao, "aceito");

    // A política é revisada: o texto mudou, o aceite antigo não vale para ele.
    await db.documento.update({ where: { id: doc.id }, data: { versao: 2 } });

    const depoisDaRevisao = (await documentosDaPessoa(pessoa.id)).find((d) => d.id === doc.id);
    assert.equal(depoisDaRevisao?.situacao, "revisado");
    assert.equal(depoisDaRevisao?.versaoAceita, 1, "o histórico do que ela aceitou fica");
  });
});

describe("Quem falta, no painel", () => {
  it("conta as pessoas alcançadas, não só quem assinou", async () => {
    const s = await setor("Governanca");
    const assinou = await criarFuncionario({ departmentId: s.id });
    await criarFuncionario({ departmentId: s.id }); // não assinou
    const doc = await criarDocumento({ departamentos: [s.id] });

    await db.aceiteDeDocumento.create({
      data: { userId: assinou.id, documentoId: doc.id, versao: 1 },
    });

    const { resumo } = await situacaoDoDocumento(doc.id);

    assert.equal(resumo.total, 2, "as duas pessoas do setor entram na conta");
    assert.equal(resumo.aceito, 1);
    assert.equal(resumo.pendente, 1);
  });

  it("administrador não é cobrado pela política que publica", async () => {
    const s = await setor("Eventos");
    await criarFuncionario({ departmentId: s.id });

    const admin = await criarAdministrador();
    await db.user.update({ where: { id: admin.id }, data: { departmentId: s.id } });

    const doc = await criarDocumento({ departamentos: [s.id] });
    const { resumo } = await situacaoDoDocumento(doc.id);

    assert.equal(resumo.total, 1, "só o funcionário conta");
  });

  it("desligado sai da conta", async () => {
    const s = await setor("Lavanderia");
    await criarFuncionario({ departmentId: s.id });
    const saiu = await criarFuncionario({ departmentId: s.id });
    await db.user.update({ where: { id: saiu.id }, data: { active: false } });

    const doc = await criarDocumento({ departamentos: [s.id] });
    const { resumo } = await situacaoDoDocumento(doc.id);

    assert.equal(resumo.total, 1);
  });
});
