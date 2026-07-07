import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Mail, KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { derivePassword, isPin } from "@/lib/auth-helpers";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — A VOZ DA VERDADE" },
      {
        name: "description",
        content: "Acede ao oráculo. Cadastro com código por e-mail e PIN de 4 dígitos.",
      },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "recover";
type Step = "email" | "code" | "pin" | "login-pin";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signup");
  const [step, setStep] = useState<Step>("email");

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  function normalizedEmail(): string | null {
    const trimmed = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      toast.error("Insere um e-mail válido.");
      return null;
    }
    return trimmed;
  }

  // Step 1 — submit email
  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = normalizedEmail();
    if (!trimmed) return;

    if (mode === "recover") {
      toast.info("Recuperação por e-mail estará disponível em breve. Contacta o suporte.");
      return;
    }

    // signup e signin → PIN directo (sem OTP por enquanto)
    setStep(mode === "signup" ? "pin" : "login-pin");
  }

  // Step 2 — verify OTP code
  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = normalizedEmail();
    if (!trimmed) return;
    if (!/^\d{6}$/.test(code)) {
      toast.error("O código tem 6 dígitos.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: trimmed,
        token: code,
        type: "email",
      });
      if (error) throw error;
      toast.success("E-mail verificado.");
      setStep("pin");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Código inválido ou expirado.");
    } finally {
      setBusy(false);
    }
  }

  // Step 3a — define PIN (signup / recover)
  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = normalizedEmail();
    if (!trimmed) return;
    if (!isPin(pin)) {
      toast.error("PIN deve ter 4 dígitos.");
      return;
    }
    if (pin !== confirmPin) {
      toast.error("Os PINs não coincidem.");
      return;
    }

    setBusy(true);
    try {
      const password = derivePassword(trimmed, pin);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      await supabase.from("profiles").update({ pin_set: true }).eq("email", trimmed);

      toast.success("Bem-vindo à Verdade.");
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao definir PIN.");
    } finally {
      setBusy(false);
    }
  }

  // Step 3b — login with PIN
  async function submitLoginPin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = normalizedEmail();
    if (!trimmed) return;
    if (!isPin(pin)) {
      toast.error("PIN deve ter 4 dígitos.");
      return;
    }

    setBusy(true);
    try {
      const password = derivePassword(trimmed, pin);
      const { error } = await supabase.auth.signInWithPassword({ email: trimmed, password });
      if (error) {
        toast.error("E-mail ou PIN incorrectos.");
        return;
      }
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na autenticação.");
    } finally {
      setBusy(false);
    }
  }

  function resetFlow(nextMode: Mode) {
    setMode(nextMode);
    setStep("email");
    setCode("");
    setPin("");
    setConfirmPin("");
  }

  const titleByStep: Record<Step, string> = {
    email: mode === "signup" ? "Sela a tua identidade" : mode === "recover" ? "Recupera o acesso" : "Acede ao oráculo",
    code: "Verifica o código",
    pin: mode === "recover" ? "Define um novo PIN" : "Cria o teu PIN",
    "login-pin": "Insere o teu PIN",
  };

  const captionByStep: Record<Step, string> = {
    email:
      mode === "signup"
        ? "Vais receber um código de 6 dígitos no e-mail."
        : mode === "recover"
          ? "Enviamos um código para redefinir o PIN."
          : "Entra com o e-mail registado.",
    code: "Insere o código de 6 dígitos enviado para o teu e-mail.",
    pin: "PIN de 4 dígitos. Vais usar para entrar.",
    "login-pin": "PIN de 4 dígitos.",
  };

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
            A Voz da <span className="text-cyan-vivid">Verdade</span>
          </h1>
          <p className="mt-2 text-[10px] uppercase tracking-[0.3em] text-ghost">
            Revelando o que o sistema esconde
          </p>
        </div>

        <div className="border border-cyan-vivid/20 bg-obsidian/80 p-7 backdrop-blur-sm">
          <div className="mb-5">
            <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-cyan-vivid/70">
              {step === "code" ? <ShieldCheck className="size-3.5" /> : <KeyRound className="size-3.5" />}
              {mode === "signup" ? "Criar conta" : mode === "recover" ? "Recuperar conta" : "Entrar"}
            </p>
            <h2 className="mt-2 font-display text-xl font-semibold tracking-tight">
              {titleByStep[step]}
            </h2>
            <p className="mt-1 text-xs text-ghost">{captionByStep[step]}</p>
          </div>

          {/* STEP: EMAIL */}
          {step === "email" && (
            <form onSubmit={submitEmail} className="space-y-5">
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

              <button
                type="submit"
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 border border-cyan-vivid bg-cyan-vivid py-3 text-xs font-bold uppercase tracking-[0.3em] text-obsidian transition-colors hover:bg-white disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Continuar"}
              </button>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => resetFlow(mode === "signup" ? "signin" : "signup")}
                  disabled={busy}
                  className="block w-full text-center text-[10px] uppercase tracking-[0.3em] text-ghost hover:text-cyan-vivid"
                >
                  {mode === "signup" ? "Já tenho conta — entrar" : "Não tenho conta — criar"}
                </button>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => resetFlow("recover")}
                    disabled={busy}
                    className="block w-full text-center text-[10px] uppercase tracking-[0.3em] text-ghost/70 hover:text-cyan-vivid"
                  >
                    Esqueci o PIN — recuperar
                  </button>
                )}
              </div>
            </form>
          )}

          {/* STEP: CODE */}
          {step === "code" && (
            <form onSubmit={submitCode} className="space-y-5">
              <input
                inputMode="numeric"
                pattern="\d*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="••••••"
                className="w-full border border-cyan-vivid/30 bg-obsidian/60 px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] text-foreground placeholder:text-ghost/50 outline-none focus:border-cyan-vivid"
                autoFocus
              />
              <button
                type="submit"
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 border border-cyan-vivid bg-cyan-vivid py-3 text-xs font-bold uppercase tracking-[0.3em] text-obsidian transition-colors hover:bg-white disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Verificar código"}
              </button>
              <button
                type="button"
                onClick={() => resetFlow(mode)}
                disabled={busy}
                className="block w-full text-center text-[10px] uppercase tracking-[0.3em] text-ghost hover:text-cyan-vivid"
              >
                Voltar / reenviar
              </button>
            </form>
          )}

          {/* STEP: PIN (signup / recover) */}
          {step === "pin" && (
            <form onSubmit={submitPin} className="space-y-5">
              <PinInput value={pin} onChange={setPin} placeholder="PIN" />
              <PinInput value={confirmPin} onChange={setConfirmPin} placeholder="Confirma PIN" />
              <button
                type="submit"
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 border border-cyan-vivid bg-cyan-vivid py-3 text-xs font-bold uppercase tracking-[0.3em] text-obsidian transition-colors hover:bg-white disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Confirmar PIN"}
              </button>
            </form>
          )}

          {/* STEP: LOGIN PIN */}
          {step === "login-pin" && (
            <form onSubmit={submitLoginPin} className="space-y-5">
              <PinInput value={pin} onChange={setPin} placeholder="PIN" />
              <button
                type="submit"
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 border border-cyan-vivid bg-cyan-vivid py-3 text-xs font-bold uppercase tracking-[0.3em] text-obsidian transition-colors hover:bg-white disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Entrar"}
              </button>
              <button
                type="button"
                onClick={() => resetFlow("signin")}
                disabled={busy}
                className="block w-full text-center text-[10px] uppercase tracking-[0.3em] text-ghost hover:text-cyan-vivid"
              >
                Trocar de e-mail
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.25em] text-ghost/60">
          © Pai da Verdade · Todos os direitos reservados
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
