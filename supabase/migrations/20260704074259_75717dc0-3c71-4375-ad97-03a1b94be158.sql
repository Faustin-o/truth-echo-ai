CREATE TABLE public.video_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  language text DEFAULT 'pt',
  status text NOT NULL DEFAULT 'pending',
  video_url text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_queue TO authenticated;
GRANT ALL ON public.video_queue TO service_role;
ALTER TABLE public.video_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own video jobs" ON public.video_queue FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins read all video jobs" ON public.video_queue FOR SELECT
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));