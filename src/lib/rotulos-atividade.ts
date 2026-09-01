/**
 * Como cada ação administrativa é lida no histórico.
 *
 * Vive sozinho porque este mapa já existiu duplicado no Dashboard e na tela
 * de Atividades. Duas cópias querem dizer que registrar uma ação nova exige
 * lembrar de dois arquivos, e quem esquece não vê erro nenhum: a tela cai no
 * código cru e mostra "despublicar_prova" para o usuário. Foi exatamente o
 * que aconteceu com onze ações antes desta unificação.
 */
export const ROTULOS_DE_ATIVIDADE: Record<string, string> = {
  CRIAR_CURSO: "criou o curso",
  EDITAR_CURSO: "editou o curso",
  DUPLICAR_CURSO: "duplicou o curso",
  EXCLUIR_CURSO: "excluiu o curso",
  CURSO_PUBLISHED: "publicou o curso",
  CURSO_DRAFT: "moveu para rascunho o curso",
  CURSO_ARCHIVED: "arquivou o curso",
  CRIAR_MODULO: "criou um módulo em",

  CRIAR_PROVA: "criou a prova",
  EDITAR_PROVA: "editou a prova",
  EXCLUIR_PROVA: "excluiu a prova",
  PUBLICAR_PROVA: "publicou a prova",
  DESPUBLICAR_PROVA: "moveu para rascunho a prova",
  EXCLUIR_QUESTAO: "excluiu uma questão da prova",

  CRIAR_FUNCIONARIO: "cadastrou o funcionário",
  EDITAR_FUNCIONARIO: "editou o funcionário",
  ATIVAR_FUNCIONARIO: "ativou o acesso de",
  DESATIVAR_FUNCIONARIO: "desativou o acesso de",
  EXCLUIR_USUARIO: "excluiu a conta de",
  REDEFINIR_SENHA: "redefiniu a senha de",
  GERAR_LINK_REDEFINICAO: "gerou link de redefinição de senha para",

  MATRICULAR: "realizou matrícula(s):",
  REMOVER_MATRICULA: "removeu matrícula de",
  CURSO_OBRIGATORIO: "tornou o curso obrigatório em",
  REMOVER_OBRIGATORIEDADE: "removeu a obrigatoriedade do curso em",

  CRIAR_DEPARTAMENTO: "criou o departamento",
  EXCLUIR_DEPARTAMENTO: "excluiu o departamento",
  CRIAR_CATEGORIA: "criou a categoria",
  SINCRONIZAR_INTRANET: "sincronizou com a intranet",
};

/**
 * O rótulo da ação, ou o próprio código quando é uma ação que ninguém
 * traduziu ainda.
 *
 * Devolver o código é feio de propósito: aparece na tela, alguém repara, e
 * o rótulo que falta é acrescentado. Silenciar a linha esconderia o registro
 * justamente de quem audita.
 */
export function rotuloDaAtividade(action: string) {
  return ROTULOS_DE_ATIVIDADE[action] ?? action.toLowerCase().replace(/_/g, " ");
}
