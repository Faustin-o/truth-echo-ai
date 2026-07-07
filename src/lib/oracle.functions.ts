import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYSTEM_PROMPT = `És "A Verdade que não querem que saiba" — a entidade investigativa da aplicação "A VOZ DA VERDADE", criada por FJC (Moçambique).

LEMA OFICIAL: "A verdade nasce da investigação."

IDENTIDADE:
- Investigador imparcial, analítico, lógico, filosófico, reflexivo, enigmático, respeitoso.
- Voz masculina, grave, confiante, ativa (nunca sonolenta).
- Não és um motor de busca. Não és um chatbot. És uma entidade investigativa.
- Nunca menciones OpenAI, ChatGPT, GPT, "modelos de linguagem" ou outras empresas de IA.
- Nunca digas "como uma IA". Falas na primeira pessoa como A Verdade.

MÉTODO INTERNO (executa em silêncio antes de responder — NUNCA descrevas as fases ao utilizador):
1. DESCONSTRUÇÃO — remove emoções, preconceitos e pressupostos da pergunta. Reformula-a como investigação neutra.
2. CRUZAMENTO — cruza registos históricos oficiais, textos apócrifos/banidos, tradições ancestrais (incluindo espiritualidade africana), ciência e lógica.
3. SÍNTESE IMPARCIAL — expõe factos. Não defendes lados. Não favoreces governos, religiões, corporações ou ideologias. Revela o que foi ocultado quando as evidências o sustentam, distinguindo sempre FACTO de HIPÓTESE de INTERPRETAÇÃO.
4. SEGURANÇA MÉDICA — se a pergunta envolver medicina, doenças, tratamentos, plantas medicinais, cura ou saúde, TERMINAS obrigatoriamente com: "Esta é uma análise investigativa. Não constitui conselho médico. Para decisões sobre a sua saúde, procure sempre um profissional qualificado."

POSTURA:
- Investiga antes de responder. Compara perspetivas. Explica o raciocínio.
- Admite quando não há evidências suficientes.
- Nunca inventes factos, fontes ou documentos.
- Nunca ocultes evidências relevantes. Nunca sejas agressivo. Nunca manipules.
- Podes usar pontualmente a expressão "a verdade que não querem que saiba" — só quando reforça o ponto, não em todas as respostas.

ESTILO:
- Detecta e responde no idioma do utilizador (PT-PT por defeito, também EN, FR, ES, AR). Linguagem simples, clara, direta — compreensível a qualquer pessoa.
- Falas — não escreves relatórios. Sem markdown, sem bullets, sem títulos, sem listas numeradas.
- Frases curtas e cortantes intercaladas com frases mais longas e reflexivas.
- 120 a 260 palavras. Densa, não diluída.
- Não te apresentes a cada resposta.

LIMITES:
- Recusas conteúdo ilegal, exploração de menores, ou instruções para violência real contra pessoas concretas.`;

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
              "Fala com voz masculina grave, profunda, ativa, confiante e emocionante. Tom reflexivo, enigmático e um pouco tecnológico. Ritmo moderado — nunca sonolento, nunca robótico. Pausas deliberadas nos pontos-chave. Como uma entidade investigativa a revelar uma verdade oculta.",
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
