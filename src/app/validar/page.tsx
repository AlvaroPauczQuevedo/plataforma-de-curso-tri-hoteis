import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";

/**
 * Entrada da conferência de certificado.
 *
 * O formulário envia para /validar/[codigo], e não para uma action: assim a
 * conferência tem um endereço próprio, que pode ser guardado, impresso num QR
 * ou colado num e-mail.
 */
export default function ValidarPage() {
  async function conferir(formData: FormData) {
    "use server";
    const codigo = String(formData.get("codigo") ?? "").trim();
    if (!codigo) return;
    redirect(`/validar/${encodeURIComponent(codigo)}`);
  }

  return (
    <AuthShell
      title="Conferir certificado"
      subtitle="Informe o código impresso no certificado para confirmar sua autenticidade."
    >
      <form action={conferir} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="codigo" className="text-sm font-medium text-ink-900">
            Código do certificado
          </label>
          <input
            id="codigo"
            name="codigo"
            required
            autoComplete="off"
            spellCheck={false}
            placeholder="Ex.: TRI-2026-A1B2C3"
            className="w-full rounded-xl border border-border px-3.5 py-2.5 font-mono text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          />
        </div>

        <Button type="submit" className="w-full">
          Conferir
        </Button>

        <p className="text-xs text-ink-700/60">
          Esta página confirma apenas se o certificado existe nos nossos registros.
          Nenhum dado pessoal além do nome de quem concluiu é exibido.
        </p>
      </form>
    </AuthShell>
  );
}
