"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Users, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  buscarPessoasParaMatricula,
  enrollUsers,
  pessoasDoDepartamento,
} from "@/lib/actions/enrollments";
import { LIMITE_DA_BUSCA, type PessoaParaMatricula } from "@/lib/matricula-busca";

type Course = { id: string; title: string };
type Departamento = { id: string; name: string };

/**
 * Quantas etiquetas mostrar antes de recolher.
 *
 * Matricular um setor inteiro pode somar oitenta pessoas de uma vez, e oitenta
 * etiquetas viram uma parede que empurra o botão de matricular para fora da
 * tela. Recolher mantém a contagem visível, que é o que importa conferir.
 */
const ETIQUETAS_VISIVEIS = 12;

/** Espera entre a última tecla e a consulta. */
const ATRASO_MS = 300;

const campoClasse =
  "w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";

/**
 * Matrícula em massa, com busca no SERVIDOR.
 *
 * Antes a página serializava toda conta ativa dentro do HTML — este é um
 * componente de cliente, então a lista inteira viajava a cada abertura. Com
 * 700 contas passava de 400 KB, carregados no celular de quem só queria
 * matricular três pessoas, e crescia em linha reta com a rede.
 *
 * A troca traz um problema novo que precisa ser resolvido junto: com a lista
 * mudando a cada busca, **a seleção não pode viver na lista**. Quem procura
 * "maria", marca três, e depois procura "joão" não pode perder as marias. Por
 * isso `selecionados` guarda id E nome, independente do que está em tela, e as
 * escolhidas aparecem como etiquetas acima da lista.
 */
