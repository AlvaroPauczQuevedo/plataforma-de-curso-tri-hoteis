import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { criarAdministrador, db, encerrar } from "./ambiente";

// Depois do ambiente, que já apontou DATABASE_URL para o banco temporário.
import { bloqueioDeUsoDeProva } from "../src/lib/alcance-admin";

after(encerrar);

/**
 * Quem pode APLICAR uma prova numa aula.
 *
 * É uma pergunta diferente da de alterar a prova, e por isso tem trava
 * própria. O buraco que ela fecha: um administrador de departamento anexava a
 * prova de outro setor a um curso dele e, pela porta "por curso" do alcance do
 * funcionário, liberava a prova alheia para a equipe inteira — sem nunca ter
 * tido permissão de abrir aquela prova.
 *
 * A regra é a do ALCANCE, não a da edição: prova geral serve a qualquer curso,
 * porque é para isso que ela é geral.
 */

let contador = 0;
const unico = (prefixo: string) => `${prefixo} ${(contador += 1)}`;

async function criarDepartamento() {
  return db.department.create({ data: { name: unico("Setor") } });
}

async function criarProva(departmentId: string | null) {
  const autor = await criarAdministrador();
  return db.prova.create({
    data: {
      titulo: unico("Prova"),
      departmentId,
      publicada: true,
      createdById: autor.id,
    },
  });
}

/** Administrador comum, preso a um departamento. */
async function criarAdminDeSetor(departmentId: string) {
  const admin = await criarAdministrador();
  return db.user.update({ where: { id: admin.id }, data: { departmentId } });
}

/** A conta protegida, que administra a plataforma inteira. */
async function criarProprietario() {
  const admin = await criarAdministrador();
  return db.user.update({ where: { id: admin.id }, data: { protegido: true } });
}

describe("Administrador de departamento", () => {
  it("aplica prova do próprio setor", async () => {
    const setor = await criarDepartamento();
    const admin = await criarAdminDeSetor(setor.id);
    const prova = await criarProva(setor.id);

    assert.equal(await bloqueioDeUsoDeProva(prova.id, admin.id), null);
  });

  it("aplica prova geral, que não tem dono", async () => {
    /*
      Aqui a regra de aplicar SEPARA-se da de alterar: prova sem departamento
      só o proprietário edita, mas qualquer curso pode aplicá-la. Reusar a
      trava de edição recusaria este caso, que é legítimo.
    */
    const setor = await criarDepartamento();
    const admin = await criarAdminDeSetor(setor.id);
    const geral = await criarProva(null);

    assert.equal(await bloqueioDeUsoDeProva(geral.id, admin.id), null);
  });

  it("NÃO aplica prova de outro setor", async () => {
    const meu = await criarDepartamento();
    const alheio = await criarDepartamento();
    const admin = await criarAdminDeSetor(meu.id);
    const prova = await criarProva(alheio.id);

    const recusa = await bloqueioDeUsoDeProva(prova.id, admin.id);

    assert.ok(recusa, "deveria recusar prova de outro departamento");
    assert.equal(recusa.ok, false);
    assert.match(recusa.error, /outro departamento/);
  });

  it("alcança pelos departamentos adicionais também", async () => {
    const principal = await criarDepartamento();
    const extra = await criarDepartamento();
    const admin = await criarAdminDeSetor(principal.id);
    await db.departamentoExtra.create({
      data: { userId: admin.id, departmentId: extra.id },
    });

    const prova = await criarProva(extra.id);

    assert.equal(await bloqueioDeUsoDeProva(prova.id, admin.id), null);
  });

  it("administrador sem departamento nenhum não aplica prova de setor", async () => {
    const alheio = await criarDepartamento();
    const admin = await criarAdministrador(); // sem departmentId
    const prova = await criarProva(alheio.id);

    assert.ok(await bloqueioDeUsoDeProva(prova.id, admin.id));
  });
});

describe("Proprietário", () => {
  it("aplica prova de qualquer departamento", async () => {
    const alheio = await criarDepartamento();
    const dono = await criarProprietario();
    const prova = await criarProva(alheio.id);

    assert.equal(await bloqueioDeUsoDeProva(prova.id, dono.id), null);
  });
});

describe("Casos que não existem", () => {
  it("prova inexistente é recusada, não ignorada", async () => {
    const setor = await criarDepartamento();
    const admin = await criarAdminDeSetor(setor.id);

    const recusa = await bloqueioDeUsoDeProva("id-que-nao-existe", admin.id);

    assert.ok(recusa);
    assert.match(recusa.error, /não encontrada/i);
  });

  it("ator inexistente é recusado", async () => {
    const prova = await criarProva(null);

    const recusa = await bloqueioDeUsoDeProva(prova.id, "ator-que-nao-existe");

    assert.ok(recusa);
    assert.match(recusa.error, /sess/i);
  });
});
