/**
 * A isca do console: uma credencial FALSA "esquecida" na tela de login.
 *
 * Quem abre as ferramentas do navegador na tela de login à procura de brecha
 * encontra o que parece um acesso de contingência que alguém esqueceu de tirar
 * antes de publicar. Não é: a conta não existe, e não pode existir, porque
 * `motivoDeNomeInvalido` recusa este nome em todo cadastro.
 *
 * A graça não é a piada, é o alarme. Nenhum funcionário tem motivo para digitar
 * este usuário, e ele não aparece em lugar nenhum além do console. Então quem
 * tenta entrar com ele leu o console procurando brecha, e isso é informação:
 * `lib/alarme-da-isca` registra a tentativa com a origem e avisa pelos mesmos
 * canais do monitoramento. Do lado de quem tentou, a resposta é idêntica à de
 * qualquer usuário desconhecido.
 *
 * O que foi evitado de propósito:
 *
 *  - **Formato de chave real** (AWS, Stripe, GitHub, JWT). Os scanners de
 *    segredo do GitHub e de ferramentas como o gitleaks reconhecem esses
 *    formatos e disparariam alerta falso contra o próprio repositório.
 *  - **Qualquer coisa verdadeira.** Nem endereço interno, nem nome de gente,
 *    nem pista da estrutura do banco. Que o login é por nome de usuário a
 *    própria tela já mostra.
 *
 * AVISO para auditoria e pentest: isto é proposital. Ver a seção "Isca do
 * console" no README.
 *
 * Sem nenhum import: a tela de login é componente de cliente, e este arquivo
 * vai inteiro para o navegador — que é justamente o objetivo.
 */
export const ISCA_USUARIO = "suporte.contingencia";

export const ISCA_SENHA = "Tri@Contingencia#2024";
