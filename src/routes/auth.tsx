import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Mail, KeyRound, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { derivePassword, isPin } from "@/lib/auth-helpers";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — A VOZ E A VERDADE" },
      {
        name: "description",
        content: "Acede ao oráculo. Identificação por e-mail e PIN de 4 dígitos.",
      },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  function validateEmail(): string | null {
    const trimmed = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      toast.error("Insere um e-mail válido.");
      return null;
    }
    return trimmed;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = validateEmail();
    if (!trimmed) return;
    if (!isPin(pin)) {
      toast.error("PIN deve ter 4 dígitos.");
      return;
    }
    if (mode === "signup" && pin !== confirmPin) {
      toast.error("Os PINs não coincidem.");
      return;
    }

    setBusy(true);
    try {
      const password = derivePassword(trimmed, pin);

      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: trimmed,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) {
          if (/registered|exists/i.test(error.message)) {
            toast.error("Este e-mail já tem conta. Entra com o PIN.");
            setMode("signin");
            return;
          }
          throw error;
        }

        // Garante sessão (caso a config retorne sem sessão)
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          const { error: signInErr } = await supabase.auth.signInWithPassword({
            email: trimmed,
            password,
          });
          if (signInErr) throw signInErr;
        }

        await supabase
          .from("profiles")
          .update({ pin_set: true })
          .eq("email", trimmed);

        toast.success("Bem-vindo à Verdade.");
        navigate({ to: "/", replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmed,
          password,
        });
        if (error) {
          toast.error("E-mail ou PIN incorrectos.");
          return;
        }
        navigate({ to: "/", replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na autenticação.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-obsidian px-6 text-foreground scanlines">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        aria-hidden="true"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 50% 30%, rgba(0,242,255,0.22) 0%, transparent 55%)",
        }}
      />

      <div className="relative z-10 w-full max-w-md fade-up">
        <div className="mb-10 text-center">
          <h1 className="font-display text-2xl font-bold uppercase tracking-tighter">
            A Voz e a <span className="text-cyan-vivid">Verdade</span>
          </h1>
          <p className="mt-2 text-[10px] uppercase tracking-[0.3em] text-ghost">
            Revelando o que o sistema esconde
          </p>
        </div>

        <div className="border border-cyan-vivid/20 bg-obsidian/80 p-7 backdrop-blur-sm">
          <form onSubmit={submit} className="space-y-5">
            <div>
              <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-cyan-vivid/70">
                <KeyRound className="size-3.5" />
                {mode === "signup" ? "Criar conta" : "Entrar"}
              </p>
              <h2 className="mt-2 font-display text-xl font-semibold tracking-tight">
                {mode === "signup" ? "Sela a tua identidade" : "Acede ao oráculo"}
              </h2>
              <p className="mt-1 text-xs text-ghost">
                E-mail e PIN de 4 dígitos. Sem código de confirmação.
              </p>
            </div>

            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ghost" />
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teu@email.com"
                className="w-full border border-cyan-vivid/30 bg-obsidian/60 px-4 py-3 pl-10 text-sm text-foreground placeholder:text-ghost/50 outline-none focus:border-cyan-vivid"
              />
            </div>

            <PinInput value={pin} onChange={setPin} placeholder="PIN" />
            {mode === "signup" && (
              <PinInput
                value={confirmPin}
                onChange={setConfirmPin}
                placeholder="Confirma PIN"
              />
            )}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 border border-cyan-vivid bg-cyan-vivid py-3 text-xs font-bold uppercase tracking-[0.3em] text-obsidian transition-colors hover:bg-white disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : mode === "signup" ? (
                "Criar conta"
              ) : (
                "Entrar"
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode(mode === "signup" ? "signin" : "signup");
                setConfirmPin("");
              }}
              disabled={busy}
              className="block w-full text-center text-[10px] uppercase tracking-[0.3em] text-ghost hover:text-cyan-vivid"
            >
              {mode === "signup"
                ? "Já tenho conta — entrar"
                : "Não tenho conta — criar"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.25em] text-ghost/60">
          © Faustino Job Cossa · Todos os direitos reservados
        </p>
      </div>
    </div>
  );
}

function PinInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="password"
      inputMode="numeric"
      pattern="\d*"
      maxLength={4}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      placeholder={placeholder ?? "••••"}
      className="w-full border border-cyan-vivid/30 bg-obsidian/60 px-4 py-3 text-center font-mono text-2xl tracking-[0.7em] text-foreground placeholder:text-ghost/50 outline-none focus:border-cyan-vivid"
    />
  );
}
