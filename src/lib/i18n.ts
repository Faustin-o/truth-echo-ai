import { useSyncExternalStore } from "react";

export type Lang = "pt" | "en" | "fr" | "es" | "ar";

export const LANGS: { id: Lang; label: string; native: string }[] = [
  { id: "pt", label: "Português", native: "Português" },
  { id: "en", label: "English", native: "English" },
  { id: "fr", label: "Français", native: "Français" },
  { id: "es", label: "Español", native: "Español" },
  { id: "ar", label: "العربية", native: "العربية" },
];

const KEY = "voz-verdade-lang-v1";

const STRINGS: Record<Lang, Record<string, string>> = {
  pt: {
    start: "Iniciar Oráculo",
    startHint: "Toca para ativar áudio e microfone",
    audioBlocked: "Ative o áudio para continuar",
    listening: "A receber transmissão...",
    thinking: "A descodificar a verdade...",
    idle: "Pronto para ouvir...",
    answered: "Sintonia restabelecida",
    voiceUnavailable: "Voz indisponível. Escreve a tua pergunta.",
    retry: "A tentar novamente...",
    micError: "Não foi possível gravar. Escreve a tua pergunta.",
    transcribing: "A transcrever...",
    videoProcessing: "Vídeo em processamento",
    videoQueued: "Pedido guardado. Recebes o vídeo quando estiver pronto.",
    videoTimeout: "O vídeo demorou demasiado. Foi enviado para fila.",
    language: "Idioma",
  },
  en: {
    start: "Start Oracle",
    startHint: "Tap to enable audio and microphone",
    audioBlocked: "Enable audio to continue",
    listening: "Receiving transmission...",
    thinking: "Decoding the truth...",
    idle: "Ready to listen...",
    answered: "Signal restored",
    voiceUnavailable: "Voice unavailable. Type your question.",
    retry: "Retrying...",
    micError: "Could not record. Type your question.",
    transcribing: "Transcribing...",
    videoProcessing: "Video processing",
    videoQueued: "Request queued. You'll get the video when ready.",
    videoTimeout: "Video took too long. Queued for later.",
    language: "Language",
  },
  fr: {
    start: "Démarrer l'Oracle",
    startHint: "Touchez pour activer audio et micro",
    audioBlocked: "Activez l'audio pour continuer",
    listening: "Réception...",
    thinking: "Décodage de la vérité...",
    idle: "Prêt à écouter...",
    answered: "Signal rétabli",
    voiceUnavailable: "Voix indisponible. Écrivez votre question.",
    retry: "Nouvelle tentative...",
    micError: "Enregistrement impossible. Écrivez votre question.",
    transcribing: "Transcription...",
    videoProcessing: "Vidéo en traitement",
    videoQueued: "Demande enregistrée. Vidéo à venir.",
    videoTimeout: "Vidéo trop longue. Mise en file.",
    language: "Langue",
  },
  es: {
    start: "Iniciar Oráculo",
    startHint: "Toca para activar audio y micrófono",
    audioBlocked: "Activa el audio para continuar",
    listening: "Recibiendo transmisión...",
    thinking: "Descifrando la verdad...",
    idle: "Listo para escuchar...",
    answered: "Señal restaurada",
    voiceUnavailable: "Voz no disponible. Escribe tu pregunta.",
    retry: "Reintentando...",
    micError: "No se pudo grabar. Escribe tu pregunta.",
    transcribing: "Transcribiendo...",
    videoProcessing: "Video en proceso",
    videoQueued: "Pedido guardado. Recibirás el video.",
    videoTimeout: "Video demoró demasiado. En cola.",
    language: "Idioma",
  },
  ar: {
    start: "ابدأ العرّاف",
    startHint: "المس لتفعيل الصوت والميكروفون",
    audioBlocked: "فعّل الصوت للمتابعة",
    listening: "جارٍ الاستقبال...",
    thinking: "فكّ رموز الحقيقة...",
    idle: "جاهز للاستماع...",
    answered: "تمت الاستعادة",
    voiceUnavailable: "الصوت غير متاح. اكتب سؤالك.",
    retry: "إعادة المحاولة...",
    micError: "تعذّر التسجيل. اكتب سؤالك.",
    transcribing: "جارٍ النسخ...",
    videoProcessing: "الفيديو قيد المعالجة",
    videoQueued: "تم حفظ الطلب.",
    videoTimeout: "استغرق الفيديو وقتًا طويلًا.",
    language: "اللغة",
  },
};

function detect(): Lang {
  if (typeof navigator === "undefined") return "pt";
  const n = (navigator.language || "pt").toLowerCase();
  if (n.startsWith("en")) return "en";
  if (n.startsWith("fr")) return "fr";
  if (n.startsWith("es")) return "es";
  if (n.startsWith("ar")) return "ar";
  return "pt";
}

let current: Lang = "pt";
const listeners = new Set<() => void>();

function load() {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && ["pt", "en", "fr", "es", "ar"].includes(raw)) {
      current = raw as Lang;
    } else {
      current = detect();
    }
  } catch {
    current = detect();
  }
}

export function setLang(l: Lang) {
  current = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* ignore */
  }
  listeners.forEach((cb) => cb());
}

export function getLang(): Lang {
  return current;
}

export function useLang(): { lang: Lang; t: (k: string) => string } {
  const lang = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => "pt" as Lang,
  );
  return {
    lang,
    t: (k: string) => STRINGS[lang]?.[k] ?? STRINGS.pt[k] ?? k,
  };
}

export function sttLocale(l: Lang): string {
  return { pt: "pt-PT", en: "en-US", fr: "fr-FR", es: "es-ES", ar: "ar-SA" }[l];
}

if (typeof window !== "undefined") load();
