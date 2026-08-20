import { Download } from "lucide-react";

export function PdfViewer({ src, allowDownload }: { src: string; allowDownload: boolean }) {
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface-muted">
        <iframe
          src={`${src}#toolbar=${allowDownload ? 1 : 0}&navpanes=0`}
          title="Documento PDF"
          className="h-[70vh] w-full"
        />
      </div>
      {allowDownload && (
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
        >
          <Download className="h-4 w-4" />
          Abrir / baixar PDF em nova aba
        </a>
      )}
    </div>
  );
}
