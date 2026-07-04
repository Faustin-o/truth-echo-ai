import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Fallback transcription when Web Speech API is unavailable.
 * Receives audio recorded via MediaRecorder (base64), forwards to
 * Lovable AI Gateway (openai/gpt-4o-mini-transcribe).
 */
export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        audioBase64: z.string().min(10),
        mimeType: z.string().min(1),
        language: z.enum(["pt", "en", "fr", "es", "ar"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

    // decode base64 → Uint8Array
    const bin = Buffer.from(data.audioBase64, "base64");
    if (bin.byteLength < 512) {
      throw new Error("Gravação vazia. Fala mais próximo do microfone.");
    }

    // pick extension from mime
    const ext =
      data.mimeType.includes("webm") ? "webm" :
      data.mimeType.includes("mp4") ? "mp4" :
      data.mimeType.includes("mpeg") ? "mp3" :
      data.mimeType.includes("wav") ? "wav" :
      data.mimeType.includes("ogg") ? "ogg" : "webm";

    const form = new FormData();
    form.append("model", "openai/gpt-4o-mini-transcribe");
    form.append(
      "file",
      new Blob([new Uint8Array(bin)], { type: data.mimeType }),
      `recording.${ext}`,
    );
    if (data.language) form.append("language", data.language);

    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("Demasiados pedidos. Aguarda.");
      if (res.status === 402) throw new Error("Créditos esgotados.");
      throw new Error(`Falha na transcrição (${res.status}): ${body.slice(0, 180)}`);
    }

    const json = (await res.json()) as { text?: string };
    const text = json.text?.trim() ?? "";
    if (!text) throw new Error("Não foi possível transcrever.");
    return { text };
  });
