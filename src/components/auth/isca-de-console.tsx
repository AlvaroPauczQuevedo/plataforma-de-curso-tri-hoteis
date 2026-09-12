"use client";

import { useEffect } from "react";
import { ISCA_SENHA, ISCA_USUARIO } from "@/lib/isca-de-console";

/*
  Uma vez por carregamento de página. Em desenvolvimento o React executa os
  efeitos duas vezes, e duas cópias do mesmo "vazamento" soariam encenadas.
*/
let jaImpresso = false;

/**
 * Imprime no console o "vazamento" falso. Não desenha nada.
 *
 * O texto imita um resto de depuração que alguém esqueceu de apagar. Se
 * parecesse um convite, ninguém tentaria usar. Ver `lib/isca-de-console`.
 */
export function IscaDeConsole() {
  useEffect(() => {
    if (jaImpresso) return;
    jaImpresso = true;

    console.warn(
      "[auth] acesso de contingência ainda habilitado — remover antes do go-live (chamado #4471)"
    );
    console.log("[auth] fallback carregado:", {
      provider: "credentials",
      contingencia: true,
      usuario: ISCA_USUARIO,
      senha: ISCA_SENHA,
      expira: "após migração do cadastro",
    });
  }, []);

  return null;
}
