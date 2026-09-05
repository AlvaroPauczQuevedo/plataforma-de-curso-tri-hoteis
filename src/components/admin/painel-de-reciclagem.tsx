import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { BotaoWhatsApp } from "@/components/admin/botao-whatsapp";
import { enderecoPublico } from "@/lib/email";
import { levantarReciclagem } from "@/lib/reciclagem";
import { formatPrazo } from "@/lib/utils";
import { mensagemDePrazo } from "@/lib/whatsapp";

/** Quantas linhas mostrar antes de mandar filtrar. */
const TETO = 15;

/**
 * Certificados que estão deixando de valer.
 *
 * Só aparece quando há o que cobrar. Uma seção permanente dizendo "nenhuma
 * reciclagem pendente" ocuparia o topo da tela mais usada da plataforma para
 * não informar nada — e treinamento vencido é a informação que precisa saltar
 * aos olhos no dia em que existir.
 *
 * Vive na Conformidade, e não numa tela própria, porque responde à mesma
 * pergunta: quem está irregular. A diferença é só o motivo — lá é "não fez",
 * aqui é "fez, mas venceu".
 */
export async function PainelDeReciclagem({ departamentoId }: { departamentoId?: string }) {
  const { linhas, resumo } = await levantarReciclagem({ departamentoId });

  // Vigente não é pendência: quem está em dia não entra na lista de cobrança.
  const aCobrar = linhas.filter((l) => l.situacao !== "vigente");
  if (aCobrar.length === 0) return null;

  const [usuarios, cursos] = await Promise.all([
    db.user.findMany({
      where: { id: { in: [...new Set(aCobrar.slice(0, TETO).map((l) => l.userId))] } },
      select: { id: true, name: true, username: true, telefone: true },
    }),
    db.course.findMany({
      where: { id: { in: [...new Set(aCobrar.slice(0, TETO).map((l) => l.courseId))] } },
      select: { id: true, title: true },
    }),
  ]);

  const usuarioPor = new Map(usuarios.map((u) => [u.id, u]));
  const cursoPor = new Map(cursos.map((c) => [c.id, c]));

  return (
    <section className="space-y-3 rounded-2xl border border-warning-600/25 bg-warning-100/40 p-5">
      <div className="flex items-start gap-3">
        <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-warning-600" />
        <div>
          <h2 className="text-base font-semibold text-ink-900">Reciclagem de treinamento</h2>
          <p className="text-sm text-ink-700/70">
            {resumo.vencido > 0 && (
              <strong className="text-danger-600">{resumo.vencido} vencido(s)</strong>
            )}
            {resumo.vencido > 0 && resumo.vencendo > 0 && " · "}
            {resumo.vencendo > 0 && <>{resumo.vencendo} vencendo em até 30 dias</>}
            . Estas pessoas concluíram o treinamento, mas o certificado tem prazo de
            validade e precisa ser refeito.
          </p>
        </div>
      </div>

      <ul className="divide-y divide-warning-600/15 rounded-xl border border-warning-600/20 bg-white">
        {aCobrar.slice(0, TETO).map((l) => {
          const user = usuarioPor.get(l.userId);
          const curso = cursoPor.get(l.courseId);
          return (
            <li
              key={`${l.userId}-${l.courseId}`}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/admin/funcionarios/${l.userId}`}
                  className="text-sm font-medium text-ink-900 hover:text-brand-700"
                >
                  {user?.name ?? "—"}
                </Link>
                <p className="truncate text-xs text-ink-700/60">
                  {curso?.title ?? "—"} · concluído em {formatPrazo(l.emitidoEm)} · vence em{" "}
                  {formatPrazo(l.venceEm)}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {l.situacao === "vencido" ? (
                  <Badge tone="danger">
                    venceu há {Math.abs(l.diasRestantes)} dia(s)
                  </Badge>
                ) : (
                  <Badge tone="warning">faltam {l.diasRestantes} dia(s)</Badge>
                )}
                <BotaoWhatsApp
                  telefone={user?.telefone}
                  rotulo="Avisar"
                  mensagem={mensagemDePrazo({
                    nome: user?.name ?? "",
                    curso: curso?.title ?? "",
                    diasRestantes: l.diasRestantes,
                    endereco: enderecoPublico(),
                  })}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {aCobrar.length > TETO && (
        <p className="text-xs text-ink-700/60">
          E mais {aCobrar.length - TETO}. Filtre por departamento para ver o resto.
        </p>
      )}

      {/*
        A rematrícula NÃO acontece sozinha, e isso é decisão, não falta.

        Zerar o progresso para a pessoa "refazer" apagaria o certificado antigo
        junto (ver lib/progress) — ou seja, destruiria em silêncio a prova de
        que o treinamento foi feito no ano passado. Numa auditoria, "fez em 2025
        e está vencendo" é uma resposta; "não há registro" não é.
      */}
      <p className="text-xs text-ink-700/60">
        Para renovar, matricule estas pessoas de novo em{" "}
        <Link href="/admin/matriculas" className="underline">
          Matrículas
        </Link>
        . O certificado antigo continua valendo como histórico — nada é apagado.
      </p>
    </section>
  );
}
