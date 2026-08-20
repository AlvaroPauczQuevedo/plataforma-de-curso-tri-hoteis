"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { updateVideoProgress } from "@/lib/actions/learning";

export function VideoPlayer({
  lessonId,
  src,
  thresholdPercent,
  initialPositionSeconds,
  initialCompleted,
}: {
  lessonId: string;
  src: string;
  thresholdPercent: number;
  initialPositionSeconds: number;
  initialCompleted: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [completed, setCompleted] = useState(initialCompleted);
  const lastSentRef = useRef(0);
  const router = useRouter();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function onLoadedMetadata() {
      if (video && initialPositionSeconds > 0 && initialPositionSeconds < video.duration - 2) {
        video.currentTime = initialPositionSeconds;
      }
    }

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    return () => video.removeEventListener("loadedmetadata", onLoadedMetadata);
  }, [initialPositionSeconds]);

  async function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video || !video.duration) return;

    const now = Date.now();
    if (now - lastSentRef.current < 4000) return; // envia no máximo a cada 4s
    lastSentRef.current = now;

    const watchedPercent = Math.round((video.currentTime / video.duration) * 100);
    const wasCompleted = completed;
    const result = await updateVideoProgress(
      lessonId,
      video.currentTime,
      watchedPercent,
      thresholdPercent
    );
    if (result.ok && !wasCompleted && watchedPercent >= thresholdPercent) {
      setCompleted(true);
      router.refresh();
    }
  }

  async function handleEnded() {
    const video = videoRef.current;
    if (!video) return;
    const result = await updateVideoProgress(lessonId, video.duration, 100, thresholdPercent);
    if (result.ok) {
      setCompleted(true);
      router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl bg-black">
        <video
          ref={videoRef}
          src={src}
          controls
          controlsList="nodownload"
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          className="aspect-video w-full"
        >
          Seu navegador não suporta reprodução de vídeo.
        </video>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-ink-700/60">
        {completed ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 text-success-600" />
            Aula concluída automaticamente.
          </>
        ) : (
          `A aula será marcada como concluída automaticamente ao assistir ${thresholdPercent}% do vídeo.`
        )}
      </p>
    </div>
  );
}
