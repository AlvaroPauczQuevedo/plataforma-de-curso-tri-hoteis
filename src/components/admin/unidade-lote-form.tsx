"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListPlus } from "lucide-react";
import { criarUnidadesEmLote } from "@/lib/actions/unidades";
import { nomesDoLote } from "@/lib/lote-de-unidades";

/**
 * Cadastro de vários hotéis de uma vez, um nome por linha.
 *
 * Fica recolhido por padrão, atrás do formulário simples. O caso comum do dia a
 * dia é acrescentar UM hotel; colar a rede inteira acontece uma vez. Deixar os
 * dois abertos lado a lado daria destaque igual a coisas de frequência bem
 * diferente e faria a tela parecer mais complicada do que é.
 */
export function UnidadeLoteForm() {
  const [texto, setTexto] = useState("");
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{
    criadas: string[];
    jaExistiam: string[];
  } | null>(null);
  const [pendente, iniciar] = useTransition();
  const router = useRouter();

  /*
    Conta pela MESMA função que o servidor usa, e não por linhas não vazias.
    Contar linhas dava um número maior que o de hotéis sempre que a lista tinha
    repetição — o botão prometia 26 e a tela depois dizia 25, fazendo a pessoa
    procurar o que tinha dado errado quando nada tinha.
  */
  const quantidade = nomesDoLote(texto).length;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (quantidade === 0) return;

    iniciar(async () => {
      const res = await criarUnidadesEmLote(texto);
      if (!res.ok) {
        setErro(res.error);
        setResultado(null);
        return;
      }
      setErro(null);
      setResultado({ criadas: res.criadas, jaExistiam: res.jaExistiam });
      /*
        Só limpa o campo quando algo foi criado. Se o lote inteiro já existia, o
        texto fica onde está — a pessoa acabou de colar aquilo e apagar sem ter
        acontecido nada a obrigaria a colar de novo para conferir.
      */
      if (res.criadas.length > 0) setTexto("");
      router.refresh();
    });
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-600"
      >
        <ListPlus className="h-4 w-4" />
        Cadastrar vários de uma vez
      </button>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-2 rounded-xl border border-border bg-surface-muted/40 p-4">
      <label htmlFor="lote-de-hoteis" className="block text-sm font-medium text-ink-900">
        Um hotel por linha
      </label>

      <textarea
        id="lote-de-hoteis"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={8}
        placeholder={"Tri Hotel Executive Caxias\nTri Hotel Smart Caxias\nTri Hotel & Flat Caxias"}
        className="w-full rounded-xl border border-border px-3.5 py-2 font-mono text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
      />

      <p className="text-xs text-ink-700/60">
        Nome repetido não é problema: o que já existe é apenas informado, e o
        resto do lote segue. Dá para colar a lista inteira de novo depois de
        acrescentar um hotel.
      </p>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pendente || quantidade === 0}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          <ListPlus className="h-4 w-4" />
          {pendente
            ? "Cadastrando..."
            : quantidade === 0
              ? "Cadastrar"
              : `Cadastrar ${quantidade} hotel(is)`}
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="text-sm text-ink-700/60 hover:text-ink-900"
        >
          Fechar
        </button>
      </div>

      {erro && <p className="text-xs text-danger-600">{erro}</p>}

      {resultado && (
        /*
          Diz o que foi criado E o que foi pulado. Só um número de criados
          deixaria a pessoa sem saber se o que faltou foi ignorado por já
          existir ou se sumiu por engano.
        */
        <div className="space-y-1 text-xs">
          {resultado.criadas.length > 0 && (
            <p className="text-success-700">
              {resultado.criadas.length} hotel(is) cadastrado(s).
            </p>
          )}
          {resultado.jaExistiam.length > 0 && (
            <p className="text-ink-700/70">
              Já existiam, não foram duplicados: {resultado.jaExistiam.join(", ")}
            </p>
          )}
          {resultado.criadas.length === 0 && resultado.jaExistiam.length > 0 && (
            <p className="text-ink-700/70">Nada novo a cadastrar.</p>
          )}
        </div>
      )}
    </form>
  );
}
