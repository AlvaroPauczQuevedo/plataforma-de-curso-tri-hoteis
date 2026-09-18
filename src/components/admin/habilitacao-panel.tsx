"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Plus, ShieldAlert, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/shared/action-button";
import { FileUploadField } from "@/components/admin/file-upload-field";
import {
  anexarHabilitacao,
  definirExigenciaDeHabilitacao,
  removerHabilitacao,
} from "@/lib/actions/habilitacao";
import { TERMO_DE_HABILITACAO } from "@/lib/habilitacao";
import { formatDate, formatDateTime } from "@/lib/utils";

export type HabilitacaoNaTela = {
  id: string;
  instrutor: string;
  registro: string | null;
  arquivoId: string;
  validoAte: string | null;
  declaradoPor: string;
  declaradoEm: string;
  situacao: "valida" | "vencida" | "sem_validade";
};

const campoClasse =
  "rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";

/**
 * Comprovante de habilitação do instrutor.
 *
 * A plataforma **não valida** se o documento é autêntico — não há cadastro
 * nacional para consultar. Ela exige, registra quem anexou, e faz essa pessoa
 * declarar por escrito que responde por ele.
 *
 * Por isso o termo aparece **por extenso na tela**, e não atrás de um link.
 * Quem vai assumir responsabilidade civil, fiscal e penal precisa ler o que
 * está assumindo — esconder isso num "li e concordo" esvaziaria a declaração
 * justamente no ponto que a torna útil.
 */
export function HabilitacaoPanel({
  courseId,
  exige,
  publicado,
  habilitacoes,
  aviso,
}: {
  courseId: string;
  exige: boolean;
  publicado: boolean;
  habilitacoes: HabilitacaoNaTela[];
  aviso: string | null;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [anexando, setAnexando] = useState(false);

  function alternarExigencia(valor: boolean) {
    setErro(null);
    iniciar(async () => {
      const r = await definirExigenciaDeHabilitacao(courseId, valor);
      if (!r.ok) setErro(r.error);
      else router.refresh();
    });
  }

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);

    setErro(null);
    iniciar(async () => {
      const r = await anexarHabilitacao(courseId, dados);
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setAnexando(false);
      router.refresh();
    });
  }

  const selo = {
    valida: <Badge tone="success">Vigente</Badge>,
    vencida: <Badge tone="danger">Vencido</Badge>,
    sem_validade: <Badge tone="warning">Sem validade declarada</Badge>,
  };

  return (
    <div className="space-y-4">
      {erro && <Alert tone="danger">{erro}</Alert>}

      {/*
        O aviso de curso publicado com comprovante vencido vem em destaque: o
        treinamento está no ar afirmando algo que talvez não se sustente, e
        essa é a informação mais urgente desta seção.
      */}
      {aviso && (
        <div className="flex items-start gap-2 rounded-xl border border-danger-600/30 bg-danger-100/40 px-4 py-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger-600" />
          <p className="text-sm text-ink-800">{aviso}</p>
        </div>
      )}

      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={exige}
          disabled={pendente}
          onChange={(e) => alternarExigencia(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border accent-brand-600"
        />
        <span className="text-sm">
          <span className="font-medium text-ink-900">
            Este treinamento exige instrutor legalmente habilitado
          </span>
          <span className="mt-0.5 block text-xs text-ink-700/60">
            Marque quando a norma exigir formação específica de quem aplica. O curso não
            poderá ser publicado sem o comprovante anexado e vigente.
          </span>
        </span>
      </label>

      {exige && (
        <>
          {habilitacoes.length === 0 ? (
            <p className="text-sm text-ink-700/60">
              Nenhum comprovante anexado.{" "}
              {publicado
                ? "Este curso está publicado sem comprovante."
                : "O curso não será publicado sem um."}
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {habilitacoes.map((h) => (
                <li key={h.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-ink-900">{h.instrutor}</p>
                      {selo[h.situacao]}
                    </div>
                    <p className="mt-0.5 text-xs text-ink-700/60">
                      {h.registro ? `${h.registro} · ` : ""}
                      {h.validoAte ? `válido até ${formatDate(h.validoAte)}` : "sem validade declarada"}
                    </p>
                    {/*
                      Quem declarou e quando fica VISÍVEL, não escondido no
                      histórico: é o que dá peso à declaração, e quem abre esta
                      tela precisa saber de quem é a responsabilidade.
                    */}
                    <p className="mt-1 text-xs text-ink-700/50">
                      Declarado por {h.declaradoPor} em {formatDateTime(h.declaradoEm)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <a
                      href={`/api/files/${h.arquivoId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-ink-800 transition hover:bg-surface-muted"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Ver
                    </a>
                    <ActionButton
                      action={removerHabilitacao.bind(null, courseId, h.id)}
                      variant="ghost"
                      size="sm"
                      confirmMessage={`Remover o comprovante de ${h.instrutor}? A remoção fica registrada no histórico.`}
                    >
                      <X className="h-4 w-4" />
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {anexando ? (
            <form onSubmit={enviar} className="space-y-3 rounded-xl bg-surface-muted/50 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="hab-instrutor" className="text-xs font-medium text-ink-900">
                    Nome do instrutor
                  </label>
                  <input
                    id="hab-instrutor"
                    name="instrutor"
                    required
                    placeholder="Como consta no comprovante"
                    className={`w-full ${campoClasse}`}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="hab-registro" className="text-xs font-medium text-ink-900">
                    Registro <span className="font-normal text-ink-700/60">(opcional)</span>
                  </label>
                  <input
                    id="hab-registro"
                    name="registro"
                    placeholder="Conselho, número do certificado"
                    className={`w-full ${campoClasse}`}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="hab-validade" className="text-xs font-medium text-ink-900">
                  Válido até <span className="font-normal text-ink-700/60">(opcional)</span>
                </label>
                <input
                  id="hab-validade"
                  name="validoAte"
                  type="date"
                  className={`w-full sm:w-56 ${campoClasse}`}
                />
                <p className="text-xs text-ink-700/60">
                  Em branco, o comprovante entra marcado para conferência — sem prazo
                  declarado não é o mesmo que válido para sempre.
                </p>
              </div>

              <FileUploadField kind="pdfs" name="arquivoId" label="Comprovante (PDF)" />

              {/*
                O termo por extenso, e não atrás de um link. Ver o comentário no
                topo deste arquivo.
              */}
              <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
                <p className="text-xs leading-relaxed text-ink-700">{TERMO_DE_HABILITACAO}</p>
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    name="aceitouTermo"
                    value="sim"
                    required
                    className="mt-0.5 h-4 w-4 rounded border-border accent-brand-600"
                  />
                  <span className="text-xs font-medium text-ink-900">
                    Li e aceito o termo acima.
                  </span>
                </label>
              </div>

              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={pendente}>
                  {pendente && <Loader2 className="h-4 w-4 animate-spin" />}
                  Anexar comprovante
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setAnexando(false)}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setAnexando(true)}>
              <Plus className="h-4 w-4" />
              Anexar comprovante
            </Button>
          )}
        </>
      )}
    </div>
  );
}
