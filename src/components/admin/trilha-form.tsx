"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { criarTrilha } from "@/lib/actions/trilhas";

/**
 * Criação da trilha. Nasce como RASCUNHO, sempre.
 *
 * Publicar é um segundo clique deliberado porque publicar matricula gente de
 * verdade: uma trilha de cinco cursos atribuída a um setor cria cinco
 * matrículas por pessoa. Criar e publicar no mesmo botão faria isso acontecer
 * antes de alguém conferir a ordem dos degraus.
 */
export function TrilhaForm({
  departamentos,
  proprietario,
}: {
  departamentos: { id: string; name: string }[];
  proprietario: boolean;
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
      const res = await criarTrilha(dados);
      if (!res.ok) {
        setErro(res.error);
        return;
      }
      setAberto(false);
      router.refresh();
    });
  }

  if (!aberto) {
    return (
      <Button type="button" onClick={() => setAberto(true)}>
        <Plus className="h-4 w-4" />
        Nova trilha
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
        <label htmlFor="titulo" className="text-sm font-medium text-ink-900">
          Título
        </label>
        <input
          id="titulo"
          name="titulo"
          required
          placeholder="Integração de novos colaboradores"
          className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="descricao" className="text-sm font-medium text-ink-900">
          Descrição <span className="font-normal text-ink-700/60">(opcional)</span>
        </label>
        <textarea
          id="descricao"
          name="descricao"
          rows={2}
          placeholder="O que esta sequência prepara a pessoa para fazer."
          className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="departmentId" className="text-sm font-medium text-ink-900">
          Departamento dono
        </label>
        <select
          id="departmentId"
          name="departmentId"
          defaultValue=""
          className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
        >
          {/*
            "Da rede" só aparece para o proprietário. Para os demais a opção
            nem existe, em vez de existir e ser recusada no envio — oferecer um
            caminho que termina em erro é pior do que não oferecê-lo.
          */}
          {proprietario && <option value="">Da rede (só o proprietário altera)</option>}
          {departamentos.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-ink-700/60">
          Quem pode alterar a trilha. Não é quem vai fazê-la — isso se define atribuindo a
          trilha a um ou mais setores, depois de montar os degraus.
        </p>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="h-4 w-4 animate-spin" />}
          Criar rascunho
        </Button>
        <Button type="button" variant="secondary" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
