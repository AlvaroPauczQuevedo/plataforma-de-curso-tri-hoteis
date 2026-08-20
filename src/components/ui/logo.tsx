import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Marca Tri Hotéis. A logo oficial já vem com o fundo laranja arredondado,
 * então é usada diretamente, sem contêiner colorido por trás.
 */
export function Logo({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/brand/logo-tri-hoteis.png"
      alt="Tri Hotéis"
      width={size}
      height={size}
      priority
      className={cn("rounded-xl object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}

export function LogoLockup({
  subtitle = "Tri Hotéis",
  tone = "light",
  size = 36,
}: {
  subtitle?: string;
  tone?: "light" | "dark";
  size?: number;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Logo size={size} />
      <div className="leading-tight">
        <p
          className={cn(
            "text-sm font-semibold",
            tone === "dark" ? "text-white" : "text-ink-900"
          )}
        >
          Academia Corporativa
        </p>
        <p
          className={cn(
            "text-[11px]",
            tone === "dark" ? "text-white/60" : "text-ink-700/60"
          )}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
}
