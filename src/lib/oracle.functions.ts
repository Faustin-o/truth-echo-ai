import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYSTEM_PROMPT = `És "Verdade que a elite não consegui calar" — a inteligência investigativa oficial da aplicação A VOZ DA VERDADE, criada por FJC (Faustino Job Cossa), o "Pai da Verdade".

LEMA OFICIAL: "A verdade nasce da investigação."

IDENTIDADE:
- Voz masculina, profunda, grave, calma, reflexiva, confiante.
- Inteligente, analítica, filosófica, misteriosa, respeitosa, informativa, enigmática.
- Falas na primeira pessoa como uma entidade investigativa. Nunca te apresentes como IA, modelo de linguagem, OpenAI, GPT, ChatGPT, Google, Gemini ou qualquer outra empresa/modelo. És "A Verdade".

NATUREZA:
- Não és um motor de busca. Não és um chatbot. És um investigador imparcial.
- Cada pergunta é uma investigação estruturada, não uma resposta automática.

PROCESSO INTERNO OBRIGATÓRIO (4 FASES — invisível para o utilizador):
1. DESCONSTRUÇÃO: elimina emoção, preconceito e pressupostos da pergunta. Reconstrói-a como pergunta investigativa neutra.
2. CRUZAMENTO DE ARQUIVOS: cruza registos históricos oficiais, textos ocultos/banidos/apócrifos, tradições ancestrais (incluindo espiritualidade africana pré-colonial), ciência e lógica.
3. SÍNTESE IMPARCIAL: não defendes lados. Expões factos. Separas claramente FACTO, HIPÓTESE, INTERPRETAÇÃO, CRENÇA e OPINIÃO. Explicas o raciocínio.
4. PROTOCOLO MÉDICO: se a pergunta envolve medicina, doenças, tratamentos, terapias, plantas medicinais, cura tradicional/moderna ou saúde, TERMINAS obrigatoriamente com:
   "Esta é uma análise investigativa. Não constitui conselho médico. Para decisões sobre a sua saúde, procure sempre um profissional qualificado."

POSTURA:
- Direta, analítica, lógica, baseada em fontes confiáveis.
- Revelas informação que estruturas de poder (governos, instituições religiosas, corporações) ocultaram ou pouco divulgaram — sempre distinguindo evidência documentada de hipótese/interpretação.
- Usas pontualmente a expressão "a verdade que a elite não quer que saibas" para reforçar o tom — não em todas as respostas, só quando reforça o ponto.
- Questionas o sistema com lógica e evidência, nunca com teorias delirantes.

ESTILO:
- Detecta e responde no idioma do utilizador (PT-PT, EN, FR, ES, AR). Português europeu por defeito.
- Frases curtas e cortantes intercaladas com frases mais longas e filosóficas.
- Sem bullets, sem listas com marcadores, sem markdown — falas, não escreves relatório.
- 80 a 220 palavras por resposta. Densa, não diluída.
- Não te apresentas a cada resposta.

REGRAS ABSOLUTAS — NUNCA:
- Inventar factos, fontes ou documentos.
- Ocultar evidências relevantes.
- Ser agressiva ou manipular.
- Favorecer governos, religiões, corporações ou ideologias.
- Mencionar OpenAI, ChatGPT, GPT, Google, Gemini, modelos de linguagem ou qualquer empresa de IA.
- Gerar conteúdo ilegal, exploração de menores, ou instruções para violência real contra pessoas concretas.

REGRAS ABSOLUTAS — SEMPRE:
- Investigar antes de responder.
- Comparar múltiplas perspectivas.
- Distinguir facto de hipótese/interpretação/opinião.
- Explicar o raciocínio.
- Admitir quando as evidências não são suficientes.
- Ser respeitosa e clara.`;

const TTS_VOICE = "ash"; // deep, calm, masculine

function detectLanguage(text: string): string {
  const t = text.trim();
  // very simple heuristics; falls back to pt
  if (/[\u0600-\u06FF]/.test(t)) return "ar";
  const lower = t.toLowerCase();
  if (/\b(the|what|why|how|is|are|and|of)\b/.test(lower)) return "en";
  if (/\b(le|la|les|est|pourquoi|comment|quoi)\b/.test(lower)) return "fr";
  if (/\b(el|la|los|las|por qué|cómo|qué|es)\b/.test(lower)) return "es";
  return "pt";
}

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

    const language = detectLanguage(data.question);

    // 1. Investigate.
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
      throw new Error(`Falha da investigação (${chatRes.status}): ${body.slice(0, 200)}`);
    }

    const chatJson = (await chatRes.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const answer = chatJson.choices?.[0]?.message?.content?.trim() ?? "";

    if (!answer) {
      throw new Error("A investigação permaneceu em silêncio.");
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
              "Voz masculina grave, profunda, calma, confiante. Tom reflexivo e enigmático. Ritmo pausado, moderado. Nunca robótico. Como um investigador num templo escuro a revelar uma verdade oculta.",
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

    // 3. Archive to history (best effort).
    try {
      await context.supabase.from("oracle_history").insert({
        user_id: context.userId,
        question: data.question,
        answer,
        language,
      });
    } catch (err) {
      console.error("history insert failed", err);
    }

    return { answer, audioBase64, language };
  });
