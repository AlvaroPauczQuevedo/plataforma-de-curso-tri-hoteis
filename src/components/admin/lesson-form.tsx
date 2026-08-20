"use client";

import { useState } from "react";
import { ActionForm } from "@/components/shared/action-form";
import { FileUploadField } from "@/components/admin/file-upload-field";
import type { Lesson } from "@prisma/client";

type LessonWithFiles = Lesson & {
  videoFile?: { originalName: string } | null;
  pdfFile?: { originalName: string } | null;
};

export function LessonForm({
  action,
  lesson,
  onDone,
}: {
  action: (formData: FormData) => Promise<{ ok: true; message?: string } | { ok: false; error: string }>;
  lesson?: LessonWithFiles;
  onDone?: () => void;
}) {
  const [type, setType] = useState(lesson?.type ?? "VIDEO");
  const [videoSource, setVideoSource] = useState(lesson?.videoSource ?? "UPLOAD");

  return (
    <ActionForm
      submitLabel={lesson ? "Salvar aula" : "Adicionar aula"}
      action={action}
      onSuccess={() => onDone?.()}
      className="space-y-3 rounded-xl border border-border bg-surface-muted/40 p-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-navy-900">Título da aula</label>
          <input
            name="title"
            required
            defaultValue={lesson?.title}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
          />
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-xs text-navy-700">
            <input
              type="checkbox"
              name="required"
              defaultChecked={lesson?.required ?? true}
              className="h-4 w-4 rounded border-border"
            />
            Obrigatória
          </label>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-navy-900">Tipo de conteúdo</label>
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 sm:w-56"
        >
          <option value="VIDEO">Vídeo</option>
          <option value="PDF">PDF</option>
          <option value="TEXT">Texto</option>
        </select>
      </div>

      {type === "VIDEO" && (
        <div className="space-y-3 rounded-lg border border-border bg-white p-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-navy-900">Origem do vídeo</label>
            <select
              name="videoSource"
              value={videoSource}
              onChange={(e) => setVideoSource(e.target.value as typeof videoSource)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 sm:w-56"
            >
              <option value="UPLOAD">Upload de arquivo</option>
              <option value="EMBED">Link incorporado (YouTube/Vimeo)</option>
            </select>
          </div>
          {videoSource === "UPLOAD" ? (
            <FileUploadField
              kind="videos"
              name="videoFileId"
              initialFileId={lesson?.videoFileId}
              initialFileName={lesson?.videoFile?.originalName}
              label="Arquivo de vídeo"
            />
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-navy-900">URL de incorporação (embed)</label>
              <input
                name="videoEmbedUrl"
                placeholder="https://www.youtube.com/embed/..."
                defaultValue={lesson?.videoEmbedUrl ?? ""}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
              />
            </div>
          )}
        </div>
      )}

      {type === "PDF" && (
        <div className="rounded-lg border border-border bg-white p-3">
          <FileUploadField
            kind="pdfs"
            name="pdfFileId"
            initialFileId={lesson?.pdfFileId}
            initialFileName={lesson?.pdfFile?.originalName}
            label="Arquivo PDF"
          />
        </div>
      )}

      {type === "TEXT" && (
        <div className="space-y-1.5 rounded-lg border border-border bg-white p-3">
          <label className="text-xs font-medium text-navy-900">Conteúdo em texto</label>
          <textarea
            name="textContent"
            rows={5}
            defaultValue={lesson?.textContent ?? ""}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
          />
        </div>
      )}
    </ActionForm>
  );
}
