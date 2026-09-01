"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { submeterTentativa } from "@/lib/actions/provas";

type Alternativa = { id: string; texto: string };
type Questao = { id: string; enunciado: string; alternativas: Alternativa[] };

type Corrigida = {
  questaoId: string;
  enunciado: string;
  alternativaMarcada: string | null;
  alternativaCorreta: string | null;
  acertou: boolean;
};

/**
 * Execução da prova pelo funcionário.
 *
 * As alternativas chegam SEM a marca de correta — o gabarito nunca sai do
 * servidor antes da entrega. Corrigir aqui seria entregar as respostas junto
 * com as perguntas, e a prova não avaliaria nada.
 */
export function ProvaRunner({
  provaId,
  notaMinima,
  questoes,
}: {
  provaId: string;
  notaMinima: number;
  questoes: Questao[];
}) {
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{
    nota: number;
    acertos: number;
    total: number;
    aprovado: boolean;
    questoes: Corrigida[];
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const respondidas = Object.keys(respostas).length;
  const faltam = questoes.length - respondidas;

  function enviar() {
    setErro(null);
    startTransition(async () => {
      const res = await submeterTentativa(provaId, respostas);
      if (!res.ok) {
        setErro(res.error);
        return;
      }
      setResultado(res.resultado ?? null);
      router.refresh();
    });
  }

  if (resultado) {
    return (
      <div className="space-y-5">
        <div
          className={`rounded-2xl border p-6 ${
            resultado.aprovado
              ? "border-success-600/30 bg-success-100/50"
              : "border-danger-600/30 bg-danger-100/50"
          }`}
        >
          <p className="text-sm text-ink-700/70">Sua nota nesta prova</p>
          <p className="text-4xl font-semibold text-ink-900">{resultado.nota}%</p>
          <p className="mt-1 text-sm text-ink-700/70">
            {resultado.acertos} de {resultado.total} questões · mínimo para aprovação{" "}
            {notaMinima}%
          </p>
          <div className="mt-3">
            <Badge tone={resultado.aprovado ? "success" : "danger"}>
              {resultado.aprovado ? "Aprovado" : "Reprovado"}
            </Badge>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="font-semibold text-ink-900">Revisão</h2>
          {resultado.questoes.map((q, i) => {
            const original = questoes.find((o) => o.id === q.questaoId);
            const marcada = original?.alternativas.find(
              (a) => a.id === q.alternativaMarcada
            );
            const correta = original?.alternativas.find(
              (a) => a.id === q.alternativaCorreta
            );

            return (
              <div
                key={q.questaoId}
                className="rounded-2xl border border-border bg-white p-4"
              >
                <div className="flex items-start gap-2">
                  {q.acertou ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger-600" />
                  )}
                  <p className="text-sm font-medium text-ink-900">
                    {i + 1}. {q.enunciado}
                  </p>
                </div>
                <p className="mt-2 pl-6 text-sm text-ink-700/70">
                  Você marcou: {marcada?.texto ?? "nada"}
                </p>
                {/*
                  A resposta certa só aparece para quem foi aprovado — o
                  servidor nem manda o gabarito na reprovação. Quem errou
                  precisa saber O QUE errou para voltar ao material, não qual
                  alternativa marcar da próxima vez.
                */}
                {!q.acertou &&
                  (correta ? (
                    <p className="pl-6 text-sm text-success-600">
                      Correta: {correta.texto}
                    </p>
                  ) : (
                    <p className="pl-6 text-sm text-ink-700/50">
                      Revise esta parte do curso e tente de novo.
                    </p>
                  ))}
              </div>
            );
          })}
        </div>

        <Button variant="secondary" onClick={() => router.push("/provas")}>
          Voltar para as provas
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {erro && <Alert tone="danger">{erro}</Alert>}

      <p className="text-sm text-ink-700/70">
        {questoes.length} questão(ões). Nota mínima para aprovação: {notaMinima}%.
      </p>

      {questoes.map((q, i) => (
        <fieldset
          key={q.id}
          className="space-y-2 rounded-2xl border border-border bg-white p-5"
        >
          <legend className="text-sm font-medium text-ink-900">
            {i + 1}. {q.enunciado}
          </legend>
          {q.alternativas.map((a) => (
            <label
              key={a.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm text-ink-700 transition hover:bg-surface-muted"
            >
              <input
                type="radio"
                name={q.id}
                checked={respostas[q.id] === a.id}
                onChange={() => setRespostas((r) => ({ ...r, [q.id]: a.id }))}
                className="h-4 w-4 border-border text-brand-700"
              />
              {a.texto}
            </label>
          ))}
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={enviar} disabled={pending || questoes.length === 0}>
          {pending ? "Enviando..." : "Entregar prova"}
        </Button>
        {faltam > 0 && (
          <span className="text-sm text-ink-700/60">
            {faltam} questão(ões) sem resposta — em branco conta como erro.
          </span>
        )}
      </div>
    </div>
  );
}
