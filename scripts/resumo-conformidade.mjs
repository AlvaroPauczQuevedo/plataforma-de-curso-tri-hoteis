/**
 * Envia o resumo de conformidade por e-mail.
 *
 * O problema que isto resolve é o mesmo do monitoramento de erros: a
 * informação já existe e depende de alguém LEMBRAR de ir buscá-la. A tela
 * `/admin/conformidade` responde exatamente a pergunta que auditoria e RH
 * fazem — nome a nome, quem está em dia e quem está atrasado —, e fica parada
 * até alguém abri-la. Treinamento obrigatório vencido não avisa que venceu.
 *
 * Aqui a pergunta passa a chegar sozinha.
 *
 * Roda por agendador, e não dentro da aplicação, de propósito: a plataforma
 * sobe em modo standalone, sem processo de fundo, e um temporizador dentro do
 * servidor dispararia de novo a cada reinício ou a cada instância.
 *
 *   # cron, toda segunda às 8h
 *   0 8 * * 1  cd /caminho/do/projeto && npm run conformidade:resumo
 *
 * No Windows, use o Agendador de Tarefas com a mesma linha.
 *
 * Variáveis:
 *   RESUMO_CONFORMIDADE_EMAIL   destino (obrigatório para enviar)
 *   as cinco de SMTP            sem elas, nada é enviado
 *
 * Sem destino ou sem SMTP, o resumo é impresso na saída e o script termina bem:
 * assim dá para agendá-lo antes de configurar o e-mail, e conferir o que sairia.
 *
 * `--seco` imprime sem enviar, mesmo com tudo configurado.
 */
import { levantarObrigacoes, pendenciasPorSetor } from "../src/lib/conformidade.ts";
import { emailDeConformidade, enviarEmail, envioDisponivel } from "../src/lib/email.ts";

const seco = process.argv.includes("--seco");
const destino = process.env.RESUMO_CONFORMIDADE_EMAIL?.trim();

const { linhas, resumo } = await levantarObrigacoes();
const porSetor = await pendenciasPorSetor(linhas);

console.log(
  [
    `obrigações: ${resumo.total}`,
    `em dia: ${resumo.em_dia}`,
    `atrasadas: ${resumo.atrasado}`,
    `vencendo: ${resumo.vencendo}`,
    `sem prazo: ${resumo.pendente}`,
  ].join(" | ")
);

const mensagem = emailDeConformidade({
  atrasados: resumo.atrasado,
  vencendo: resumo.vencendo,
  porSetor,
});

/*
  Nada a cobrar não gera e-mail. Um resumo que chega toda semana dizendo "está
  tudo bem" é o que ensina quem recebe a arquivá-lo sem ler.
*/
if (!mensagem) {
  console.log("Nada em atraso nem vencendo. Nenhum e-mail enviado.");
  process.exit(0);
}

console.log("");
console.log(mensagem.assunto);
console.log("");
console.log(mensagem.texto);
console.log("");

if (seco) {
  console.log("[--seco] nada foi enviado.");
  process.exit(0);
}

if (!destino) {
  console.log("RESUMO_CONFORMIDADE_EMAIL não definida — nada enviado.");
  process.exit(0);
}

if (!envioDisponivel()) {
  console.log("SMTP não configurado — nada enviado.");
  process.exit(0);
}

const envio = await enviarEmail({ ...mensagem, para: destino });

if (envio.enviado) {
  console.log(`Resumo enviado para ${destino}.`);
  process.exit(0);
}

/*
  Falha de envio SAI com erro, ao contrário do resto do sistema.

  Nos outros pontos o e-mail é um extra sobre uma operação que já deu certo — o
  funcionário foi cadastrado, o link foi gerado — e derrubar tudo por causa do
  aviso seria pior. Aqui o envio é a única razão do script existir: se ele
  falhar em silêncio, o agendador marca sucesso e ninguém descobre que o resumo
  parou de chegar.
*/
console.error(`Falha ao enviar: ${envio.detalhe ?? envio.motivo}`);
process.exit(1);
