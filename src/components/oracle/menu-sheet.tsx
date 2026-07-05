import { useEffect, useRef, useState } from "react";
import {
  X,
  History,
  KeySquare,
  Film,
  ScrollText,
  LogOut,
  Keyboard,
  Palette,
  Settings as SettingsIcon,
  Trash2,
  Share2,
  Play,
  Image as ImageIcon,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate, Link } from "@tanstack/react-router";

import { useAppSettings, setSettings, type ThemeId, type AmbienceCategory } from "@/lib/app-settings";
import { startAmbience, stopAmbience, setAmbienceVolume } from "@/lib/audio-ambience";

interface MenuSheetProps {
  open: boolean;
  onClose: () => void;
  onAskText: () => void;
}

interface HistoryRow {
  id: string;
  question: string;
  answer: string;
  created_at: string;
}

type Section = "text" | "history" | "themes" | "settings" | "legal";

export function MenuSheet({ open, onClose, onAskText }: MenuSheetProps) {
  const [section, setSection] = useState<Section>("history");
  const [items, setItems] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();
  const settings = useAppSettings();

  useEffect(() => {
    if (!open) return;
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id;
      if (!uid) return;
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .eq("role", "admin")
        .maybeSingle()
        .then(({ data: r }) => setIsAdmin(Boolean(r)));
    });
  }, [open]);

  useEffect(() => {
    if (!open || section !== "history") return;
    setLoading(true);
    supabase
      .from("oracle_history")
      .select("id, question, answer, created_at")
      .order("created_at", { ascending: false })
      .limit(80)
      .then(({ data, error }) => {
        if (error) console.error(error);
        else if (data) setItems(data as HistoryRow[]);
        setLoading(false);
      });
  }, [open, section]);

  async function signOut() {
    await supabase.auth.signOut();
    stopAmbience();
    toast.success("Sessão terminada.");
    navigate({ to: "/auth", replace: true });
  }

  async function deleteItem(id: string) {
    const prev = items;
    setItems((cur) => cur.filter((i) => i.id !== id));
    const { error } = await supabase.from("oracle_history").delete().eq("id", id);
    if (error) {
      toast.error("Não foi possível eliminar.");
      setItems(prev);
    }
  }

  async function shareItem(it: HistoryRow) {
    const text = `${it.question}\n\n${it.answer}\n\n— A Voz da Verdade`;
    try {
      if (navigator.share) await navigator.share({ text, title: "A Voz da Verdade" });
      else {
        await navigator.clipboard.writeText(text);
        toast.success("Copiado para a área de transferência.");
      }
    } catch {
      /* user cancelled */
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex" onClick={onClose}>
      <div className="flex-1 bg-obsidian/70 backdrop-blur-sm" />
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col border-l border-cyan-vivid/20 bg-obsidian fade-up"
      >
        <header className="flex items-center justify-between border-b border-white/5 p-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-vivid/60">Arquivo</p>
            <h2 className="mt-1 font-display text-lg font-semibold tracking-tight">
              Câmara secreta
            </h2>
          </div>
          <button
            onClick={onClose}
            className="grid size-9 place-items-center border border-cyan-vivid/30 text-cyan-vivid/70 hover:text-cyan-vivid"
            aria-label="Fechar"
          >
            <X className="size-4" />
          </button>
        </header>

        <nav className="grid grid-cols-5 border-b border-white/5">
          <NavBtn
            active={section === "text"}
            onClick={() => {
              onAskText();
              onClose();
            }}
            icon={<Keyboard className="size-3.5" />}
            label="Texto"
          />
          <NavBtn
            active={section === "history"}
            onClick={() => setSection("history")}
            icon={<History className="size-3.5" />}
            label="Histórico"
          />
          <NavBtn
            active={section === "themes"}
            onClick={() => setSection("themes")}
            icon={<Palette className="size-3.5" />}
            label="Temas"
          />
          <NavBtn
            active={section === "settings"}
            onClick={() => setSection("settings")}
            icon={<SettingsIcon className="size-3.5" />}
            label="Config"
          />
          <NavBtn
            active={section === "legal"}
            onClick={() => setSection("legal")}
            icon={<ScrollText className="size-3.5" />}
            label="Legal"
          />
        </nav>

        <div className="flex-1 overflow-y-auto p-6">
          {section === "history" && (
            <HistoryList
              loading={loading}
              items={items}
              onDelete={deleteItem}
              onShare={shareItem}
            />
          )}
          {section === "themes" && <ThemesPanel />}
          {section === "settings" && <SettingsPanel />}
          {section === "legal" && <LegalPanel />}
          {section === "text" && (
            <p className="text-xs uppercase tracking-[0.3em] text-ghost">A abrir entrada de texto…</p>
          )}
        </div>

        <footer className="space-y-3 border-t border-white/5 p-6">
          {isAdmin && (
            <Link
              to="/admin"
              onClick={onClose}
              className="flex w-full items-center justify-center gap-2 border border-cyan-vivid/30 py-3 text-[11px] uppercase tracking-[0.3em] text-cyan-vivid transition-colors hover:bg-cyan-vivid hover:text-obsidian"
            >
              <ShieldCheck className="size-3.5" />
              Painel administrativo
            </Link>
          )}
          <button
            onClick={signOut}
            className="flex w-full items-center justify-center gap-2 border border-white/10 py-3 text-[11px] uppercase tracking-[0.3em] text-ghost transition-colors hover:border-destructive hover:text-destructive"
          >
            <LogOut className="size-3.5" />
            Terminar sessão
          </button>
        </footer>
      </aside>
    </div>
  );
}

function NavBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 py-3 text-[9px] uppercase tracking-[0.2em] transition-colors ${
        active
          ? "border-b-2 border-cyan-vivid text-cyan-vivid"
          : "text-ghost hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function HistoryList({
  loading,
  items,
  onDelete,
  onShare,
}: {
  loading: boolean;
  items: HistoryRow[];
  onDelete: (id: string) => void;
  onShare: (it: HistoryRow) => void;
}) {
  if (loading) return <p className="text-xs uppercase tracking-[0.3em] text-ghost">A descodificar…</p>;
  if (items.length === 0)
    return (
      <p className="text-xs uppercase tracking-[0.3em] text-ghost">
        Sem registos. Faz a primeira pergunta.
      </p>
    );
  return (
    <ul className="space-y-5">
      {items.map((it) => (
        <li key={it.id} className="border-l border-cyan-vivid/30 pl-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-vivid/60">
            {new Date(it.created_at).toLocaleString("pt-PT")}
          </p>
          <p className="mt-2 font-serif italic text-base text-ghost">{it.question}</p>
          <p className="mt-2 line-clamp-4 text-sm text-foreground/90">{it.answer}</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => onShare(it)}
              className="inline-flex items-center gap-1.5 border border-cyan-vivid/30 px-2.5 py-1 text-[9px] uppercase tracking-[0.2em] text-cyan-vivid hover:bg-cyan-vivid hover:text-obsidian"
            >
              <Share2 className="size-3" />
              Partilhar
            </button>
            <button
              onClick={() => onDelete(it.id)}
              className="inline-flex items-center gap-1.5 border border-white/10 px-2.5 py-1 text-[9px] uppercase tracking-[0.2em] text-ghost hover:border-destructive hover:text-destructive"
            >
              <Trash2 className="size-3" />
              Eliminar
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ThemesPanel() {
  const s = useAppSettings();
  const fileRef = useRef<HTMLInputElement>(null);

  const themes: { id: ThemeId; label: string; sub: string; swatch: string[] }[] = [
    { id: "oraculo", label: "Oráculo", sub: "Preto + Ciano", swatch: ["#000000", "#121212", "#00FFFF"] },
    { id: "branco", label: "Branco Elegante", sub: "Branco + Ciano Neon", swatch: ["#FFFFFF", "#5E6A73", "#00FFFF"] },
    { id: "custom", label: "Personalizado", sub: "Cor / imagem própria", swatch: ["#050506", "#00FFFF", "#FFFFFF"] },
  ];

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) {
      toast.error("Imagem demasiado grande (máx 4MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSettings({ customImage: String(reader.result), theme: "custom" });
    };
    reader.readAsDataURL(f);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-vivid/60">Aparência</p>
        <h3 className="mt-1 font-display text-lg font-semibold">Escolhe o teu tema</h3>
      </div>

      <div className="space-y-2">
        {themes.map((t) => (
          <button
            key={t.id}
            onClick={() => setSettings({ theme: t.id })}
            className={`flex w-full items-center gap-4 border px-4 py-3 text-left transition-colors ${
              s.theme === t.id
                ? "border-cyan-vivid bg-cyan-vivid/5"
                : "border-white/10 hover:border-cyan-vivid/40"
            }`}
          >
            <div className="flex gap-1">
              {t.swatch.map((c) => (
                <span key={c} className="size-5 border border-white/20" style={{ background: c }} />
              ))}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{t.label}</p>
              <p className="text-[10px] uppercase tracking-[0.25em] text-ghost">{t.sub}</p>
            </div>
            {s.theme === t.id && (
              <span className="text-[9px] uppercase tracking-[0.3em] text-cyan-vivid">Activo</span>
            )}
          </button>
        ))}
      </div>

      {s.theme === "custom" && (
        <div className="space-y-4 border border-cyan-vivid/20 p-4">
          <div className="flex items-center gap-3">
            <label className="text-[10px] uppercase tracking-[0.25em] text-ghost">Cor de fundo</label>
            <input
              type="color"
              value={s.customColor}
              onChange={(e) => setSettings({ customColor: e.target.value })}
              className="h-8 w-14 cursor-pointer border border-white/10 bg-transparent"
            />
          </div>

          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickImage}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 border border-cyan-vivid/30 px-3 py-2 text-[10px] uppercase tracking-[0.25em] text-cyan-vivid hover:bg-cyan-vivid hover:text-obsidian"
            >
              <ImageIcon className="size-3.5" />
              Carregar imagem
            </button>
            {s.customImage && (
              <button
                onClick={() => setSettings({ customImage: null })}
                className="ml-2 inline-flex items-center gap-2 border border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.25em] text-ghost hover:text-destructive"
              >
                <RotateCcw className="size-3.5" />
                Remover
              </button>
            )}
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-[0.25em] text-ghost">
              Opacidade da imagem · {Math.round(s.customOpacity * 100)}%
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={s.customOpacity}
              onChange={(e) => setSettings({ customOpacity: parseFloat(e.target.value) })}
              className="mt-1 w-full accent-cyan-vivid"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsPanel() {
  const s = useAppSettings();

  const cats: { id: AmbienceCategory; label: string }[] = [
    { id: "mistery", label: "Mistério" },
    { id: "philosophy", label: "Filosofia" },
    { id: "tech", label: "Tecnologia" },
    { id: "universe", label: "Universo" },
    { id: "history", label: "História" },
    { id: "motivation", label: "Motivação" },
    { id: "nature", label: "Natureza" },
  ];

  function preview() {
    if (!s.ambienceEnabled) {
      toast("Activa primeiro a música ambiente.");
      return;
    }
    startAmbience(s.ambienceCategory, s.ambienceVolume);
    toast("A reproduzir prévia. Volta a tocar para parar.");
    setTimeout(() => stopAmbience(), 6000);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-vivid/60">Configurações</p>
        <h3 className="mt-1 font-display text-lg font-semibold">Ajusta a experiência</h3>
      </div>

      <Toggle
        label="Voz da Verdade"
        sub="Narração em áudio das respostas"
        checked={s.voiceEnabled}
        onChange={(v) => setSettings({ voiceEnabled: v })}
      />

      <Toggle
        label="Música ambiente"
        sub="Fundo sonoro durante o modo cinema"
        checked={s.ambienceEnabled}
        onChange={(v) => {
          setSettings({ ambienceEnabled: v });
          if (!v) stopAmbience();
        }}
      />

      <Toggle
        label="Notificações"
        sub="Avisos do oráculo (em breve)"
        checked={s.notificationsEnabled}
        onChange={(v) => setSettings({ notificationsEnabled: v })}
      />

      <div className="space-y-3">
        <p className="text-[10px] uppercase tracking-[0.25em] text-ghost">Categoria sonora</p>
        <div className="flex flex-wrap gap-2">
          {cats.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setSettings({ ambienceCategory: c.id });
                if (s.ambienceEnabled) startAmbience(c.id, s.ambienceVolume);
              }}
              className={`border px-3 py-1.5 text-[10px] uppercase tracking-[0.25em] transition-colors ${
                s.ambienceCategory === c.id
                  ? "border-cyan-vivid bg-cyan-vivid/10 text-cyan-vivid"
                  : "border-white/10 text-ghost hover:border-cyan-vivid/40"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-[0.25em] text-ghost">
          Volume · {Math.round(s.ambienceVolume * 100)}%
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={s.ambienceVolume}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            setSettings({ ambienceVolume: v });
            setAmbienceVolume(v);
          }}
          className="mt-1 w-full accent-cyan-vivid"
        />
      </div>

      <button
        onClick={preview}
        className="inline-flex items-center gap-2 border border-cyan-vivid/30 px-3 py-2 text-[10px] uppercase tracking-[0.25em] text-cyan-vivid hover:bg-cyan-vivid hover:text-obsidian"
      >
        <Play className="size-3.5" />
        Pré-visualizar 6s
      </button>

      <p className="border-t border-white/5 pt-4 text-[10px] uppercase tracking-[0.25em] text-ghost">
        Idioma · detectado automaticamente (PT, EN, FR, ES, AR)
      </p>
    </div>
  );
}

function Toggle({
  label,
  sub,
  checked,
  onChange,
}: {
  label: string;
  sub?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between border border-white/5 px-4 py-3 text-left hover:border-cyan-vivid/30"
    >
      <div>
        <p className="text-sm font-medium">{label}</p>
        {sub && <p className="text-[10px] uppercase tracking-[0.25em] text-ghost">{sub}</p>}
      </div>
      <span
        className={`relative inline-block h-5 w-9 border transition-colors ${
          checked ? "border-cyan-vivid bg-cyan-vivid/20" : "border-white/20 bg-white/5"
        }`}
      >
        <span
          className={`absolute top-0.5 size-3.5 transition-transform ${
            checked ? "translate-x-[18px] bg-cyan-vivid" : "translate-x-0.5 bg-ghost"
          }`}
        />
      </span>
    </button>
  );
}

function LegalPanel() {
  return (
    <div className="space-y-4 text-sm text-ghost">
      <div>
        <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-vivid/60">Informações Legais</p>
        <h3 className="mt-1 font-display text-lg font-semibold text-foreground">A VOZ DA VERDADE</h3>
        <p className="mt-1 font-serif italic text-xs text-ghost">
          "A verdade nasce da investigação."
        </p>
      </div>

      <ul className="space-y-2 pt-2 text-xs uppercase tracking-[0.2em]">
        <li className="flex items-center gap-3">
          <KeySquare className="size-3.5 text-cyan-vivid" />
          Autor: FJC
        </li>
        <li className="flex items-center gap-3">
          <ScrollText className="size-3.5 text-cyan-vivid" />
          País: Moçambique
        </li>
        <li className="flex items-center gap-3">
          <Film className="size-3.5 text-cyan-vivid" />
          Versão 1.0.0
        </li>
      </ul>

      <div className="space-y-3 border-t border-white/5 pt-4 text-xs leading-relaxed text-ghost">
        <p>
          <span className="font-semibold text-foreground">© Direitos Reservados.</span> 2024 — Todos
          os direitos reservados. Todo o conteúdo, marca e identidade visual são propriedade do autor.
        </p>
        <p>
          <span className="font-semibold text-foreground">Política de Privacidade.</span> Guardamos
          apenas o e-mail e o histórico de perguntas/respostas para servir o utilizador. Não
          vendemos dados. O histórico pode ser eliminado a qualquer momento.
        </p>
        <p>
          <span className="font-semibold text-foreground">Termos de Utilização.</span> A VOZ DA
          VERDADE fornece análise investigativa, distinguindo factos de hipóteses e interpretações.
          Não substitui aconselhamento médico, legal ou financeiro. Utilize o pensamento crítico.
        </p>
      </div>
    </div>
  );
}
