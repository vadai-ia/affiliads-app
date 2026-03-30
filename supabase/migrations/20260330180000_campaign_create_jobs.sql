-- Cola durable para creación en Meta + estado `queued` antes de `activating`

ALTER TABLE public.campaign_activations DROP CONSTRAINT IF EXISTS campaign_activations_status_check;
ALTER TABLE public.campaign_activations ADD CONSTRAINT campaign_activations_status_check CHECK (status IN (
  'pending_payment',
  'pending_approval',
  'queued',
  'rejected',
  'activating',
  'active',
  'paused',
  'completed',
  'failed'
));

CREATE TABLE public.campaign_create_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  activation_id uuid NOT NULL REFERENCES public.campaign_activations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'dispatched',
    'running',
    'succeeded',
    'failed'
  )),
  attempt_count int NOT NULL DEFAULT 0,
  dispatch_count int NOT NULL DEFAULT 0,
  last_error jsonb,
  last_dispatched_at timestamptz,
  locked_at timestamptz,
  locked_by text,
  current_step text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (activation_id)
);

CREATE INDEX idx_campaign_create_jobs_org_status ON public.campaign_create_jobs(org_id, status);
CREATE INDEX idx_campaign_create_jobs_pending_dispatch ON public.campaign_create_jobs(status, last_dispatched_at)
  WHERE status IN ('pending', 'dispatched');

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.campaign_create_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.campaign_create_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leaders read org campaign create jobs" ON public.campaign_create_jobs
  FOR SELECT USING (org_id = public.user_org_id() AND public.user_role() = 'leader');

-- Backfill: activaciones colgadas en activating sin Meta → cola + estado queued
INSERT INTO public.campaign_create_jobs (org_id, activation_id, status, attempt_count, dispatch_count, created_at, updated_at)
SELECT org_id, id, 'pending', 0, 0, now(), now()
FROM public.campaign_activations
WHERE status = 'activating' AND meta_campaign_id IS NULL
ON CONFLICT (activation_id) DO NOTHING;

UPDATE public.campaign_activations
SET status = 'queued', updated_at = now()
WHERE status = 'activating' AND meta_campaign_id IS NULL;
