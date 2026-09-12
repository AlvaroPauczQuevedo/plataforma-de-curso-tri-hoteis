/**
 * O alarme da isca do console. Ver `lib/isca-de-console` para a ideia inteira.
 *
 * Roda dentro do login, e isso impõe duas regras que valem mais do que o
 * próprio alarme:
 *
 *  - **Nunca muda a resposta.** Quem tentou recebe "usuário ou senha
 *    inválidos", como qualquer usuário desconhecido. Uma mensagem diferente,
 *    ou uma resposta mais LENTA, contaria que ali existe uma armadilha. Por
 *    isso o login não espera o alarme terminar: o aviso por e-mail e webhook
 *    pode levar segundos, e esse atraso seria mensurável de fora.
 *  - **Nunca lança.** Falha ao avisar não pode virar falha de login.
 *
 * E tem teto. Quem descobrir a isca poderia martelá-la de muitos endereços
 * para lotar o registro de erros e a caixa de quem recebe os avisos. Acima do
 * teto o alarme só se cala; a tentativa continua registrada em `LoginAttempt`,
 * como toda tentativa.
 */
import { ISCA_SENHA, ISCA_USUARIO } from "@/lib/isca-de-console";
import { registrarErro } from "@/lib/monitoramento";
import { consumirVagaCompartilhada } from "@/lib/teto-compartilhado";

const UMA_HORA_MS = 60 * 60_000;

/**
 * O nome digitado é o da isca?
 *
 * Recebe o nome JÁ normalizado, o mesmo que o login usa para procurar a conta.
 * Assim "Suporte Contingência" digitado no celular também conta.
 */
export function ehIsca(nomeNormalizado: string): boolean {
  return nomeNormalizado === ISCA_USUARIO;
}

/**
 * Registra que alguém mordeu a isca e avisa quem acompanha o monitoramento.
 *
 * A senha digitada NUNCA é gravada. Guarda-se só se era a senha falsa inteira,
 * o que separa "leu o console e copiou tudo" de "chutou o nome". Gravar o
 * texto digitado seria guardar senha em claro no registro de erros; e se
 * quem digitou fosse um funcionário curioso, seria a senha verdadeira dele.
 */
export async function dispararAlarmeDaIsca(tentativa: {
  ip: string;
  senha: string;
}): Promise<void> {
  try {
    // Lido a cada chamada, e não no carregamento, para o teste poder ajustar.
    const teto = Number(process.env.ISCA_TETO_POR_HORA ?? 20);

    const cabe = consumirVagaCompartilhada({
      arquivo: "alarmes-da-isca.json",
      chave: "global",
      teto,
      duracaoMs: UMA_HORA_MS,
    });
    if (!cabe) return;

    const origem = tentativa.ip || "origem desconhecida (sem TRUST_PROXY)";
    const copiouTudo = tentativa.senha === ISCA_SENHA;

    await registrarErro(
      new Error(
        `Alguém mordeu a isca do console: login com "${ISCA_USUARIO}" a partir de ${origem}` +
          (copiouTudo ? ", usando a senha falsa inteira" : ", com outra senha")
      ),
      "login — isca do console"
    );
  } catch {
    // O alarme é um bônus. O login não pode pagar por uma falha dele.
  }
}
