import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { criarAdministrador, criarCurso, criarFuncionario, db, encerrar, matricular } from "./ambiente";

// Depois do ambiente, que já apontou DATABASE_URL para o banco temporário.
import { fileBelongsToAccessibleCourse } from "../src/lib/access";

after(encerrar);

/**
 * Quem pode baixar qual arquivo.
 *
 * Esta é a única barreira entre um id de arquivo e o vídeo, o PDF ou a capa
 * que ele guarda — /api/files não tem outra. Ela roda em CADA requisição do
 * player, inclusive em cada pedido de trecho de vídeo, e por isso acabou de
 * ser reescrita para fazer as três consultas em paralelo. Reescrever a única
 * barreira de um acervo pede teste que confira o que ela decide, não só que
 * ela ficou mais rápida.
 */

let contador = 0;
const unico = (prefixo: string) => `${prefixo}-${(contador += 1)}`;

async function criarArquivo(kind: "VIDEO" | "PDF" | "COVER" | "AVATAR") {
  const dono = await criarAdministrador();
  return db.fileAsset.create({
    data: {
      filename: unico("arquivo"),
      originalName: "original.bin",
      mimeType: kind === "PDF" ? "application/pdf" : "video/mp4",
      size: 10,
      storagePath: `${kind.toLowerCase()}/${unico("x")}`,
      kind,
      uploadedById: dono.id,
    },
  });
}

describe("Administrador", () => {
  it("alcança qualquer arquivo, inclusive um sem vínculo nenhum", async () => {
    const solto = await criarArquivo("COVER");
    const admin = await criarAdministrador();

    assert.equal(await fileBelongsToAccessibleCourse(admin.id, solto.id, true), true);
  });
});

describe("Vídeo e PDF de aula", () => {
  it("liberado para quem está matriculado no curso", async () => {
    const video = await criarArquivo("VIDEO");
    const { curso, aulas } = await criarCurso({ aulas: [{ tipo: "VIDEO" }] });
    await db.lesson.update({ where: { id: aulas[0]!.id }, data: { videoFileId: video.id } });

    const aluno = await criarFuncionario();
    await matricular(aluno.id, curso.id);

    assert.equal(await fileBelongsToAccessibleCourse(aluno.id, video.id, false), true);
  });

  it("recusado para quem não está matriculado", async () => {
    const video = await criarArquivo("VIDEO");
    const { aulas } = await criarCurso({ aulas: [{ tipo: "VIDEO" }] });
    await db.lesson.update({ where: { id: aulas[0]!.id }, data: { videoFileId: video.id } });

    const estranho = await criarFuncionario();

    assert.equal(await fileBelongsToAccessibleCourse(estranho.id, video.id, false), false);
  });

  it("o PDF segue a mesma regra do vídeo", async () => {
    const pdf = await criarArquivo("PDF");
    const { curso, aulas } = await criarCurso({ aulas: [{ tipo: "PDF" }] });
    await db.lesson.update({ where: { id: aulas[0]!.id }, data: { pdfFileId: pdf.id } });

    const aluno = await criarFuncionario();
    const estranho = await criarFuncionario();
    await matricular(aluno.id, curso.id);

    assert.equal(await fileBelongsToAccessibleCourse(aluno.id, pdf.id, false), true);
    assert.equal(await fileBelongsToAccessibleCourse(estranho.id, pdf.id, false), false);
  });
});

describe("Capa de curso", () => {
  it("capa de curso publicado é pública para quem tem login", async () => {
    // A capa aparece no catálogo, que é a lista de cursos que dá para pedir.
    const capa = await criarArquivo("COVER");
    const { curso } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });
    await db.course.update({ where: { id: curso.id }, data: { coverFileId: capa.id } });

    const qualquerUm = await criarFuncionario();

    assert.equal(await fileBelongsToAccessibleCourse(qualquerUm.id, capa.id, false), true);
  });

  it("capa de rascunho só para quem está matriculado", async () => {
    /*
      A capa de um rascunho revelaria um curso que ainda não foi liberado —
      inclusive o título, pelo nome do arquivo que a tela pede.
    */
    const capa = await criarArquivo("COVER");
    const { curso } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });
    await db.course.update({
      where: { id: curso.id },
      data: { coverFileId: capa.id, status: "DRAFT" },
    });

    const dentro = await criarFuncionario();
    const fora = await criarFuncionario();
    await matricular(dentro.id, curso.id);

    assert.equal(await fileBelongsToAccessibleCourse(dentro.id, capa.id, false), true);
    assert.equal(await fileBelongsToAccessibleCourse(fora.id, capa.id, false), false);
  });
});

describe("Casos soltos", () => {
  it("avatar é liberado: aparece no cabeçalho de quem estiver na tela", async () => {
    const avatar = await criarArquivo("AVATAR");
    const pessoa = await criarFuncionario();

    assert.equal(await fileBelongsToAccessibleCourse(pessoa.id, avatar.id, false), true);
  });

  it("arquivo sem vínculo nenhum é recusado", async () => {
    // Enviado e nunca usado: não pertence a curso, aula nem perfil.
    const orfao = await criarArquivo("COVER");
    const pessoa = await criarFuncionario();

    assert.equal(await fileBelongsToAccessibleCourse(pessoa.id, orfao.id, false), false);
  });

  it("id inexistente é recusado", async () => {
    const pessoa = await criarFuncionario();

    assert.equal(
      await fileBelongsToAccessibleCourse(pessoa.id, "id-que-nao-existe", false),
      false
    );
  });
});
