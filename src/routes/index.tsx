import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Mic, Menu, Film, Keyboard, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { askOracle } from "@/lib/oracle.functions";
import { SoundWaves } from "@/components/oracle/sound-waves";
import { CinemaMode } from "@/components/oracle/cinema-mode";
import { MenuSheet } from "@/components/oracle/menu-sheet";
import { useAppSettings } from "@/lib/app-settings";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "A VOZ DA VERDADE — Investigação" },
      {
        name: "description",
        content:
          "A verdade nasce da investigação. Faz a pergunta, escuta a análise — sem censura, sem clichés. Modo cinema imersivo com narração grave.",
      },
    ],
  }),
  component: OraclePage,
});

type Status = "idle" | "listening" | "thinking" | "answered";

function OraclePage() {
  const navigate = useNavigate();
  const ask = useServerFn(askOracle);
  const [authChecked, setAuthChecked] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");
  const [audioB64, setAudioB64] = useState<string | null>(null);
  const [cinemaOpen, setCinemaOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [textMode, setTextMode] = useState(false);
  const [textInput, setTextInput] = useState("");

  const recognitionRef = useRef<unknown>(null);
  const sttSupportedRef = useRef<boolean>(false);

  // Auth gate
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (!data.session) {
        navigate({ to: "/auth", replace: true });
      } else {
        setAuthChecked(true);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate({ to: "/auth", replace: true });
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  // Detect speech recognition support
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR =
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    sttSupportedRef.current = Boolean(SR);
  }, []);

  const settings = useAppSettings();

  async function submitQuestion(question: string) {
    setStatus("thinking");
    setTranscript(question);
    try {
      const res = await ask({ data: { question, speak: settings.voiceEnabled } });
      setAnswer(res.answer);
      setAudioB64(res.audioBase64);
      setStatus("answered");
      setCinemaOpen(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao consultar a Verdade.";
      toast.error(msg);
      setStatus("idle");
    }
  }

  function handleMicTap() {
    if (status === "thinking") return;

    if (!sttSupportedRef.current) {
      setTextMode(true);
      toast("Este browser não reconhece voz. Escreve a tua pergunta.");
      return;
    }

    if (status === "listening") {
      const rec = recognitionRef.current as { stop?: () => void } | null;
      rec?.stop?.();
      return;
    }

    type SRConstructor = new () => {
      lang: string;
      interimResults: boolean;
      continuous: boolean;
      onresult: (e: { results: ArrayLike<{ 0: { transcript: string } }> }) => void;
      onerror: (e: { error: string }) => void;
      onend: () => void;
      start: () => void;
      stop: () => void;
    };

    const SR =
      ((window as unknown as { SpeechRecognition?: SRConstructor }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: SRConstructor })
          .webkitSpeechRecognition) as SRConstructor;

    const rec = new SR();
    const lang = navigator.language || "pt-PT";
    rec.lang = lang.startsWith("pt") ? "pt-PT" : lang;
    rec.interimResults = false;
    rec.continuous = false;

    let finalText = "";
    rec.onresult = (e) => {
      const r = e.results[0];
      if (r) finalText = r[0].transcript;
    };
    rec.onerror = (e) => {
      if (e.error !== "aborted") toast.error(`Microfone: ${e.error}`);
      setStatus("idle");
    };
    rec.onend = () => {
      if (finalText.trim()) {
        void submitQuestion(finalText.trim());
      } else {
        setStatus("idle");
      }
    };

    recognitionRef.current = rec;
    setStatus("listening");
    setTranscript("");
    rec.start();
  }

  function handleTextSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = textInput.trim();
    if (!q) return;
    setTextInput("");
    setTextMode(false);
    void submitQuestion(q);
  }

  if (!authChecked) {
    return (
      <div className="grid min-h-screen place-items-center bg-obsidian">
        <Loader2 className="size-6 animate-spin text-cyan-vivid" />
      </div>
    );
  }

  const statusLabel: Record<Status, string> = {
    idle: "Pronto para ouvir...",
    listening: "A receber transmissão...",
    thinking: "A descodificar a verdade...",
    answered: "Sintonia restabelecida",
  };

  const subStatus: Record<Status, string> = {
    idle: "Sintonia estabelecida",
    listening: "Microfone aberto",
    thinking: "Canal seguro",
    answered: "Pergunta de novo",
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-obsidian text-foreground select-none scanlines">
      {/* Background depth */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        aria-hidden="true"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 50% 20%, rgba(0,242,255,0.18) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(0,242,255,0.08) 0%, transparent 60%)",
        }}
      />

      {/* HEADER */}
      <header className="fixed top-0 left-0 z-40 flex w-full items-start justify-between bg-gradient-to-b from-obsidian via-obsidian/85 to-transparent p-6">
        <div className="space-y-1">
          <h1 className="font-display text-xl font-bold tracking-tighter uppercase leading-none">
            A Voz e a <span className="text-cyan-vivid">Verdade</span>
          </h1>
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-ghost">
            Revelando o que o sistema esconde
          </p>
        </div>
        <button
          onClick={() => setMenuOpen(true)}
          className="grid size-10 place-items-center border border-cyan-vivid/20 text-cyan-vivid/70 transition-colors hover:border-cyan-vivid hover:text-cyan-vivid"
          aria-label="Abrir menu"
        >
          <Menu className="size-4" />
        </button>
      </header>

      {/* MAIN ORACLE */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pt-24 pb-44">
        <div className="mb-12 text-center">
          <p className="text-[10px] uppercase tracking-[0.4em] text-cyan-vivid/60">
            {subStatus[status]}
          </p>
          <h2 className="mt-2 font-display text-2xl font-light uppercase tracking-[0.18em] text-foreground/90">
            {statusLabel[status]}
          </h2>
        </div>

        <div className="relative grid place-items-center size-64">
          <SoundWaves active={status === "listening"} />

          <button
            onClick={handleMicTap}
            disabled={status === "thinking"}
            className={`relative z-20 grid size-40 place-items-center rounded-full bg-obsidian transition-all border ${
              status === "listening"
                ? "border-cyan-vivid mic-listen"
                : status === "thinking"
                  ? "border-cyan-vivid/60"
                  : "border-cyan-vivid/50 mic-breathe"
            } shadow-[inset_0_0_30px_rgba(0,242,255,0.1)] active:scale-95`}
            aria-label={status === "listening" ? "Parar microfone" : "Falar com a Verdade"}
          >
            <div className="grid size-24 place-items-center rounded-full bg-gradient-to-tr from-cyan-vivid/20 to-transparent border border-white/10">
              {status === "thinking" ? (
                <Loader2 className="size-7 animate-spin text-cyan-vivid" />
              ) : (
                <Mic
                  className={`size-7 ${
                    status === "listening" ? "text-cyan-vivid" : "text-cyan-vivid/80"
                  }`}
                />
              )}
            </div>
          </button>
        </div>

        {transcript && (
          <p className="mt-12 max-w-md text-center font-serif italic text-base text-ghost fade-up">
            "{transcript}"
          </p>
        )}

        {!transcript && (
          <p className="mt-12 max-w-xs text-center font-serif italic text-sm text-ghost/70">
            "O silêncio é a única coisa que eles não conseguem monitorar."
          </p>
        )}

        {textMode && (
          <form
            onSubmit={handleTextSubmit}
            className="mt-8 w-full max-w-md fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Escreve a tua pergunta..."
              className="w-full border border-cyan-vivid/30 bg-obsidian/80 px-4 py-3 text-sm text-foreground placeholder:text-ghost/60 outline-none focus:border-cyan-vivid"
            />
            <div className="mt-2 flex justify-end gap-2 text-[10px] uppercase tracking-[0.3em]">
              <button
                type="button"
                onClick={() => setTextMode(false)}
                className="px-3 py-2 text-ghost hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="border border-cyan-vivid/40 px-4 py-2 text-cyan-vivid hover:bg-cyan-vivid hover:text-obsidian"
              >
                Perguntar
              </button>
            </div>
          </form>
        )}

        {!textMode && status === "idle" && (
          <button
            onClick={() => setTextMode(true)}
            className="mt-8 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-ghost hover:text-cyan-vivid transition-colors"
          >
            <Keyboard className="size-3" />
            Pergunta por texto
          </button>
        )}
      </main>

      {/* PREMIUM CTA */}
      <footer className="fixed bottom-0 left-0 z-30 w-full bg-gradient-to-t from-obsidian via-obsidian/95 to-transparent p-6 pb-8">
        <div className="mx-auto max-w-md">
          <button
            onClick={() => {
              if (answer) {
                setCinemaOpen(true);
              } else {
                toast("Vídeo gerado por IA — funcionalidade Premium. Em breve.");
              }
            }}
            className="group relative flex w-full items-center justify-center gap-3 overflow-hidden border border-cyan-vivid/30 bg-white py-4 text-xs font-bold uppercase tracking-[0.25em] text-obsidian transition-transform active:scale-[0.98]"
          >
            <Film className="relative z-10 size-4" />
            <span className="relative z-10">
              {answer ? "Reabrir modo cinema" : "Ver resposta em vídeo"}
            </span>
            <span className="absolute -left-full top-0 h-full w-full bg-gradient-to-r from-transparent via-cyan-vivid/30 to-transparent transition-all duration-700 group-hover:left-full" />
          </button>
          <p className="mt-3 text-center text-[10px] uppercase tracking-[0.3em] text-ghost/60">
            Transforme qualquer resposta em vídeo · Premium
          </p>
        </div>
      </footer>

      <CinemaMode
        open={cinemaOpen}
        question={transcript}
        answer={answer}
        audioBase64={audioB64}
        onClose={() => setCinemaOpen(false)}
      />

      <MenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onAskText={() => setTextMode(true)}
      />
    </div>
  );
}
