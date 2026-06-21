import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Users, MessageSquare, CreditCard, ArrowLeft, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Painel — A VOZ DA VERDADE" }],
  }),
  component: AdminPage,
});

interface Stats {
  users: number;
  questions: number;
  subscriptions: number;
}

interface RecentRow {
  id: string;
  question: string;
  answer: string;
  created_at: string;
  user_id: string;
}

function AdminPage() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [stats, setStats] = useState<Stats>({ users: 0, questions: 0, subscriptions: 0 });
  const [recent, setRecent] = useState<RecentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        navigate({ to: "/auth", replace: true });
        return;
      }
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", sess.session.user.id);
      const admin = (roles ?? []).some((r) => r.role === "admin");
      if (!mounted) return;
      setIsAdmin(admin);
      setAuthChecked(true);
      if (!admin) return;

      // Stats — only readable by admin via RLS policies
      const [{ count: questions }, { count: subscriptions }, { data: history }] = await Promise.all([
        supabase.from("oracle_history").select("id", { count: "exact", head: true }),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }),
        supabase
          .from("oracle_history")
          .select("id, question, answer, created_at, user_id")
          .order("created_at", { ascending: false })
          .limit(30),
      ]);

      // distinct users from history (proxy)
      const distinct = new Set((history ?? []).map((r) => r.user_id));
      if (!mounted) return;
      setStats({
        users: distinct.size,
        questions: questions ?? 0,
        subscriptions: subscriptions ?? 0,
      });
      setRecent((history ?? []) as RecentRow[]);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  if (!authChecked) {
    return (
      <div className="grid min-h-screen place-items-center bg-obsidian">
        <Loader2 className="size-6 animate-spin text-cyan-vivid" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="grid min-h-screen place-items-center bg-obsidian px-6 text-center">
        <div className="max-w-sm space-y-4">
          <ShieldAlert className="mx-auto size-10 text-cyan-vivid/60" />
          <h1 className="font-display text-xl uppercase tracking-tight">Acesso restrito</h1>
          <p className="text-xs uppercase tracking-[0.3em] text-ghost">
            Esta câmara é apenas para o Pai da Verdade.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 border border-cyan-vivid/30 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-cyan-vivid hover:bg-cyan-vivid hover:text-obsidian"
          >
            <ArrowLeft className="size-3.5" />
            Voltar
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-obsidian px-6 py-10 text-foreground scanlines">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-vivid/60">Painel</p>
            <h1 className="font-display text-2xl uppercase tracking-tight">Câmara do administrador</h1>
            <p className="mt-1 text-xs text-ghost">Visão geral da plataforma.</p>
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-2 border border-cyan-vivid/30 px-3 py-2 text-[10px] uppercase tracking-[0.3em] text-cyan-vivid hover:bg-cyan-vivid hover:text-obsidian"
          >
            <ArrowLeft className="size-3.5" />
            Sair do painel
          </Link>
        </header>

        {loading ? (
          <Loader2 className="size-5 animate-spin text-cyan-vivid" />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard icon={<Users className="size-4" />} label="Utilizadores activos" value={stats.users} />
              <StatCard icon={<MessageSquare className="size-4" />} label="Perguntas totais" value={stats.questions} />
              <StatCard icon={<CreditCard className="size-4" />} label="Subscrições" value={stats.subscriptions} />
            </div>

            <section>
              <h2 className="mb-4 font-display text-sm uppercase tracking-[0.3em] text-cyan-vivid/80">
                Últimas perguntas
              </h2>
              <ul className="space-y-4">
                {recent.length === 0 && (
                  <p className="text-xs uppercase tracking-[0.3em] text-ghost">Sem registos.</p>
                )}
                {recent.map((it) => (
                  <li key={it.id} className="border-l border-cyan-vivid/30 pl-4">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-vivid/60">
                      {new Date(it.created_at).toLocaleString("pt-PT")}
                    </p>
                    <p className="mt-1 font-serif italic text-sm text-ghost">{it.question}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-foreground/90">{it.answer}</p>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="border border-cyan-vivid/20 bg-obsidian/60 p-5">
      <div className="flex items-center gap-2 text-cyan-vivid/70">
        {icon}
        <p className="text-[10px] uppercase tracking-[0.3em]">{label}</p>
      </div>
      <p className="mt-3 font-display text-3xl font-bold">{value.toLocaleString("pt-PT")}</p>
    </div>
  );
}
