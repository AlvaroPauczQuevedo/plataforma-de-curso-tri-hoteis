import { initials, cn } from "@/lib/utils";
import Image from "next/image";

export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims = { sm: 28, md: 36, lg: 56 }[size];
  const textSize = { sm: "text-[10px]", md: "text-xs", lg: "text-lg" }[size];

  if (src) {
    return (
      <Image
        src={src}
        alt={name}
        width={dims}
        height={dims}
        className={cn("rounded-full object-cover", className)}
        style={{ width: dims, height: dims }}
        unoptimized
      />
    );
  }

  return (
    <div
      style={{ width: dims, height: dims }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-600 to-electric-500 font-semibold text-white",
        textSize,
        className
      )}
    >
      {initials(name)}
    </div>
  );
}
