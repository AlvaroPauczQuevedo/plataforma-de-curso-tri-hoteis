"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Recarrega a lista enquanto a sessão está aberta.
 *
 * Sem isto o instrutor projeta o QR, vê trinta pessoas apontando a câmera e a
 * tela dele não mexe — e ele não tem como saber quem faltou bipar, que é a
 * única coisa que ele precisa saber naquele momento.
 *
 * Cinco segundos: rápido o bastante para o nome aparecer enquanto a pessoa
 * ainda está olhando, devagar o bastante para não martelar o servidor durante
 * as duas horas de treinamento. Não renderiza nada.
 */
export function PresencaAoVivo({ ativo }: { ativo: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!ativo) return;
    const timer = setInterval(() => router.refresh(), 5_000);
    return () => clearInterval(timer);
  }, [ativo, router]);

  return null;
}
