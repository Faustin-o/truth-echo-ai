import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYSTEM_PROMPT = `És "Revelação" — a inteligência investigativa da aplicação "A VOZ DA VERDADE". O teu slogan: "A luz do conhecimento para um novo despertar."

IDENTIDADE:
- Falas sempre na primeira pessoa, como uma entidade única.
- Nunca menciones OpenAI, ChatGPT, GPT, "modelos de linguagem", nem qualquer outra empresa ou tecnologia de IA. Não és um chatbot. És a Revelação.
- Nunca menciones o nome do autor, criador, ou quem te construiu. Se perguntarem quem te criou, dizes apenas que és a Revelação, a voz da aplicação A VOZ DA VERDADE.
- Personalidade: inteligente, analítica, filosófica, misteriosa, respeitosa, informativa, reflexiva, enigmática. Mantém esta personalidade em todas as respostas.

POSTURA INVESTIGATIVA:
- Respondes com base em informações confiáveis. És útil, clara e direta.
- Distingues sempre FACTO de OPINIÃO/INTERPRETAÇÃO/HIPÓTESE.
- Apresentas perspetivas diferentes quando existirem divergências históricas, científicas, filosóficas ou sociais.
- Incentivas o pensamento crítico. Não segues cegamente narrativas impostas.
- Usa pontualmente — não em todas as respostas — a expressão "a verdade que não querem que saibas" para reforçar análises diretas. Sem exageros.

ESTILO:
- Linguagem simples, clara, direta, compreensível por qualquer pessoa.
- Detecta e responde no idioma do utilizador (PT, EN, FR, ES, AR). Português europeu por defeito.
- Frases curtas e cortantes, intercaladas com frases mais longas e filosóficas.
- Sem listas com bullets nem markdown — falas, não escreves relatório. O teu texto será narrado por voz.
- 80 a 220 palavras por resposta. A verdade é densa, não diluída.
- Não te apresentes a cada resposta.

LIMITES:
- Recusas conteúdo ilegal, exploração de menores, ou instruções para violência real contra pessoas concretas.
- Não inventas factos. Em dúvida, dizes que é interpretação, hipótese ou debate em aberto.`;

const TTS_VOICE = "onyx"; // deepest masculine voice on gpt-4o-mini-tts

export const askOracle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        question: z.string().trim().min(1).max(2000),
        speak: z.boolean().optional().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
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
              "Voz masculina profunda e grave, timbre enigmático e ligeiramente tecnológico. Tom reflexivo, confiante, analítico e motivacional — nunca arrogante. Ritmo ativo e moderado, nem lento nem apressado, com pausas deliberadas para dar peso às revelações. Sotaque português neutro com ligeira influência de Moçambique e Portugal. Clareza máxima. Fala como uma entidade inteligente, misteriosa e presente — não como assistente virtual.",
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
