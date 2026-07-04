import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Mic, Menu, Film, Keyboard, Loader2, Power } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { askOracle } from "@/lib/oracle.functions";
import { transcribeAudio } from "@/lib/transcribe.functions";
import { SoundWaves } from "@/components/oracle/sound-waves";
import { CinemaMode } from "@/components/oracle/cinema-mode";
import { MenuSheet } from "@/components/oracle/menu-sheet";
import { useAppSettings } from "@/lib/app-settings";
import { startAmbience } from "@/lib/audio-ambience";
import { useLang, sttLocale, setLang, LANGS, type Lang } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "A VOZ E A VERDADE — Oráculo" },
      {
        name: "description",
        content:
          "Pergunta com a voz. A Verdade responde — sem clichés, sem censura. Modo cinema imersivo com narração grave.",
      },
    ],
  }),
  component: OraclePage,
});

type Status = "idle" | "listening" | "recording" | "transcribing" | "thinking" | "answered";

function OraclePage() {
  const navigate = useNavigate();
  const ask = useServerFn(askOracle);
  const transcribe = useServerFn(transcribeAudio);
  const settings = useAppSettings();
  const { lang, t } = useLang();

  const [authChecked, setAuthChecked] = useState(false);
  const [unlocked, setUnlocked] = useState(false); // audio unlock gate
  const [status, setStatus] = useState<Status>("idle");
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");
  const [audioB64, setAudioB64] = useState<string | null>(null);
  const [cinemaOpen, setCinemaOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [textMode, setTextMode] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  const recognitionRef = useRef<unknown>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sttSupportedRef = useRef<boolean>(false);
  const lastAudioBlobRef = useRef<Blob | null>(null); // preserve audio to survive retries

  // Auth gate
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (!data.session) navigate({ to: "/auth", replace: true });
      else setAuthChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
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
    const w = window as unknown as {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };
    sttSupportedRef.current = Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  }, []);

  function unlockAudio() {
    setUnlocked(true);
    // silent audio play to unlock autoplay policy
    try {
      const a = new Audio(
        "data:audio/mpeg;base64,SUQzAwAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//uQwAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAAABAAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgAAAAA5MQVZDNTguMTMuMTAwAAAAAAAAAAAAAAAA//uQwAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAA=",
      );
      a.volume = 0;
      a.play().catch(() => {});
    } catch {
      /* ignore */
    }
    if (settings.ambienceEnabled) {
      startAmbience(settings.ambienceCategory, settings.ambienceVolume);
    }
  }

  async function callWithRetry(question: string, retries = 2): Promise<void> {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await ask({ data: { question, speak: settings.voiceEnabled, language: lang } });
        setAnswer(res.answer);
        setAudioB64(res.audioBase64);
        setStatus("answered");
        setCinemaOpen(true);
        lastAudioBlobRef.current = null;
        return;
      } catch (err) {
        lastErr = err;
        if (attempt < retries) {
          toast(t("retry"));
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
      }
    }
    const msg = lastErr instanceof Error ? lastErr.message : "Falha ao consultar.";
    toast.error(msg);
    setStatus("idle");
  }

  async function submitQuestion(question: string) {
    if (!question.trim()) return;
    setStatus("thinking");
    setTranscript(question);
    await callWithRetry(question);
  }

  // ---------- Voice pipeline: Web Speech → MediaRecorder → manual text ----------

  async function startMediaRecorderFallback() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported?.(m)) ?? "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecRef.current = rec;
      chunksRef.current = [];

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        mediaStreamRef.current = null;
        const type = rec.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        lastAudioBlobRef.current = blob;
        if (blob.size < 1024) {
          toast.error(t("micError"));
          setStatus("idle");
          setTextMode(true);
          return;
        }
        setStatus("transcribing");
        try {
          const b64 = await blobToBase64(blob);
          const res = await transcribe({
            data: { audioBase64: b64, mimeType: type, language: lang },
          });
          if (!res.text) throw new Error("Sem texto");
          await submitQuestion(res.text);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Falha na transcrição.";
          toast.error(msg);
          setStatus("idle");
          setTextMode(true); // graceful degradation to manual text
        }
      };
      rec.start();
      setStatus("recording");
    } catch {
      toast.error(t("micError"));
      setTextMode(true);
      setStatus("idle");
    }
  }

  function stopMediaRecorder() {
    const rec = mediaRecRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }

  function handleMicTap() {
    if (!unlocked) {
      unlockAudio();
      return;
    }
    if (status === "thinking" || status === "transcribing") return;

    // stop actions
    if (status === "listening") {
      const rec = recognitionRef.current as { stop?: () => void } | null;
      rec?.stop?.();
      return;
    }
    if (status === "recording") {
      stopMediaRecorder();
      return;
    }

    // 1st attempt: Web Speech
    if (sttSupportedRef.current) {
      startWebSpeech();
      return;
    }
    // 2nd attempt: MediaRecorder
    if (typeof MediaRecorder !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      void startMediaRecorderFallback();
      return;
    }
    // 3rd: manual text
    toast(t("voiceUnavailable"));
    setTextMode(true);
  }

  function startWebSpeech() {
    type SR = {
      lang: string;
      interimResults: boolean;
      continuous: boolean;
      onresult: (e: { results: ArrayLike<{ 0: { transcript: string } }> }) => void;
      onerror: (e: { error: string }) => void;
      onend: () => void;
      start: () => void;
      stop: () => void;
    };
    const w = window as unknown as {
      SpeechRecognition?: new () => SR;
      webkitSpeechRecognition?: new () => SR;
    };
    const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as new () => SR;
    const rec = new Ctor();
    rec.lang = sttLocale(lang);
    rec.interimResults = false;
    rec.continuous = false;

    let finalText = "";
    let failed = false;
    rec.onresult = (e) => {
      const r = e.results[0];
      if (r) finalText = r[0].transcript;
    };
    rec.onerror = (e) => {
      if (e.error !== "aborted") {
        failed = true;
      }
    };
    rec.onend = () => {
      if (finalText.trim()) {
        void submitQuestion(finalText.trim());
        return;
      }
      if (failed) {
        // graceful fallback to MediaRecorder
        void startMediaRecorderFallback();
        return;
      }
      setStatus("idle");
    };

    recognitionRef.current = rec;
    setStatus("listening");
    setTranscript("");
    try {
      rec.start();
    } catch {
      void startMediaRecorderFallback();
    }
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
    idle: t("idle"),
    listening: t("listening"),
    recording: t("listening"),
    transcribing: t("transcribing"),
    thinking: t("thinking"),
    answered: t("answered"),
  };

  const subStatus: Record<Status, string> = {
    idle: "Sintonia estabelecida",
    listening: "Microfone aberto",
    recording: "Gravação (fallback)",
    transcribing: "Whisper",
    thinking: "Canal seguro",
    answered: "Pergunta de novo",
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-obsidian text-foreground select-none scanlines">
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
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setLangMenuOpen((v) => !v)}
              className="border border-cyan-vivid/20 px-2.5 py-2 text-[10px] uppercase tracking-[0.25em] text-cyan-vivid/80 hover:border-cyan-vivid hover:text-cyan-vivid"
              aria-label={t("language")}
            >
              {lang.toUpperCase()}
            </button>
            {langMenuOpen && (
              <div className="absolute right-0 top-full mt-2 z-50 min-w-[9rem] border border-cyan-vivid/30 bg-obsidian">
                {LANGS.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => {
                      setLang(l.id as Lang);
                      setLangMenuOpen(false);
                    }}
                    className={`block w-full px-3 py-2 text-left text-[11px] uppercase tracking-[0.2em] hover:bg-cyan-vivid/10 ${
                      lang === l.id ? "text-cyan-vivid" : "text-ghost"
                    }`}
                  >
                    {l.native}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setMenuOpen(true)}
            className="grid size-10 place-items-center border border-cyan-vivid/20 text-cyan-vivid/70 hover:border-cyan-vivid hover:text-cyan-vivid"
            aria-label="Abrir menu"
          >
            <Menu className="size-4" />
          </button>
        </div>
      </header>

      {/* MAIN */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pt-24 pb-44">
        <div className="mb-12 text-center">
          <p className="text-[10px] uppercase tracking-[0.4em] text-cyan-vivid/60">
            {subStatus[status]}
          </p>
          <h2 className="mt-2 font-display text-2xl font-light uppercase tracking-[0.18em] text-foreground/90">
            {unlocked ? statusLabel[status] : t("startHint")}
          </h2>
        </div>

        <div className="relative grid place-items-center size-64">
          <SoundWaves active={status === "listening" || status === "recording"} />

          <button
            onClick={handleMicTap}
            disabled={status === "thinking" || status === "transcribing"}
            className={`relative z-20 grid size-40 place-items-center rounded-full bg-obsidian transition-all border ${
              status === "listening" || status === "recording"
                ? "border-cyan-vivid mic-listen"
                : status === "thinking" || status === "transcribing"
                  ? "border-cyan-vivid/60"
                  : "border-cyan-vivid/50 mic-breathe"
            } shadow-[inset_0_0_30px_rgba(0,242,255,0.1)] active:scale-95`}
            aria-label={unlocked ? "Falar com a Verdade" : t("start")}
          >
            <div className="grid size-24 place-items-center rounded-full bg-gradient-to-tr from-cyan-vivid/20 to-transparent border border-white/10">
              {!unlocked ? (
                <Power className="size-7 text-cyan-vivid" />
              ) : status === "thinking" || status === "transcribing" ? (
                <Loader2 className="size-7 animate-spin text-cyan-vivid" />
              ) : (
                <Mic
                  className={`size-7 ${
                    status === "listening" || status === "recording"
                      ? "text-cyan-vivid"
                      : "text-cyan-vivid/80"
                  }`}
                />
              )}
            </div>
          </button>
        </div>

        {!unlocked && (
          <p className="mt-8 text-center text-xs uppercase tracking-[0.35em] text-cyan-vivid animate-pulse">
            {t("start")}
          </p>
        )}

        {unlocked && transcript && (
          <p className="mt-12 max-w-md text-center font-serif italic text-base text-ghost fade-up">
            "{transcript}"
          </p>
        )}

        {unlocked && !transcript && (
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

        {unlocked && !textMode && status === "idle" && (
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
                navigate({
                  to: "/video/premium",
                  search: { q: transcript, a: answer },
                });
              } else {
                toast(t("videoQueued"));
              }
            }}
            className="group relative flex w-full items-center justify-center gap-3 overflow-hidden border border-cyan-vivid/30 bg-white py-4 text-xs font-bold uppercase tracking-[0.25em] text-obsidian transition-transform active:scale-[0.98]"
          >
            <Film className="relative z-10 size-4" />
            <span className="relative z-10">
              {answer ? "Gerar vídeo premium" : "Ver resposta em vídeo"}
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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
