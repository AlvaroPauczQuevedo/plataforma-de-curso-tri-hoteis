"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/shared/action-form";
import {
  registrarConclusaoExterna,
  removerConclusaoExterna,
} from "@/lib/actions/conclusao-externa";
import { formatPrazo } from "@/lib/utils";

type Registro = {
  id: string;
  curso: string;
  concluidoEm: Date;
  instrutor: string | null;
  observacao: string | null;
  registradoPor: string;
};

type CursoDisponivel = { id: string; title: string };

const campoClasse =
  "w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";

/**
 * Reconhecimento de treinamento presencial.
 *
 * Numa rede hoteleira, brigada de incêndio e manipulação de alimentos são
 * feitos em sala, com instrutor. A plataforma não viu aquilo acontecer — mas
 * precisa saber que aconteceu, senão a Conformidade cobra quem já fez e o
 * relatório de auditoria sai incompleto afirmando estar completo.
 */
export function ConclusaoExternaPanel({
  userId,
  registros,
  cursos,
}: {
  userId: string;
  registros: Registro[];
  /** Cursos ainda sem reconhecimento para esta pessoa. */
  cursos: CursoDisponivel[];
}) {
  const [removendo, iniciarRemocao] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const [abrir, setAbrir] = useState(false);
  const router = useRouter();

  function remover(id: string) {
    iniciarRemocao(async () => {
      const r = await removerConclusaoExterna(id);
      setAviso(r.ok ? (r.message ?? null) : r.error);
      router.refresh();
    });
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-start gap-3">
        <GraduationCap className="mt-0.5 h-5 w-5 shrink-0 text-brand-texto" />
        <div>
          <h2 className="font-semibold text-ink-900">Treinamento presencial</h2>
          <p className="text-sm text-ink-700/70">
            Cursos que esta pessoa fez fora da plataforma — em sala, com instrutor.
            Contam como concluídos na conformidade e na reciclagem.
          </p>
        </div>
      </div>

      {aviso && <Alert tone="info">{aviso}</Alert>}

      {registros.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {registros.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium text-ink-900">{r.curso}</p>
                <p className="text-xs text-ink-700/60">
                  Concluído em {formatPrazo(r.concluidoEm)}
                  {r.instrutor ? ` · ${r.instrutor}` : ""} · lançado por {r.registradoPor}
                </p>
                {r.observacao && (
                  <p className="mt-1 text-xs text-ink-700/50">{r.observacao}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                disabled={removendo}
                onClick={() => remover(r.id)}
                title="Remove o reconhecimento. A pessoa volta a aparecer como pendente."
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {cursos.length === 0 ? (
        <p className="text-sm text-ink-700/60">
          {registros.length > 0
            ? "Todos os treinamentos já têm registro para esta pessoa."
            : "Nenhum curso publicado para reconhecer."}
        </p>
      ) : !abrir ? (
        <Button variant="outline" type="button" onClick={() => setAbrir(true)}>
          Registrar treinamento presencial
        </Button>
      ) : (
        <ActionForm
          action={registrarConclusaoExterna.bind(null, userId)}
          submitLabel="Registrar"
          onSuccess={() => setAbrir(false)}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="courseId" className="text-sm font-medium text-ink-900">
                Treinamento
              </label>
              <select id="courseId" name="courseId" required className={campoClasse}>
                <option value="">Escolha...</option>
                {cursos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="concluidoEm" className="text-sm font-medium text-ink-900">
                Data da conclusão
              </label>
              <input
                id="concluidoEm"
                name="concluidoEm"
                type="date"
                required
                max={new Date().toISOString().slice(0, 10)}
                className={campoClasse}
              />
              <p className="text-xs text-ink-700/60">
                Quando a pessoa fez, não hoje. É desta data que a reciclagem conta a
                validade.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="instrutor" className="text-sm font-medium text-ink-900">
              Quem aplicou <span className="font-normal text-ink-700/50">(opcional)</span>
            </label>
            <input
              id="instrutor"
              name="instrutor"
              placeholder="Corpo de Bombeiros, SENAC, instrutor interno..."
              className={campoClasse}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="observacao" className="text-sm font-medium text-ink-900">
              Observação <span className="font-normal text-ink-700/50">(opcional)</span>
            </label>
            <input
              id="observacao"
              name="observacao"
              placeholder="Número do certificado externo, turma, carga horária..."
              className={campoClasse}
            />
          </div>

          <p className="text-xs text-ink-700/60">
            Isto é uma afirmação sobre conformidade: fica registrado no histórico
            administrativo com o seu nome. A plataforma não emite certificado
            próprio — ela não pode certificar o que não entregou.
          </p>
        </ActionForm>
      )}
    </section>
  );
}
