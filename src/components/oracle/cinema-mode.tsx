import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useAppSettings } from "@/lib/app-settings";
import { startAmbience, stopAmbience } from "@/lib/audio-ambience";

interface CinemaModeProps {
  open: boolean;
  question: string;
  answer: string;
  audioBase64: string | null;
  onClose: () => void;
}

export function CinemaMode({ open, question, answer, audioBase64, onClose }: CinemaModeProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const settings = useAppSettings();

  useEffect(() => {
    if (!open) return;
    if (settings.ambienceEnabled) {
      startAmbience(settings.ambienceCategory, settings.ambienceVolume);
    }
    return () => stopAmbience();
  }, [open, settings.ambienceEnabled, settings.ambienceCategory, settings.ambienceVolume]);

  useEffect(() => {
    if (!open) return;
    if (!audioBase64) return;
    const audio = new Audio(`data:audio/mpeg;base64,${audioBase64}`);
    audioRef.current = audio;
    audio.onplay = () => setIsSpeaking(true);
    audio.onended = () => setIsSpeaking(false);
    audio.onpause = () => setIsSpeaking(false);
    audio.play().catch(() => {
      /* autoplay may be blocked — user can hit replay */
    });
    return () => {
      audio.pause();
      audioRef.current = null;
      setIsSpeaking(false);
    };
  }, [open, audioBase64]);

  if (!open) return null;

  const replay = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-obsidian/95 backdrop-blur-2xl scanlines fade-up">
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute right-6 top-6 z-20 grid size-10 place-items-center border border-cyan-vivid/30 text-cyan-vivid/70 transition-colors hover:border-cyan-vivid hover:text-cyan-vivid"
        aria-label="Sair do modo cinema"
      >
        <X className="size-4" />
      </button>

      {/* Glowing orb */}
      <div className="relative flex flex-1 items-center justify-center">
        <div className="absolute size-[420px] rounded-full bg-cyan-vivid/30 orb-glow" />
        <div
          className={`relative z-10 grid size-44 place-items-center rounded-full border bg-obsidian transition-all ${
            isSpeaking
              ? "border-cyan-vivid mic-listen"
              : "border-cyan-vivid/40 mic-breathe"
          }`}
        >
          <div className="size-24 rounded-full bg-gradient-to-tr from-cyan-vivid/40 to-transparent border border-white/20 grid place-items-center">
            <div className="size-4 rounded-full bg-cyan-vivid shadow-[0_0_25px_#00f2ff]" />
          </div>
        </div>

        {/* Reactive rings */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="absolute size-72 rounded-full border border-cyan-vivid/30 wave-delay-1" />
          <div className="absolute size-72 rounded-full border border-cyan-vivid/20 wave-delay-2" />
          <div className="absolute size-72 rounded-full border border-cyan-vivid/10 wave-delay-3" />
        </div>
      </div>

      {/* Transcript */}
      <div className="relative z-10 mx-auto w-full max-w-2xl px-8 pb-12">
        <p className="text-[10px] uppercase tracking-[0.4em] text-cyan-vivid/60">
          Pergunta
        </p>
        <p className="mt-2 font-serif italic text-lg text-ghost">{question}</p>

        <div className="my-6 h-px bg-gradient-to-r from-transparent via-cyan-vivid/30 to-transparent" />

        <p className="text-[10px] uppercase tracking-[0.4em] text-cyan-vivid/60">
          A Verdade responde
        </p>
        <p className="mt-3 max-h-[28vh] overflow-y-auto whitespace-pre-wrap font-display text-base leading-relaxed text-foreground">
          {answer}
        </p>

        {audioBase64 && (
          <button
            onClick={replay}
            className="mt-6 border border-cyan-vivid/40 px-5 py-2 text-[11px] uppercase tracking-[0.3em] text-cyan-vivid transition-colors hover:bg-cyan-vivid hover:text-obsidian"
          >
            Reouvir
          </button>
        )}
      </div>
    </div>
  );
}
