import { Building2, Tags, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { notFound } from "next/navigation";
import { QuickAddForm } from "@/components/admin/quick-add-form";
import { DepartmentList } from "@/components/admin/department-list";
import { createDepartment } from "@/lib/actions/employees";
import { ehProprietario } from "@/lib/alcance-admin";
import { createCategory } from "@/lib/actions/courses";

export default async function ConfiguracoesPage() {
  const admin = await requireAdmin();

  /*
    Tela da conta proprietária. Relatórios e Atividades mostram a plataforma
    inteira — progresso e histórico de ação de todos os departamentos —, e
    Configurações decide a estrutura que governa o alcance de todo mundo.

    Devolve página inexistente em vez de uma tela de recusa: para quem não a
    alcança, a rota simplesmente não existe.
  */
  if (!(await ehProprietario(admin.id))) notFound();

  /*
    Os três contadores vêm juntos porque a tela precisa dizer POR QUE um
    departamento não pode ser excluído. Contar só usuários esconderia metade
    dos impedimentos e transformaria a recusa em surpresa.
  */
  const [proprietario, departments, categories] = await Promise.all([
    ehProprietario(admin.id),
    db.department.findMany({
      include: {
        _count: { select: { users: true, courses: true, obrigatorios: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.category.findMany({
      include: { _count: { select: { courses: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Configurações da plataforma</h1>
        <p className="text-sm text-ink-700/70">Gerencie departamentos, categorias e veja informações da conta.</p>
      </div>

      <section className="space-y-4 rounded-2xl border border-border bg-white p-6">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-brand-700" />
          <h2 className="font-semibold text-ink-900">Departamentos</h2>
        </div>
        {proprietario && (
          <QuickAddForm action={createDepartment} placeholder="Nome do novo departamento" />
        )}
        <DepartmentList
          podeExcluir={proprietario}
          departamentos={departments.map((d) => ({
            id: d.id,
            name: d.name,
            usuarios: d._count.users,
            cursos: d._count.courses,
            obrigatorios: d._count.obrigatorios,
          }))}
        />
        {proprietario && (
          <p className="text-xs leading-relaxed text-ink-700/60">
            Departamento define o alcance de cada administrador, por isso criar e
            excluir são ações da conta proprietária. Só é possível excluir um
            departamento vazio — mova os vínculos antes.
          </p>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-white p-6">
        <div className="flex items-center gap-2">
          <Tags className="h-5 w-5 text-brand-700" />
          <h2 className="font-semibold text-ink-900">Categorias de curso</h2>
        </div>
        <QuickAddForm action={createCategory} placeholder="Nome da nova categoria" />
        <ul className="divide-y divide-border">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-ink-900">{c.name}</span>
              <span className="text-xs text-ink-700/50">{c._count.courses} curso(s)</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-white p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brand-700" />
          <h2 className="font-semibold text-ink-900">Conta administrativa</h2>
        </div>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-700/60">Nome</dt>
            <dd className="font-medium text-ink-900">{admin.name}</dd>
          </div>
          <div>
            <dt className="text-ink-700/60">E-mail</dt>
            <dd className="font-medium text-ink-900">{admin.email}</dd>
          </div>
          <div>
            <dt className="text-ink-700/60">Limite de upload por arquivo</dt>
            <dd className="font-medium text-ink-900">{process.env.UPLOAD_MAX_SIZE_MB ?? 500} MB</dd>
          </div>
          <div>
            <dt className="text-ink-700/60">Armazenamento de arquivos</dt>
            <dd className="font-medium text-ink-900">Disco local do servidor</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
