import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ProvaRunner } from "@/components/portal/prova-runner";
import { formatDateTime } from "@/lib/utils";

const ULTIMAS = 3;

export default async function FazerProvaPage({
  params,
}: {
  params: { provaId: string };
}) {
  const user = await requireUser();

  const prova = await db.prova.findUnique({
    where: { id: params.provaId },
    include: {
      department: true,
      questoes: {
        /*
          As alternativas vêm SEM o campo `correta`. O gabarito não pode
          trafegar até o navegador antes da entrega — quem abrir as ferramentas
          de desenvolvedor veria as respostas.
        */
        select: {
          id: true,
          enunciado: true,
          alternativas: {
            select: { id: true, texto: true },
            orderBy: { ordem: "asc" },
          },
        },
        orderBy: { ordem: "asc" },
      },
    },
  });

  if (!prova || !prova.publicada) notFound();

  const conta = await db.user.findUnique({
    where: { id: user.id },
    select: { departmentId: true },
  });

  const alcanca =
    prova.departmentId === null || prova.departmentId === conta?.departmentId;
  if (!alcanca) notFound();

  const anteriores = await db.tentativaProva.findMany({
    where: { userId: user.id, provaId: prova.id },
    orderBy: { createdAt: "desc" },
    take: ULTIMAS,
  });

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/provas"
        className="inline-flex items-center gap-1 text-sm text-ink-700/70 hover:text-ink-900"
      >
        <ChevronLeft className="h-4 w-4" />
        Voltar para as provas
      </Link>

      <div>
        <h1 className="text-2xl font-semibold text-ink-900">{prova.titulo}</h1>
        {prova.descricao && (
          <p className="mt-1 text-sm text-ink-700/70">{prova.descricao}</p>
        )}
        <p className="mt-1 text-xs text-ink-700/50">
          {prova.department?.name ?? "Geral"}
        </p>
      </div>

      <a
        href={`/api/provas/${prova.id}/pdf`}
        className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-sm font-medium text-ink-700 transition hover:bg-surface-muted"
      >
        <Download className="h-4 w-4" />
        Baixar a prova em PDF
      </a>

      {anteriores.length > 0 && (
        <section className="rounded-2xl border border-border bg-white p-5">
          <h2 className="mb-3 font-semibold text-ink-900">
            Suas últimas {ULTIMAS} tentativas nesta prova
          </h2>
          <ul className="divide-y divide-border">
            {anteriores.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="flex-1 text-sm text-ink-700/70">
                  {formatDateTime(t.createdAt)}
                </span>
                <span className="text-sm text-ink-700/60">
                  {t.acertos}/{t.total}
                </span>
                <span className="text-sm font-semibold text-ink-900">{t.nota}%</span>
                <Badge tone={t.aprovado ? "success" : "danger"}>
                  {t.aprovado ? "Aprovado" : "Reprovado"}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      {prova.questoes.length === 0 ? (
        <Alert tone="warning">
          Esta prova ainda não tem questões. Fale com quem administra o treinamento.
        </Alert>
      ) : (
        <ProvaRunner
          provaId={prova.id}
          notaMinima={prova.notaMinima}
          questoes={prova.questoes}
        />
      )}
    </div>
  );
}
