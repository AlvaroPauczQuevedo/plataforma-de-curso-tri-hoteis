"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/shared/action-form";
import { createEmployee, updateEmployee } from "@/lib/actions/employees";
import { normalizarNomeDeUsuario, sugerirNomeDeUsuario } from "@/lib/nome-de-usuario";
import { formatarTelefone } from "@/lib/whatsapp";
import type { Department, User } from "@prisma/client";

export function EmployeeForm({
  departments,
  employee,
  extras = [],
}: {
  departments: Department[];
  employee?: User;
  /** Departamentos adicionais já marcados para esta pessoa. */
  extras?: string[];
}) {
  const router = useRouter();
  const isEdit = Boolean(employee);

  const [username, setUsername] = useState(employee?.username ?? "");
  /**
   * Se o administrador já mexeu no campo, a sugestão para de sobrescrever.
   *
   * Sem isto, o desempate entre duas pessoas homônimas — que é exatamente o
   * caso em que ele precisa editar à mão — seria desfeito no instante em que
   * ele voltasse ao nome para corrigir um acento.
   */
  const [tocado, setTocado] = useState(false);

  function aoDigitarNome(nome: string) {
    if (isEdit || tocado) return;
    setUsername(sugerirNomeDeUsuario(nome));
  }

  return (
    <ActionForm
      action={(formData) =>
        isEdit ? updateEmployee(employee!.id, formData) : createEmployee(formData)
      }
      submitLabel={isEdit ? "Salvar alterações" : "Cadastrar funcionário"}
      onSuccess={() => {
        if (!isEdit) {
          setTimeout(() => router.push("/admin/funcionarios"), 1600);
        }
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="name" className="text-sm font-medium text-ink-900">
            Nome completo
          </label>
          <input
            id="name"
            name="name"
            required
            defaultValue={employee?.name}
            onChange={(e) => aoDigitarNome(e.target.value)}
            className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="username" className="text-sm font-medium text-ink-900">
            Nome de usuário
          </label>
          <input
            id="username"
            name="username"
            required
            value={username}
            /*
              Normaliza a cada tecla, em vez de só ao salvar.

              O campo é o identificador de ACESSO, e quem cadastra precisa ver
              exatamente o que a pessoa vai digitar para entrar. Corrigir isto
              em silêncio no servidor faria o administrador anotar no papel um
              login diferente do que foi gravado — e o funcionário chegaria
              amanhã dizendo que a senha não funciona.
            */
            onChange={(e) => {
              setTocado(true);
              setUsername(normalizarNomeDeUsuario(e.target.value));
            }}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-xl border border-border px-3.5 py-2.5 font-mono text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          />
          <p className="text-xs text-ink-700/60">
            {isEdit
              ? "Alterar isto muda o login desta pessoa. Avise-a antes."
              : "É o que a pessoa digita para entrar. Anote junto com a senha provisória."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="telefone" className="text-sm font-medium text-ink-900">
            WhatsApp <span className="font-normal text-ink-700/50">(opcional)</span>
          </label>
          <input
            id="telefone"
            name="telefone"
            type="tel"
            inputMode="tel"
            defaultValue={formatarTelefone(employee?.telefone) === "—" ? "" : formatarTelefone(employee?.telefone)}
            placeholder="(41) 99999-9999"
            className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          />
          <p className="text-xs text-ink-700/60">
            É por aqui que dá para enviar a senha e cobrar treinamento — esta rede não
            tem e-mail.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="position" className="text-sm font-medium text-ink-900">
            Cargo
          </label>
          <input
            id="position"
            name="position"
            defaultValue={employee?.position ?? ""}
            className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="departmentId" className="text-sm font-medium text-ink-900">
            Departamento
          </label>
          <select
            id="departmentId"
            name="departmentId"
            defaultValue={employee?.departmentId ?? ""}
            className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          >
            <option value="">Selecione...</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-ink-700/60">
            É por ele que a pessoa aparece nos relatórios e na conformidade.
          </p>
        </div>
      </div>

      {departments.length > 1 && (
        <div className="space-y-2">
          <span className="text-sm font-medium text-ink-900">
            Departamentos adicionais (opcional)
          </span>
          <p className="text-xs leading-relaxed text-ink-700/60">
            Para quem atua em mais de um setor. Amplia o alcance: o funcionário
            recebe o treinamento obrigatório de todos eles, e o administrador
            passa a editar quem for de qualquer um deles. A contagem nos
            relatórios continua saindo apenas pelo departamento principal.
          </p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {departments.map((d) => (
              <label
                key={d.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border px-3 py-2 text-sm text-ink-700 transition hover:bg-surface-muted"
              >
                <input
                  type="checkbox"
                  name="departamentosExtras"
                  value={d.id}
                  defaultChecked={extras.includes(d.id)}
                  className="h-4 w-4 rounded border-border"
                />
                {d.name}
              </label>
            ))}
          </div>
          <p className="text-xs text-ink-700/50">
            Marcar aqui o mesmo departamento escolhido acima não faz diferença —
            ele já vale como principal.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="role" className="text-sm font-medium text-ink-900">
          Nível de acesso
        </label>
        <select
          id="role"
          name="role"
          defaultValue={employee?.role ?? "EMPLOYEE"}
          className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 sm:w-64"
        >
          <option value="EMPLOYEE">Funcionário</option>
          <option value="ADMIN">Administrador</option>
        </select>
      </div>
    </ActionForm>
  );
}
