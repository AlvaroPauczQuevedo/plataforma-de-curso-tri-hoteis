"use client";

import { useRef, useState } from "react";
import { Loader2, UploadCloud, CheckCircle2, FileVideo, FileText } from "lucide-react";

type Kind = "videos" | "pdfs" | "covers";

const acceptByKind: Record<Kind, string> = {
  videos: "video/mp4,video/webm,video/ogg,video/quicktime",
  pdfs: "application/pdf",
  covers: "image/jpeg,image/png,image/webp",
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
      {error && <p className="text-xs text-danger-600">{error}</p>}
    </div>
  );
}
