import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { AvatarUploader } from "@/components/portal/avatar-uploader";
import { EmailPessoalCard } from "@/components/portal/email-pessoal-card";
import { ActionForm } from "@/components/shared/action-form";
import { envioDisponivel } from "@/lib/email";
import { updateProfile, changePassword } from "@/lib/actions/profile";
import { formatDateTime } from "@/lib/utils";

export default async function PerfilPage() {
  const sessionUser = await requireUser();
  const user = await db.user.findUniqueOrThrow({
    where: { id: sessionUser.id },
    include: { department: true },
  });

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Perfil e configurações</h1>
        <p className="text-sm text-ink-700/70">Gerencie suas informações pessoais e sua senha.</p>
      </div>

      <section className="space-y-5 rounded-2xl border border-border bg-white p-6">
        <AvatarUploader name={user.name} avatarUrl={user.avatarUrl} />

        <ActionForm action={updateProfile} submitLabel="Salvar alterações">
          <div className="space-y-1.5">
            <label htmlFor="name" className="text-sm font-medium text-ink-900">
              Nome completo
            </label>
            <input
              id="name"
              name="name"
              defaultValue={user.name}
              required
              className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink-900">Nome de usuário</label>
              {/*
                Desabilitado: é o identificador de acesso, e trocá-lo sozinho
                deixaria a pessoa sem conseguir entrar amanhã se esquecesse o
                novo. Quem muda isto é o RH, avisando antes.
              */}
              <input
                disabled
                value={user.username}
                className="w-full rounded-xl border border-border bg-surface-muted px-3.5 py-2.5 font-mono text-sm text-ink-700/70"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink-900">Cargo</label>
              <input
                disabled
                value={user.position ?? "-"}
                className="w-full rounded-xl border border-border bg-surface-muted px-3.5 py-2.5 text-sm text-ink-700/70"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink-900">Departamento</label>
              <input
                disabled
                value={user.department?.name ?? "-"}
                className="w-full rounded-xl border border-border bg-surface-muted px-3.5 py-2.5 text-sm text-ink-700/70"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink-900">Último acesso</label>
              <input
                disabled
                value={formatDateTime(user.lastLoginAt)}
                className="w-full rounded-xl border border-border bg-surface-muted px-3.5 py-2.5 text-sm text-ink-700/70"
              />
            </div>
          </div>
        </ActionForm>
      </section>

      <EmailPessoalCard email={user.email} envioDisponivel={envioDisponivel()} />

      <section className="space-y-5 rounded-2xl border border-border bg-white p-6">
        <div>
          <h2 className="font-semibold text-ink-900">Alterar senha</h2>
          <p className="text-sm text-ink-700/60">Use uma senha com pelo menos 6 caracteres.</p>
        </div>

        <ActionForm action={changePassword} submitLabel="Alterar senha" resetOnSuccess>
          <div className="space-y-1.5">
            <label htmlFor="currentPassword" className="text-sm font-medium text-ink-900">
              Senha atual
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              required
              className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="newPassword" className="text-sm font-medium text-ink-900">
                Nova senha
              </label>
              <input
                id="newPassword"
                name="newPassword"
                type="password"
                required
                minLength={6}
                className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-ink-900">
                Confirmar nova senha
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                minLength={6}
                className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
              />
            </div>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
