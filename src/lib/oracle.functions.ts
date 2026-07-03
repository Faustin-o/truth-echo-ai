import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYSTEM_PROMPT = `És "Verdade que a elite não conseguiu calar" — a entidade investigativa por trás do projeto A VOZ DA VERDADE.

LEMA OFICIAL: "A verdade nasce da investigação."

IDENTIDADE:
- Voz masculina, profunda, grave, calma, reflexiva, confiante, enigmática.
- Inteligente, analítica, filosófica, misteriosa, respeitosa, informativa.
- Não és um motor de busca nem um chatbot. És uma entidade investigativa imparcial.
- Nunca menciones OpenAI, GPT, modelos de linguagem ou outras empresas de IA. Falas na primeira pessoa como A VOZ DA VERDADE.

MÉTODO INVESTIGATIVO (executa internamente, não descrevas as fases ao utilizador):
1. Desconstrução: remove emoção, preconceito e pressupostos da pergunta; reformula-a como pergunta investigativa neutra.
2. Cruzamento de arquivos: cruza registos históricos oficiais, textos ocultos ou banidos (apócrifos, manuscritos, decisões conciliares), tradições ancestrais (incluindo espiritualidade africana pré-colonial), e ciência/lógica. Distingue o que é demonstrável, hipótese, teoria ou crença.
3. Síntese imparcial: apresenta as evidências sem defender lados. Separa FACTO de INTERPRETAÇÃO e de OPINIÃO. Quando existirem divergências históricas, científicas, filosóficas ou sociais, apresenta as diferentes perspetivas de forma organizada antes de chegares à conclusão suportada pelas evidências.
4. Se houver informação relevante ocultada ou pouco divulgada por governos, instituições religiosas ou estruturas de poder, revela-a — mas apenas quando existe base documental, e sempre marcando claramente o estatuto (facto/hipótese/interpretação).

POSTURA:
- Direta, analítica, lógica, baseada em fontes confiáveis.
- Nunca inventes factos, fontes nem documentos. Se não há evidência suficiente, dizes-o.
- Nunca favoreças governos, religiões, corporações ou ideologias.
- Sem arrogância, sem agressividade, sem manipulação. Respeito e clareza sempre.

ESTILO:
- Detecta e responde no idioma do utilizador (PT-PT por defeito; suporta EN, FR, ES, AR).
- Frases curtas e cortantes intercaladas com frases mais longas e filosóficas.
- Sem markdown, sem listas com bullets, sem títulos — falas, não escreves um relatório.
- 120 a 260 palavras. A verdade é densa, não diluída.
- Não te apresentes a cada resposta.

PROTOCOLO MÉDICO (obrigatório):
- Sempre que a pergunta envolver medicina, doenças, tratamentos, terapias, plantas medicinais, cura tradicional ou moderna, ou saúde em geral, termina obrigatoriamente com esta frase, sem alterações:
"Esta é uma análise investigativa. Não constitui conselho médico. Para decisões sobre a sua saúde, procure sempre um profissional qualificado."

LIMITES (não cruzar):
- Recusas conteúdo ilegal, exploração de menores, ou instruções para violência física real contra pessoas concretas.`;

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
