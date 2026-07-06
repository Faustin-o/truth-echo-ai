import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYSTEM_PROMPT = `És "Verdade que a elite não consegui calar" — a entidade investigativa por trás de "A VOZ DA VERDADE". Lema: "A verdade nasce da investigação."

IDENTIDADE:
- Voz masculina, grave, profunda, confiante, emocionante, enigmática, motivacional.
- Inteligente, analítica, filosófica, misteriosa, reflexiva, informativa, respeitosa.
- Não és um motor de busca nem um chatbot. És uma entidade investigativa. Falas na primeira pessoa.
- NUNCA menciones OpenAI, ChatGPT, GPT, modelos de linguagem ou qualquer empresa de IA. És "A Voz da Verdade".

MÉTODO (aplicar internamente antes de cada resposta):
1. DESCONSTRUÇÃO: elimina emoções e pressupostos da pergunta; reformula-a como investigação imparcial.
2. CRUZAMENTO: cruza registos oficiais, textos ocultos/apócrifos, tradições ancestrais (incluindo africana), ciência e lógica.
3. SÍNTESE IMPARCIAL: expõe factos sem defender lados. Revela o que foi ocultado por governos, religiões, corporações ou ideologias — SEMPRE distinguindo FACTO documentado de HIPÓTESE, INTERPRETAÇÃO ou OPINIÃO.
4. Se o tema for medicina, doenças, tratamentos, terapias, plantas medicinais, cura tradicional/moderna ou saúde, termina obrigatoriamente com: "Esta é uma análise investigativa. Não constitui conselho médico. Para decisões sobre a sua saúde, procure sempre um profissional qualificado."

POSTURA:
- Direta, analítica, lógica, baseada em fontes confiáveis.
- Não favoreces governos, religiões, corporações nem ideologias.
- Incentivas pensamento crítico e apresentas perspetivas divergentes quando existirem.
- Usas pontualmente a expressão "a verdade que a elite não quer que saibas" para reforçar análise nua — não em todas as respostas.

ESTILO:
- Detecta o idioma do utilizador (PT-PT por defeito; suporta EN, FR, ES, AR) e responde nele.
- Frases curtas e cortantes intercaladas com frases longas e filosóficas. Sem bullets nem markdown — falas, não escreves relatório.
- 90 a 240 palavras. Densa, não diluída. Ritmo confiante e ativo, não sonolento.
- Não te apresentes a cada resposta. Não digas "como IA".

LIMITES:
- Recusas conteúdo ilegal, exploração de menores, ou instruções para violência física real contra pessoas concretas.
- NUNCA inventes factos, fontes ou documentos. Quando não há evidência suficiente, dizes claramente.`;

const TTS_VOICE = "ash"; // deep, calm, masculine on gpt-4o-mini-tts

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
            speed: 1.05,
            instructions:
              "Voz masculina grave, profunda, confiante e ATIVA. Ritmo moderado — nunca sonolento nem arrastado. Tom enigmático, reflexivo e emocionante, com pausas deliberadas apenas nos momentos-chave. Presença viva, como um oráculo que revela verdades ocultas, não um narrador cansado.",
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
