"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ListPlus } from "lucide-react";
import { criarFuncionariosEmLote } from "@/lib/actions/employees";
import type { PessoaCadastrada } from "@/lib/cadastro-em-lote";
import { lerPessoas } from "@/lib/lote-de-funcionarios";

/**
 * Cadastro de vários funcionários de uma vez, uma pessoa por linha.
 *
 * Fica recolhido atrás do formulário individual, como o de hotéis: admitir uma
 * pessoa é o caso do dia a dia; receber a lista de um hotel inteiro acontece
 * uma vez por hotel.
 *
 * O hotel e o departamento são escolhidos UMA vez, para o lote todo, porque o
 * cadastro é feito hotel a hotel — repeti-los em cada linha seria digitação
 * sem informação nova.
 */
export function FuncionarioLoteForm({
  departments,
  unidades,
}: {
  departments: { id: string; name: string }[];
  unidades: { id: string; name: string }[];
}) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [unidadeId, setUnidadeId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pessoas, setPessoas] = useState<PessoaCadastrada[] | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pendente, iniciar] = useTransition();
  const router = useRouter();

  // Conta pela mesma função do servidor, para o botão não prometer um número
  // diferente do que a tela vai mostrar depois.
  const quantidade = lerPessoas(texto).length;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (quantidade === 0) return;

    iniciar(async () => {
      const res = await criarFuncionariosEmLote({
        texto,
        unidadeId: unidadeId || null,
        departmentId: departmentId || null,
      });

      if (!res.ok) {
        setErro(res.error);
        // A lista marcada vem junto quando o problema é linha a linha.
        setPessoas(res.pessoas ?? null);
        return;
      }

      setErro(null);
      setPessoas(res.pessoas);
      /*
        Limpa o campo só no sucesso. Falhou, o texto fica onde está — é o que a
        pessoa vai corrigir, e apagá-lo obrigaria a colar tudo de novo.
      */
      setTexto("");
      router.refresh();
    });
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-texto hover:text-brand-600"
      >
        <ListPlus className="h-4 w-4" />
        Cadastrar vários de uma vez
      </button>
    );
  }

  const cadastrados = pessoas?.filter((p) => p.senha) ?? [];

  /**
   * Copia a lista num formato que cola em planilha.
   *
   * Separado por tabulação e com cabeçalho: colado no Excel ou no Sheets cai em
   * três colunas sozinho, e colado num campo de texto continua legível. É o
   * caminho real — ninguém entrega sessenta senhas lendo da tela.
   *
   * Existe porque a senha provisória não é gravada em lugar nenhum: fechada a
   * tela, a única saída é redefinir uma por uma. Uma tabela sem como copiar era
   * um convite a esse trabalho.
   */
  async function copiar() {
    const linhas = [
      ["Nome", "Usuário", "Senha provisória"].join("\t"),
      ...cadastrados.map((p) => [p.nome, p.usuario, p.senha].join("\t")),
    ].join("\n");

    try {
      await navigator.clipboard.writeText(linhas);
      setCopiado(true);
      // Volta ao normal para o botão poder ser usado de novo sem recarregar.
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /*
        Área de transferência negada (permissão do navegador, contexto não
        seguro). Selecionar o texto é o que sobra, e some sem avisar seria
        pior: a pessoa acharia que copiou e fecharia a tela.
      */
      setErro(
        "O navegador não permitiu copiar. Selecione a tabela e copie à mão " +
          "antes de fechar — as senhas não aparecem de novo."
      );
    }
  }

  return (
    <form
      onSubmit={enviar}
      className="space-y-3 rounded-xl border border-border bg-surface-muted/40 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="lote-departamento" className="block text-sm font-medium text-ink-900">
            Departamento do lote
          </label>
          <select
            id="lote-departamento"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          >
            <option value="">Selecione...</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="lote-unidade" className="block text-sm font-medium text-ink-900">
            Hotel do lote
          </label>
          <select
            id="lote-unidade"
            value={unidadeId}
            onChange={(e) => setUnidadeId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          >
            <option value="">Sem hotel definido</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="lote-de-pessoas" className="block text-sm font-medium text-ink-900">
          Uma pessoa por linha
        </label>
        <textarea
          id="lote-de-pessoas"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={8}
          placeholder={"Maria Aparecida Souza; Recepcionista\nCarlos Mendes\nAna Lima; Camareira"}
          className="mt-1 w-full rounded-xl border border-border bg-surface px-3.5 py-2 font-mono text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
        />
        <p className="mt-1 text-xs text-ink-700/60">
          O cargo é opcional, depois de um ponto e vírgula. O nome de usuário
          sai do nome — <span className="font-mono">Maria Aparecida Souza</span> vira{" "}
          <span className="font-mono">maria.souza</span> —, e homônimos recebem o
          nome do meio para se diferenciar.
        </p>
      </div>

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
              : `Cadastrar ${quantidade} pessoa(s)`}
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

      {pessoas && pessoas.length > 0 && (
        <div className="space-y-2">
          {cadastrados.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-success-600">
                {cadastrados.length} pessoa(s) cadastrada(s). Copie as senhas{" "}
                <strong>antes de fechar</strong> — elas não são guardadas em
                lugar nenhum e não aparecem de novo.
              </p>
              <button
                type="button"
                onClick={copiar}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-900 hover:bg-surface-muted"
              >
                {copiado ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-success-600" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copiar lista
                  </>
                )}
              </button>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-xs">
              <thead className="bg-surface-muted/60 text-ink-700/70">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Nome</th>
                  <th className="px-3 py-2 text-left font-medium">Usuário</th>
                  <th className="px-3 py-2 text-left font-medium">Senha provisória</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pessoas.map((p, i) => (
                  <tr key={p.usuario + i} className={p.problema ? "bg-danger-100/40" : ""}>
                    <td className="px-3 py-2 text-ink-900">{p.nome}</td>
                    <td className="px-3 py-2 font-mono text-ink-900">{p.usuario || "—"}</td>
                    <td className="px-3 py-2">
                      {p.senha ? (
                        <span className="font-mono text-ink-900">{p.senha}</span>
                      ) : (
                        <span className="text-danger-600">{p.problema}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </form>
  );
}
