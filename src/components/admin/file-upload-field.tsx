"use client";

import { useRef, useState } from "react";
import { Loader2, UploadCloud, CheckCircle2, FileVideo, FileText } from "lucide-react";

type Kind = "videos" | "pdfs" | "covers";

const acceptByKind: Record<Kind, string> = {
  videos: "video/mp4,video/webm,video/ogg,video/quicktime",
  pdfs: "application/pdf",
  covers: "image/jpeg,image/png,image/webp",
};

/*
  A orientação de formato fica junto do campo porque é ali que ela é lembrada.
  Em documentação separada ela existe, mas quem cadastra um curso às pressas
  não vai abrir para conferir — e o arquivo errado só dá sinal depois, quando
  a capa aparece cortada ou o portal fica lento.

  A medida da capa vem dos contêineres que a exibem: 3:1 no cartão e 6:1 no
  banner. Não há tamanho que sirva aos dois, então o recomendado favorece o
  cartão, que aparece três vezes mais.
*/
const dicaPorTipo: Record<Kind, string | null> = {
  covers:
    "Recomendado 1600 × 500 px, em JPEG ou WebP, até 300 KB. As bordas são " +
    "cortadas conforme a tela — deixe texto e logotipo no centro.",
  videos:
    "MP4 ou WebM. Comprimir antes de enviar (WebM/VP9 em 720p) costuma reduzir " +
    "o arquivo à metade sem perda visível — e o envio na mesma proporção.",
  pdfs: null,
};

export function FileUploadField({
  kind,
  name,
  initialFileId,
  initialFileName,
  label,
}: {
  kind: Kind;
  name: string;
  initialFileId?: string | null;
  initialFileName?: string | null;
  label: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileId, setFileId] = useState<string | null>(initialFileId ?? null);
  const [fileName, setFileName] = useState<string | null>(initialFileName ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", kind);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Falha ao enviar arquivo.");
        return;
      }
      setFileId(json.id);
      setFileName(file.name);
    } finally {
      setUploading(false);
    }
  }

  const Icon = kind === "videos" ? FileVideo : kind === "pdfs" ? FileText : UploadCloud;

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-ink-900">{label}</label>
      <input type="hidden" name={name} value={fileId ?? ""} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border bg-surface-muted/50 px-4 py-3 text-left text-sm transition hover:bg-surface-muted"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white">
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin text-brand-700" />
          ) : fileId ? (
            <CheckCircle2 className="h-4 w-4 text-success-600" />
          ) : (
            <Icon className="h-4 w-4 text-ink-700/50" />
          )}
        </div>
        <span className="min-w-0 flex-1 truncate text-ink-700">
          {uploading ? "Enviando..." : fileName ? fileName : "Clique para selecionar um arquivo"}
        </span>
      </button>
      <input ref={inputRef} type="file" accept={acceptByKind[kind]} className="hidden" onChange={handleChange} />
      {dicaPorTipo[kind] && (
        <p className="text-xs leading-relaxed text-ink-700/60">{dicaPorTipo[kind]}</p>
      )}
      {error && <p className="text-xs text-danger-600">{error}</p>}
    </div>
  );
}
