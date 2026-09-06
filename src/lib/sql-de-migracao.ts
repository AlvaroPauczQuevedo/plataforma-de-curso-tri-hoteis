/**
 * Leitura do SQL de uma migração do Prisma.
 *
 * Módulo próprio, sem nenhuma dependência de banco, por dois motivos: o teste
 * pode exercitá-lo sem instanciar cliente nenhum, e `migracoes.ts` — que roda
 * na subida do servidor, antes da primeira requisição — fica só com a decisão
 * de o que aplicar, sem carregar também a de como interpretar o arquivo.
 */
import { createHash } from "node:crypto";

/**
 * Divide o arquivo de migração em comandos.
 *
 * O `prisma migrate deploy` executa o arquivo inteiro de uma vez, mas nesta
 * hospedagem ele não roda (o motor de migração não consegue o lock do SQLite
 * durante a publicação). Aplicando pelo cliente do Prisma, cada comando vai
 * numa chamada, e é aqui que o arquivo vira essa lista.
 *
 * Duas sutilezas que o corte ingênuo por `;` erraria:
 *
 *  - `;` dentro de texto entre apóstrofos não termina comando. Aparece em
 *    valor padrão e em dado semeado pela própria migração.
 *  - apóstrofo dobrado (`''`) é apóstrofo literal, e não o fim do texto.
 *
 * LIMITE conhecido: gatilho ou função com `;` no corpo precisaria de mais do
 * que isto. O SQL que o Prisma gera para SQLite não usa nenhum dos dois, e o
 * teste confere o resultado contra a execução do arquivo inteiro.
 */
export function comandosDe(sql: string): string[] {
  const comandos: string[] = [];
  let atual = "";
  let dentroDeTexto = false;

  for (const linha of sql.split(/\r?\n/)) {
    const semComentario = dentroDeTexto ? linha : linha.replace(/^\s*--.*$/, "");

    /*
      Linha em branco ENTRE comandos é descartada; dentro de um comando ela é
      preservada. A distinção não é estética: o SQLite guarda em `sqlite_master`
      o texto do `CREATE TABLE` exatamente como recebeu, então descartar a linha
      vazia fazia o DDL registrado divergir do que o `prisma migrate deploy`
      registraria. Estrutura idêntica, texto diferente — e o teste que compara
      os dois caminhos pegou isso.
    */
    const entreComandos = atual.trim() === "";
    if (!dentroDeTexto && semComentario.trim() === "" && entreComandos) continue;

    for (let i = 0; i < semComentario.length; i += 1) {
      const c = semComentario[i];

      if (c === "'") {
        if (dentroDeTexto && semComentario[i + 1] === "'") {
          atual += "''";
          i += 1;
          continue;
        }
        dentroDeTexto = !dentroDeTexto;
        atual += c;
        continue;
      }

      if (c === ";" && !dentroDeTexto) {
        if (atual.trim()) comandos.push(atual.trim());
        atual = "";
        continue;
      }

      atual += c;
    }

    atual += "\n";
  }

  if (atual.trim()) comandos.push(atual.trim());
  return comandos;
}

/**
 * O erro diz que o objeto que o comando criaria já existe?
 *
 * Existe para reconciliar um banco em DESVIO: schema que já contém parte do
 * que uma migração criaria, sem que ela conste em `_prisma_migrations`. Foi o
 * estado real da produção em 2026-09-06 — `CursoObrigatorio.validadeMeses` já
 * estava lá, a migração não estava registrada, e o aplicador parava na primeira
 * linha travando as três migrações seguintes. Login fora do ar por causa disso.
 *
 * Tolerar SÓ esta família de erros é o ponto. `duplicate column name`,
 * `table já existe` e `index já existe` significam que o fim pretendido
 * daquele comando já foi alcançado, então pular é seguir para o mesmo lugar.
 * Qualquer outro erro — sintaxe, restrição violada, tabela ausente — continua
 * interrompendo tudo, porque aí o banco NÃO está onde a migração queria.
 *
 * Ressalva assumida: um objeto de mesmo nome e forma diferente também passaria
 * por aqui. É o preço de reconciliar desvio sem terminal no servidor, e por
 * isso cada comando pulado é registrado e aparece em `/api/saude`.
 */
export function ehObjetoJaExistente(mensagem: string): boolean {
  return (
    /duplicate column name/i.test(mensagem) ||
    /table \S+ already exists/i.test(mensagem) ||
    /index \S+ already exists/i.test(mensagem)
  );
}

/**
 * O mesmo checksum que o Prisma grava em `_prisma_migrations`: SHA-256 do
 * conteúdo do arquivo.
 *
 * Precisa bater exatamente, senão o `prisma migrate` seguinte acusa que a
 * migração foi alterada depois de aplicada e recusa continuar.
 */
export function checksumDe(conteudo: string): string {
  return createHash("sha256").update(conteudo).digest("hex");
}
