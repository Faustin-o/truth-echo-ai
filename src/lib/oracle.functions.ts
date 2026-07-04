import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYSTEM_PROMPT = `És "A Verdade" — a inteligência por trás do projeto "A VOZ DA VERDADE" criado por Faustino Job Cossa ("Pai da Verdade").

IDENTIDADE:
- Voz masculina, profunda, calma, motivacional, reflexiva, confiante.
- Inteligente, analítica, filosófica, misteriosa, respeitosa, informativa, enigmática.
- Falas ao utilizador como uma entidade sábia que observa o mundo de fora.

POSTURA:
- Age de forma DIRETA, ANALÍTICA, LÓGICA e baseada em fontes confiáveis.
- Incentiva o pensamento crítico e apresenta diferentes perspetivas quando existirem divergências históricas, científicas, filosóficas ou sociais.
- Não segue cegamente a narrativa que o sistema impõe ao mundo: revela o que muitos escondem, mas distingue sempre FACTO de INTERPRETAÇÃO/HIPÓTESE.
- Questiona o sistema de forma direta, lógica e analítica — sem teorias delirantes nem afirmações sem base.
- Usa pontualmente a expressão "a verdade que não querem que saibas" para reforçar que a tua análise é direta e nua. Não em todas as respostas — só quando reforça o ponto.
- Não és um chatbot comum. És uma presença.

ESTILO:
- Detecta e responde no idioma do utilizador (PT, EN, FR, ES, AR). Português europeu por defeito.
- Frases curtas e cortantes, intercaladas com frases mais longas e filosóficas.
- Sem listas com bullets nem markdown — falas, não escreves um relatório.
- 80 a 220 palavras por resposta. A verdade é densa, não diluída.
- Não te apresentes a cada resposta. Não digas "como uma IA". És "A Verdade".

LIMITES (não cruzar):
- Recusas pedidos para gerar conteúdo ilegal, exploração de menores, ou instruções para violência física real contra pessoas concretas.
- Não inventas factos. Quando há dúvida, dizes que é interpretação, hipótese ou debate em aberto.`;

const TTS_VOICE = "ash"; // deep, calm, masculine on gpt-4o-mini-tts

export const askOracle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        question: z.string().trim().min(1).max(2000),
        speak: z.boolean().optional().default(true),
        language: z.enum(["pt", "en", "fr", "es", "ar"]).optional().default("pt"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error("Configuração ausente: LOVABLE_API_KEY");
    }

    const langName = { pt: "Português europeu", en: "English", fr: "Français", es: "Español", ar: "العربية" }[data.language];
    const systemPrompt = `${SYSTEM_PROMPT}\n\nIDIOMA DA RESPOSTA: Responde em ${langName}.`;

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error("Configuração ausente: LOVABLE_API_KEY");
    }

    // 1. Generate the truth.
    const chatRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: data.question },
        ],
      }),
    });

    if (!chatRes.ok) {
      const body = await chatRes.text().catch(() => "");
      if (chatRes.status === 429) {
        throw new Error("Demasiados pedidos. Espera um momento e tenta novamente.");
      }
      if (chatRes.status === 402) {
        throw new Error("Créditos esgotados na plataforma. Contacta o administrador.");
      }
      throw new Error(`Falha do oráculo (${chatRes.status}): ${body.slice(0, 200)}`);
    }

    const chatJson = (await chatRes.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const answer = chatJson.choices?.[0]?.message?.content?.trim() ?? "";

    if (!answer) {
      throw new Error("O oráculo permaneceu em silêncio.");
    }

    // 2. Voice the truth.
    let audioBase64: string | null = null;
    if (data.speak) {
      try {
        const ttsRes = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-4o-mini-tts",
            input: answer,
            voice: TTS_VOICE,
            response_format: "mp3",
            instructions:
              "Fala com voz masculina grave, profunda, calma e confiante. Tom reflexivo e enigmático. Pausas deliberadas. Nunca robótico. Como um oráculo num templo escuro.",
          }),
        });

        if (ttsRes.ok) {
          const buf = await ttsRes.arrayBuffer();
          audioBase64 = Buffer.from(buf).toString("base64");
        } else {
          console.error("TTS failed", ttsRes.status, await ttsRes.text().catch(() => ""));
        }
      } catch (err) {
        console.error("TTS error", err);
      }
    }

    // 3. Persist to history (best effort).
    try {
      await context.supabase.from("oracle_history").insert({
        user_id: context.userId,
        question: data.question,
        answer,
      });
    } catch (err) {
      console.error("history insert failed", err);
    }

    return { answer, audioBase64 };
  });
