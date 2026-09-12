/**
 * Tamanho mínimo da senha que a PESSOA escolhe.
 *
 * Era 6, e estava escrito em nove lugares: três validações de servidor
 * (redefinição, perfil e troca da provisória) e seis nas telas, entre
 * `minLength` e texto de ajuda. É o caso que este projeto repete em todo canto
 * — duas cópias da mesma regra acabam discordando —, e aqui a discordância
 * teria um jeito certo de aparecer: mudar só o servidor deixaria a tela aceitar
 * uma senha de sete caracteres para o servidor recusar logo depois.
 *
 * Por que 8. O bloqueio por tentativas segura quem tenta adivinhar pela tela de
 * login, mas não segura quem tem uma CÓPIA do banco, e o `npm run backup` gera
 * cópias. Com bcrypt, uma senha de 6 caracteres cai numa busca exaustiva que
 * uma de 8 torna muito mais cara. É também o piso que as recomendações
 * atuais de autenticação usam para senha escolhida pela pessoa.
 *
 * Só vale para senha NOVA: quem já tem uma de 6 continua entrando, e passa a
 * precisar de 8 quando trocar. Ninguém fica trancado do lado de fora.
 *
 * As provisórias (`senhaProvisoria`) têm 12 caracteres e não passam por aqui.
 *
 * Sem nenhum import, de propósito: as telas de senha são componentes de
 * cliente, e qualquer dependência de servidor que entrasse aqui iria parar no
 * pacote do navegador.
 */
export const SENHA_MINIMA = 8;

export const AVISO_SENHA_CURTA = `A senha deve ter ao menos ${SENHA_MINIMA} caracteres.`;
