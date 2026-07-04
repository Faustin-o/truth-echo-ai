import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Film, ArrowLeft, Clock } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";

const searchSchema = z.object({
  q: z.string().optional(),
  a: z.string().optional(),
  jobId: z.string().optional(),
});

interface QueueRow {
  id: string;
  status: string;
  video_url: string | null;
  error: string | null;
  question: string;
  answer: string;
  created_at: string;
}

export const Route = createFileRoute("/video/premium")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Vídeo Premium — A Voz da Verdade" },
      { name: "description", content: "Vídeo gerado por IA a partir das respostas do Oráculo." },
    ],
  }),
  component: VideoPremiumPage,
});

function VideoPremiumPage() {
  const nav = useNavigate();
  const { t } = useLang();
  const search = useSearch({ from: "/video/premium" });
  const [job, setJob] = useState<QueueRow | null>(null);
  const [enqueueing, setEnqueueing] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  // Auth gate
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) nav({ to: "/auth", replace: true });
    });
  }, [nav]);

  // Load or create job
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (search.jobId) {
        const { data } = await supabase
          .from("video_queue")
          .select("*")
          .eq("id", search.jobId)
          .maybeSingle();
        if (!cancelled && data) setJob(data as QueueRow);
        return;
      }
      if (!search.q || !search.a) return;
      setEnqueueing(true);
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id;
      if (!uid) return;
      const { data, error } = await supabase
        .from("video_queue")
        .insert({
          user_id: uid,
          question: search.q,
          answer: search.a,
          status: "pending",
        })
        .select()
        .single();
      setEnqueueing(false);
      if (error) {
        toast.error("Falha ao criar pedido de vídeo.");
        return;
      }
      if (!cancelled && data) {
        setJob(data as QueueRow);
        nav({ to: "/video/premium", search: { jobId: data.id }, replace: true });
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [search.jobId, search.q, search.a, nav]);

  // 30s client-side timeout window + polling
  useEffect(() => {
    if (!job || job.status === "done" || job.status === "failed") return;
    const timeout = setTimeout(() => setTimedOut(true), 30000);
    const poll = setInterval(async () => {
      const { data } = await supabase
        .from("video_queue")
        .select("*")
        .eq("id", job.id)
        .maybeSingle();
      if (data) setJob(data as QueueRow);
    }, 4000);
    return () => {
      clearTimeout(timeout);
      clearInterval(poll);
    };
  }, [job]);

  return (
    <div className="relative min-h-screen bg-obsidian text-foreground scanlines">
      <header className="fixed top-0 left-0 z-40 flex w-full items-center justify-between bg-gradient-to-b from-obsidian to-transparent p-6">
        <button
          onClick={() => nav({ to: "/" })}
          className="inline-flex items-center gap-2 border border-cyan-vivid/30 px-3 py-2 text-[11px] uppercase tracking-[0.3em] text-cyan-vivid hover:bg-cyan-vivid hover:text-obsidian"
        >
          <ArrowLeft className="size-3.5" /> Oráculo
        </button>
        <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-vivid/60">Vídeo Premium</p>
      </header>

      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-24">
        {enqueueing && (
          <div className="text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-cyan-vivid" />
            <p className="mt-4 text-xs uppercase tracking-[0.3em] text-ghost">A registar pedido...</p>
          </div>
        )}

        {!enqueueing && !job && (
          <div className="text-center">
            <p className="text-sm text-ghost">Nenhum pedido activo.</p>
            <button
              onClick={() => nav({ to: "/" })}
              className="mt-6 border border-cyan-vivid/40 px-5 py-2 text-[11px] uppercase tracking-[0.3em] text-cyan-vivid hover:bg-cyan-vivid hover:text-obsidian"
            >
              Voltar ao oráculo
            </button>
          </div>
        )}

        {job && (
          <div className="w-full space-y-8">
            <div className="border border-cyan-vivid/20 p-6">
              <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-vivid/60">Pergunta</p>
              <p className="mt-2 font-serif italic text-base text-ghost">{job.question}</p>
              <div className="my-4 h-px bg-cyan-vivid/20" />
              <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-vivid/60">Resposta</p>
              <p className="mt-2 line-clamp-6 text-sm text-foreground/90">{job.answer}</p>
            </div>

            {job.status === "done" && job.video_url && (
              <video src={job.video_url} controls className="w-full border border-cyan-vivid/30" />
            )}

            {job.status === "failed" && (
              <div className="border border-destructive/40 p-6 text-center">
                <p className="text-sm text-destructive">{job.error ?? "Falha na geração."}</p>
              </div>
            )}

            {(job.status === "pending" || job.status === "processing") && (
              <div className="border border-cyan-vivid/20 p-8 text-center">
                <Film className="mx-auto size-10 text-cyan-vivid/70" />
                <p className="mt-4 font-display text-lg">
                  {timedOut ? t("videoTimeout") : t("videoProcessing")}
                </p>
                {timedOut ? (
                  <p className="mt-2 flex items-center justify-center gap-2 text-xs uppercase tracking-[0.3em] text-ghost">
                    <Clock className="size-3" /> {t("videoQueued")}
                  </p>
                ) : (
                  <Loader2 className="mx-auto mt-4 size-6 animate-spin text-cyan-vivid" />
                )}
                <p className="mt-6 text-[10px] uppercase tracking-[0.3em] text-cyan-vivid/60">
                  Job #{job.id.slice(0, 8)}
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
