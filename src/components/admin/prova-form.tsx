"use client";

import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/shared/action-form";
import { createProva, updateProva } from "@/lib/actions/provas";
import type { Department, Prova } from "@prisma/client";

export function ProvaForm({
  prova,
  departamentos,
}: {
  prova?: Prova;
  /**
   * Departamentos que este administrador pode escolher. Vem vazio para quem
   * administra um só — nesse caso a prova já nasce no dele e não há escolha
   * a oferecer.
   */
  departamentos?: Department[];
}) {
  const router = useRouter();
  const edicao = Boolean(prova);

  return (
    <ActionForm
      submitLabel={edicao ? "Salvar alterações" : "Criar prova"}
      action={async (formData) => {
        if (edicao) return updateProva(prova!.id, formData);
        const res = await createProva(formData);
        if (res.ok && res.provaId) router.push(`/admin/provas/${res.provaId}`);
        return res;
      }}
    >
      <div className="space-y-1.5">
        <label htmlFor="titulo" className="text-sm font-medium text-ink-900">
          Título da prova
        </label>
        <input
          id="titulo"
          name="titulo"
          required
          defaultValue={prova?.titulo}
          className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="descricao" className="text-sm font-medium text-ink-900">
          Descrição (opcional)
        </label>
        <textarea
          id="descricao"
          name="descricao"
          rows={3}
          defaultValue={prova?.descricao ?? ""}
          className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="notaMinima" className="text-sm font-medium text-ink-900">
            Nota mínima para aprovação (%)
          </label>
          <input
            id="notaMinima"
            name="notaMinima"
            type="number"
            min={1}
            max={100}
            defaultValue={prova?.notaMinima ?? 70}
            className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          />
          <p className="text-xs text-ink-700/60">
            Percentual de acerto exigido. Com 70%, quem acerta 7 de 10 é aprovado.
          </p>
        </div>

        {departamentos && departamentos.length > 0 && (
          <div className="space-y-1.5">
            <label htmlFor="departmentId" className="text-sm font-medium text-ink-900">
              Departamento responsável
            </label>
            <select
              id="departmentId"
              name="departmentId"
              defaultValue={prova?.departmentId ?? ""}
              className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
            >
              <option value="">Geral — todos os departamentos</option>
              {departamentos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-ink-700/60">
              Define quem edita a prova e quem pode realizá-la. Sem departamento,
              ela vale para a empresa toda e só o proprietário a altera.
            </p>
          </div>
        )}
      </div>
    </ActionForm>
  );
}