export function BulkEnrollForm({
  courses,
  iniciais,
  departamentos,
}: {
  courses: Course[];
  /** Primeira página, renderizada no servidor: a lista não abre vazia. */
  iniciais: PessoaParaMatricula[];
  departamentos: Departamento[];
}) {
  const [courseId, setCourseId] = useState("");
  const [mandatory, setMandatory] = useState(false);
  const [dueDate, setDueDate] = useState("");

  const [busca, setBusca] = useState("");
  const [pessoas, setPessoas] = useState<PessoaParaMatricula[]>(iniciais);
  const [buscando, setBuscando] = useState(false);

  /** id -> nome. O nome é guardado porque a lista em tela muda. */
  const [selecionados, setSelecionados] = useState<Map<string, string>>(new Map());

  const [departamento, setDepartamento] = useState("");
  const [adicionandoSetor, iniciarSetor] = useTransition();
  const [avisoDoSetor, setAvisoDoSetor] = useState<string | null>(null);
  const [mostrarTodas, setMostrarTodas] = useState(false);

  const [pendente, iniciar] = useTransition();
  const [resultado, setResultado] = useState<
    { ok: boolean; message?: string; error?: string } | null
  >(null);
  const router = useRouter();

  /*
    Espera o dedo parar antes de consultar.

    Sem isto, cada tecla de "manipulação" dispararia doze consultas, e a
    resposta de uma busca antiga poderia chegar depois da nova e sobrescrever
    a lista com o resultado errado. O contador de pedidos abaixo descarta o
    que chega fora de ordem.
  */
  const pedido = useRef(0);

  useEffect(() => {
    const meu = ++pedido.current;
    const relogio = setTimeout(async () => {
      setBuscando(true);
      try {
        const achadas = await buscarPessoasParaMatricula(busca);
        // Resposta atrasada de uma busca que já não é a atual: descarta.
        if (meu === pedido.current) setPessoas(achadas);
      } finally {
        if (meu === pedido.current) setBuscando(false);
      }
    }, ATRASO_MS);

    return () => clearTimeout(relogio);
  }, [busca]);

  function alternar(pessoa: PessoaParaMatricula) {
    setSelecionados((antes) => {
      const proximo = new Map(antes);
      if (proximo.has(pessoa.id)) proximo.delete(pessoa.id);
      else proximo.set(pessoa.id, pessoa.name);
      return proximo;
    });
  }

  /** Marca ou desmarca as que estão em tela, sem tocar nas outras. */
  function alternarVisiveis() {
    const todasMarcadas = pessoas.length > 0 && pessoas.every((p) => selecionados.has(p.id));
    setSelecionados((antes) => {
      const proximo = new Map(antes);
      for (const p of pessoas) {
        if (todasMarcadas) proximo.delete(p.id);
        else proximo.set(p.id, p.name);
      }
      return proximo;
    });
  }

  /**
   * Junta o setor inteiro à seleção, sem substituir o que já estava marcado.
   *
   * Somar, e não trocar, porque o caso real é montar uma turma a partir de
   * dois setores — "cozinha e lavanderia" — e um clique que apagasse o
   * anterior obrigaria a refazer tudo sem avisar.
   */
  function adicionarSetor() {
    if (!departamento) return;
    const nome = departamentos.find((d) => d.id === departamento)?.name ?? "o setor";

    iniciarSetor(async () => {
      const pessoasDoSetor = await pessoasDoDepartamento(departamento);

      let novas = 0;
      setSelecionados((antes) => {
        const proximo = new Map(antes);
        for (const p of pessoasDoSetor) {
          if (!proximo.has(p.id)) novas += 1;
          proximo.set(p.id, p.name);
        }
        return proximo;
      });

      const jaEstavam = pessoasDoSetor.length - novas;
      setAvisoDoSetor(
        pessoasDoSetor.length === 0
          ? `Não há ninguém ativo em ${nome}.`
          : `${novas} pessoa(s) de ${nome} adicionada(s)` +
              (jaEstavam > 0 ? `; ${jaEstavam} já estava(m) na seleção.` : ".")
      );
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId || selecionados.size === 0) {
      setResultado({ ok: false, error: "Selecione um curso e ao menos uma pessoa." });
      return;
    }
    iniciar(async () => {
      const res = await enrollUsers({
        courseId,
        userIds: [...selecionados.keys()],
        mandatory,
        dueDate: dueDate || undefined,
      });
      setResultado(res);
      if (res.ok) {
        setSelecionados(new Map());
        setAvisoDoSetor(null);
        router.refresh();
      }
    });
  }

  const noTeto = pessoas.length === LIMITE_DA_BUSCA;
  const visiveisTodasMarcadas =
    pessoas.length > 0 && pessoas.every((p) => selecionados.has(p.id));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {resultado && !resultado.ok && <Alert tone="danger">{resultado.error}</Alert>}
      {resultado?.ok && resultado.message && <Alert tone="success">{resultado.message}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-1">
          <label className="text-sm font-medium text-ink-900">Curso</label>
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className={campoClasse}
          >
            <option value="">Selecione um curso...</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-ink-900">Prazo (opcional)</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={campoClasse}
          />
        </div>
        <div className="flex items-end pb-2.5">
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={mandatory}
              onChange={(e) => setMandatory(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Curso obrigatório
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-sm font-medium text-ink-900">
            Pessoas ({selecionados.size} selecionada(s))
          </label>
          {pessoas.length > 0 && (
            <button
              type="button"
              onClick={alternarVisiveis}
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              {visiveisTodasMarcadas ? "Desmarcar os desta busca" : "Marcar os desta busca"}
            </button>
          )}
        </div>

        {/*
          As escolhidas ficam visíveis fora da lista.

          É o que torna a busca no servidor utilizável: a lista abaixo muda a
          cada consulta, e sem estas etiquetas quem selecionou dez pessoas em
          buscas diferentes não teria como saber quem já marcou — nem como
          desmarcar alguém que saiu do resultado atual.
        */}
        {selecionados.size > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface-muted/50 p-2.5">
            {(mostrarTodas
              ? [...selecionados.entries()]
              : [...selecionados.entries()].slice(0, ETIQUETAS_VISIVEIS)
            ).map(([id, nome]) => (
              <button
                key={id}
                type="button"
                onClick={() =>
                  setSelecionados((antes) => {
                    const proximo = new Map(antes);
                    proximo.delete(id);
                    return proximo;
                  })
                }
                className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs text-ink-900 ring-1 ring-border hover:bg-danger-100"
                title="Remover da seleção"
              >
                {nome}
                <X className="h-3 w-3" />
              </button>
            ))}

            {selecionados.size > ETIQUETAS_VISIVEIS && (
              <button
                type="button"
                onClick={() => setMostrarTodas((v) => !v)}
                className="rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:underline"
              >
                {mostrarTodas
                  ? "mostrar menos"
                  : `e mais ${selecionados.size - ETIQUETAS_VISIVEIS}`}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setSelecionados(new Map());
                setAvisoDoSetor(null);
              }}
              className="ml-auto rounded-lg px-2 py-1 text-xs font-medium text-ink-700/60 hover:text-danger-600 hover:underline"
            >
              limpar seleção
            </button>
          </div>
        )}

        {/*
          Matricular um setor inteiro.

          Vem ANTES da busca porque é o caminho mais curto para o caso mais
          comum — treinamento obrigatório costuma ser por setor, não por
          pessoa escolhida a dedo. Quem precisa de nomes soltos usa a busca
          abaixo, e as duas somam na mesma seleção.
        */}
        {departamentos.length > 0 && (
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface-muted/40 p-3">
            <div className="min-w-[180px] flex-1 space-y-1.5">
              <label htmlFor="setor-inteiro" className="text-xs font-medium text-ink-900">
                Adicionar um departamento inteiro
              </label>
              <select
                id="setor-inteiro"
                value={departamento}
                onChange={(e) => {
                  setDepartamento(e.target.value);
                  setAvisoDoSetor(null);
                }}
                className={campoClasse}
              >
                <option value="">Escolha um departamento...</option>
                {departamentos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={adicionarSetor}
              disabled={!departamento || adicionandoSetor}
            >
              <Users className="h-4 w-4" />
              {adicionandoSetor ? "Somando..." : "Somar à seleção"}
            </Button>
          </div>
        )}

        {avisoDoSetor && <p className="text-xs text-brand-700">{avisoDoSetor}</p>}

        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou usuário..."
          className={campoClasse}
        />

        <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
          {pessoas.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-3 border-b border-border px-3.5 py-2.5 text-sm last:border-b-0 hover:bg-surface-muted"
            >
              <input
                type="checkbox"
                checked={selecionados.has(p.id)}
                onChange={() => alternar(p)}
                className="h-4 w-4 rounded border-border"
              />
              <span className="flex-1 truncate text-ink-900">{p.name}</span>
              {/* O perfil aparece porque a lista mistura os dois: sem a marca,
                  matricular um administrador por engano seria fácil demais. */}
              {p.role === "ADMIN" && (
                <span className="shrink-0 rounded-md bg-ink-900/5 px-1.5 py-0.5 text-[11px] font-medium text-ink-700/70">
                  Administrador
                </span>
              )}
              <span className="shrink-0 text-xs text-ink-700/50">{p.departamento ?? "-"}</span>
            </label>
          ))}

          {pessoas.length === 0 && (
            <p className="px-3.5 py-4 text-center text-sm text-ink-700/50">
              {buscando ? "Buscando..." : "Nenhuma pessoa encontrada."}
            </p>
          )}
        </div>

        {/*
          O teto precisa aparecer.

          "Marcar os desta busca" marca o que está em tela. Se a busca encontrou
          trezentas pessoas e a tela mostra cinquenta, quem clica precisa saber
          disso — senão a matrícula sai incompleta e ninguém percebe.
        */}
        {noTeto && (
          <p className="text-xs text-warning-600">
            Mostrando as primeiras {LIMITE_DA_BUSCA}. Pode haver mais — refine a busca
            para alcançar quem não apareceu.
          </p>
        )}
      </div>

      <Button type="submit" disabled={pendente}>
        {pendente ? "Matriculando..." : "Matricular selecionados"}
      </Button>
    </form>
  );
}
