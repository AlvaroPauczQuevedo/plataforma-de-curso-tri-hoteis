"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, QrCode } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { abrirSessaoPresencial } from "@/lib/actions/presenca";

/**
 * Abre a lista de presença.
 *
 * A sessão nasce ABERTA — não há rascunho aqui, ao contrário da trilha e do
 * documento. O instrutor está na sala com a turma esperando, e um segundo
 * clique para publicar seria atrito no pior momento possível. O que protege a
 * lista não é o rascunho: é o código girar a cada trinta segundos.
 */
export function SessaoPresencialForm({
  cursos,
  instrutorPadrao,
}: {
  cursos: { id: string; title: string }[];
  instrutorPadrao: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const router = useRouter();

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);

    setErro(null);
    startTransition(async () => {
      const res = await abrirSessaoPresencial(dados);
      if (!res.ok) {
        setErro(res.error);
        return;
      }
      setAberto(false);
      router.refresh();
    });
  }

  if (cursos.length === 0) {
    return (
      <p className="text-sm text-ink-700/60">
        Nenhum curso publicado no seu alcance para aplicar presencialmente.
      </p>
    );
  }

  if (!aberto) {
    return (
      <Button type="button" onClick={() => setAberto(true)}>
        <QrCode className="h-4 w-4" />
        Abrir lista de presença
      </Button>
    );
  }

  return (
    <form
      onSubmit={enviar}
      className="w-full space-y-3 rounded-2xl border border-border bg-surface p-4"
    >
      {erro && <Alert tone="danger">{erro}</Alert>}

      <div>
        <label htmlFor="courseId" className="text-sm font-medium text-ink-900">
          Treinamento
        </label>
        <select
          id="courseId"
          name="courseId"
          required
          defaultValue=""
          className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Escolha o curso…
          </option>
          {cursos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="instrutor" className="text-sm font-medium text-ink-900">
            Quem aplicou
          </label>
          <input
            id="instrutor"
            name="instrutor"
            required
            defaultValue={instrutorPadrao}
            placeholder="Corpo de Bombeiros"
            className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="local" className="text-sm font-medium text-ink-900">
            Local <span className="font-normal text-ink-700/60">(opcional)</span>
          </label>
          <input
            id="local"
            name="local"
            placeholder="Salão de eventos — Canela"
            className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="titulo" className="text-sm font-medium text-ink-900">
            Turma <span className="font-normal text-ink-700/60">(opcional)</span>
          </label>
          <input
            id="titulo"
            name="titulo"
            placeholder="Turma da tarde"
            className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-ink-700/60">
            Distingue duas turmas do mesmo curso no mesmo dia — o hotel não para inteiro.
          </p>
        </div>

        <div>
          <label htmlFor="duracaoMinutos" className="text-sm font-medium text-ink-900">
            Fica aberta por
          </label>
          <select
            id="duracaoMinutos"
            name="duracaoMinutos"
            defaultValue="120"
            className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          >
            <option value="30">30 minutos</option>
            <option value="60">1 hora</option>
            <option value="120">2 horas</option>
            <option value="240">4 horas</option>
            <option value="480">8 horas</option>
          </select>
          <p className="mt-1 text-xs text-ink-700/60">
            Depois disso ninguém mais bipa, mesmo sem você fechar a lista.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="h-4 w-4 animate-spin" />}
          Abrir e mostrar o QR
        </Button>
        <Button type="button" variant="secondary" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
