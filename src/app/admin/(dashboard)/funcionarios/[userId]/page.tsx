import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { carregarAtorOuFalhar } from "@/lib/alcance-admin";
import { requireAdmin } from "@/lib/session";
import { Avatar } from "@/components/ui/avatar";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmployeeForm } from "@/components/admin/employee-form";
import { EmployeeStatusActions } from "@/components/admin/employee-status-actions";
import { EnrollSingleForm } from "@/components/admin/enroll-form";
import { ActionButton } from "@/components/shared/action-button";
import { impactoDaExclusao } from "@/lib/actions/employees";
import { removeEnrollment } from "@/lib/actions/enrollments";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  departamentosPermitidos,
  motivoDeBloqueio,
} from "@/lib/permissoes-usuario";

export default async function FuncionarioDetailPage(
  props: {
    params: Promise<{ userId: string }>;
  }
) {
  const params = await props.params;
  const admin = await requireAdmin();
  const { userId } = params;

  const employee = await db.user.findUnique({
    where: { id: userId },
    include: { department: true },
  });
  if (!employee) notFound();

  const ator = await carregarAtorOuFalhar(admin.id);
  const motivo = motivoDeBloqueio(employee, ator);

  // Contado no servidor para a confirmacao poder dizer o tamanho do estrago.
  const impacto = await impactoDaExclusao(employee.id);

  const nomesDosExtras = (
    await db.departamentoExtra.findMany({
      where: { userId: employee.id },
      select: { department: { select: { name: true } } },
      orderBy: { department: { name: "asc" } },
    })
  ).map((d) => d.department.name);

  const extrasDoUsuario = (
    await db.departamentoExtra.findMany({
      where: { userId: employee.id },
      select: { departmentId: true },
    })
  ).map((d) => d.departmentId);

  const departments = await db.department.findMany({ orderBy: { name: "asc" } });
  const departamentosDisponiveis = departamentosPermitidos(ator, departments);

  const enrollments = await db.enrollment.findMany({
    where: { userId },
    include: { course: true },
    orderBy: { assignedAt: "desc" },
  });
  const progresses = await db.courseProgress.findMany({ where: { userId } });
  const progressByCourse = new Map(progresses.map((p) => [p.courseId, p]));

  const availableCourses = await db.course.findMany({
    where: {
      status: "PUBLISHED",
      id: { notIn: enrollments.map((e) => e.courseId) },
    },
    orderBy: { title: "asc" },
  });

  const now = new Date();

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/admin/funcionarios" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-700 hover:text-brand-700">
        <ChevronLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={employee.name} src={employee.avatarUrl} size="lg" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-ink-900">{employee.name}</h1>
            <Badge tone={employee.active ? "success" : "danger"}>
              {employee.active ? "Ativo" : "Inativo"}
            </Badge>
            {employee.protegido && <Badge tone="navy">Conta protegida</Badge>}
          </div>
          <p className="text-sm text-ink-700/60">
            {employee.position ?? "Sem cargo definido"} ·{" "}
            {employee.department?.name ?? "Sem departamento"}
            {nomesDosExtras.length > 0 && ` (+ ${nomesDosExtras.join(", ")})`}
          </p>
          <p className="text-xs text-ink-700/50">Último acesso: {formatDateTime(employee.lastLoginAt)}</p>
        </div>
      </div>

      {/*
        Esconder o que o servidor recusaria é melhor do que exibir botões que
        falham: a pessoa clicaria, receberia um erro e não entenderia o porquê.
        O motivo vem da mesma função que barra a operação no servidor.
      */}
      {motivo ? (
        <Alert tone="info">
          {motivo} Você continua vendo os dados e o histórico de treinamentos.
        </Alert>
      ) : (
        <EmployeeStatusActions
          userId={employee.id}
          nome={employee.name}
          active={employee.active}
          impacto={impacto}
        />
      )}

      {!motivo && (
        <section className="space-y-4 rounded-2xl border border-border bg-white p-6">
          <h2 className="font-semibold text-ink-900">Dados cadastrais</h2>
          <EmployeeForm
            departments={departamentosDisponiveis}
            employee={employee}
            extras={extrasDoUsuario}
          />
        </section>
      )}

      {!motivo && (
        <section className="space-y-4 rounded-2xl border border-border bg-white p-6">
          <h2 className="font-semibold text-ink-900">Matricular em novo curso</h2>
        {availableCourses.length === 0 ? (
          <p className="text-sm text-ink-700/60">
            Não há cursos publicados disponíveis para matrícula (o funcionário já está matriculado em
            todos, ou não há cursos publicados).
          </p>
        ) : (
            <EnrollSingleForm userId={employee.id} courses={availableCourses} />
          )}
        </section>
      )}

      <section className="space-y-4 rounded-2xl border border-border bg-white p-6">
        <h2 className="font-semibold text-ink-900">Histórico de treinamentos ({enrollments.length})</h2>
        {enrollments.length === 0 ? (
          <p className="text-sm text-ink-700/60">Nenhum curso matriculado ainda.</p>
        ) : (
          <ul className="divide-y divide-border">
            {enrollments.map((enr) => {
              const progress = progressByCourse.get(enr.courseId);
              const percent = progress?.percent ?? 0;
              const completed = percent >= 100;
              const overdue = Boolean(enr.dueDate && !completed && new Date(enr.dueDate) < now);

              return (
                <li key={enr.id} className="space-y-2 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-ink-900">{enr.course.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        {enr.mandatory && <Badge tone="navy">Obrigatório</Badge>}
                        {completed && <Badge tone="success">Concluído</Badge>}
                        {overdue && <Badge tone="danger">Atrasado</Badge>}
                        {enr.dueDate && (
                          <span className="text-ink-700/50">Prazo: {formatDate(enr.dueDate)}</span>
                        )}
                      </div>
                    </div>
                    {!motivo && (
                      <ActionButton
                        action={removeEnrollment.bind(null, employee.id, enr.courseId)}
                        variant="ghost"
                        confirmMessage="Remover esta matrícula? O progresso será perdido."
                      >
                        Remover
                      </ActionButton>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <ProgressBar percent={percent} size="sm" className="max-w-xs" />
                    <span className="text-xs font-medium text-ink-700/70">{percent}%</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
