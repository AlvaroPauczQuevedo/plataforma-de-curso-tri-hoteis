"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { updateProfile } from "@/lib/actions/profile";

export function AvatarUploader({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", "avatars");
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      const uploadJson = await uploadRes.json();

      if (!uploadRes.ok) {
        setError(uploadJson.error ?? "Falha ao enviar imagem.");
        return;
      }

      const profileFormData = new FormData();
      profileFormData.append("name", name);
      profileFormData.append("avatarFileId", uploadJson.id);
      const result = await updateProfile(profileFormData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <Avatar name={name} src={avatarUrl} size="lg" />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-brand-700 text-white shadow-sm hover:bg-brand-600"
          title="Alterar foto"
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleChange}
        />
      </div>
      <div>
        <p className="text-sm font-medium text-ink-900">Foto de perfil</p>
        <p className="text-xs text-ink-700/60">PNG, JPG ou WEBP. Clique no ícone para alterar.</p>
        {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
      </div>
    </div>
  );
}
