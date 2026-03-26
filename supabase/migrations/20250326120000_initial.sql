-- AfiliAds initial schema (from DEVELOPMENT_PLAN)

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  base_domain text NOT NULL,
  currency text NOT NULL DEFAULT 'MXN' CHECK (currency IN ('MXN', 'USD', 'COP', 'ARS')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.bank_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE NOT NULL,
  bank_name text NOT NULL,
  account_holder text NOT NULL,
  account_number text NOT NULL,
  clabe text,
  instructions text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL CHECK (role IN ('leader', 'affiliate')),
  full_name text,
  email text NOT NULL,
  subdomain text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, email)
);

CREATE TABLE public.invitation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  email text NOT NULL,
  subdomain text NOT NULL,
  token text UNIQUE NOT NULL,
  invited_by uuid REFERENCES public.users(id) NOT NULL,
  used_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz DEFAULT now(),
  UNIQUE(org_id, email)
);

CREATE TABLE public.meta_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE NOT NULL,
  access_token_encrypted text NOT NULL,
  ad_account_id text NOT NULL,
  page_id text NOT NULL,
  ig_account_id text,
  business_id text,
  token_type text DEFAULT 'system_user' CHECK (token_type IN ('system_user', 'user')),
  token_expires_at timestamptz,
  encryption_key_version int DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.campaign_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  campaign_objective text NOT NULL DEFAULT 'OUTCOME_LEADS',
  copy_base text NOT NULL,
  min_budget decimal(10,2) NOT NULL,
  max_budget decimal(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CHECK (min_budget > 0),
  CHECK (max_budget >= min_budget)
);

CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES public.campaign_templates(id) ON DELETE CASCADE NOT NULL,
  file_url text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('image', 'video')),
  original_name text,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.allowed_geos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES public.campaign_templates(id) ON DELETE CASCADE NOT NULL,
  label text NOT NULL,
  country_code text NOT NULL DEFAULT 'MX',
  region text,
  city text,
  radius_km int,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.campaign_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  template_id uuid REFERENCES public.campaign_templates(id) NOT NULL,
  affiliate_id uuid REFERENCES public.users(id) NOT NULL,
  budget decimal(10,2) NOT NULL,
  selected_geo_id uuid REFERENCES public.allowed_geos(id) NOT NULL,
  landing_url text NOT NULL,
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  status text NOT NULL DEFAULT 'pending_payment' CHECK (status IN (
    'pending_payment',
    'pending_approval',
    'rejected',
    'activating',
    'active',
    'paused',
    'completed',
    'failed'
  )),
  rejection_reason text,
  meta_error jsonb,
  activated_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activation_id uuid REFERENCES public.campaign_activations(id) ON DELETE CASCADE UNIQUE NOT NULL,
  proof_url text NOT NULL,
  amount decimal(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason text,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.campaign_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activation_id uuid REFERENCES public.campaign_activations(id) ON DELETE CASCADE NOT NULL,
  spend decimal(10,2) DEFAULT 0,
  impressions int DEFAULT 0,
  clicks int DEFAULT 0,
  leads int DEFAULT 0,
  cpl decimal(10,2) DEFAULT 0,
  date date NOT NULL DEFAULT CURRENT_DATE,
  synced_at timestamptz DEFAULT now(),
  UNIQUE(activation_id, date)
);

CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.users(id),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  read boolean DEFAULT false,
  entity_type text,
  entity_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_users_org_id ON public.users(org_id);
CREATE INDEX idx_users_org_role ON public.users(org_id, role);
CREATE INDEX idx_invitation_tokens_token ON public.invitation_tokens(token) WHERE used_at IS NULL;
CREATE INDEX idx_invitation_tokens_org ON public.invitation_tokens(org_id);
CREATE INDEX idx_campaign_templates_org_status ON public.campaign_templates(org_id, status);
CREATE INDEX idx_campaign_activations_org_status ON public.campaign_activations(org_id, status);
CREATE INDEX idx_campaign_activations_template ON public.campaign_activations(template_id);
CREATE INDEX idx_campaign_activations_affiliate ON public.campaign_activations(affiliate_id);
CREATE INDEX idx_campaign_activations_active ON public.campaign_activations(status) WHERE status = 'active';
CREATE INDEX idx_payments_activation ON public.payments(activation_id);
CREATE INDEX idx_payments_status ON public.payments(status);
CREATE INDEX idx_campaign_metrics_activation_date ON public.campaign_metrics(activation_id, date DESC);
CREATE INDEX idx_assets_template ON public.assets(template_id);
CREATE INDEX idx_allowed_geos_template ON public.allowed_geos(template_id);
CREATE INDEX idx_activity_log_org ON public.activity_log(org_id, created_at DESC);
CREATE INDEX idx_activity_log_entity ON public.activity_log(entity_type, entity_id);
CREATE INDEX idx_notifications_user_read ON public.notifications(user_id, read, created_at DESC);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.bank_details FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.meta_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.campaign_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.campaign_activations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allowed_geos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitation_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org" ON public.organizations
  FOR SELECT USING (id = public.user_org_id());

CREATE POLICY "Leaders see all org users" ON public.users
  FOR SELECT USING (org_id = public.user_org_id() AND public.user_role() = 'leader');
CREATE POLICY "Affiliates see themselves" ON public.users
  FOR SELECT USING (id = auth.uid());
CREATE POLICY "Leaders can update org users" ON public.users
  FOR UPDATE USING (org_id = public.user_org_id() AND public.user_role() = 'leader');

CREATE POLICY "Org members can view bank details" ON public.bank_details
  FOR SELECT USING (org_id = public.user_org_id());
CREATE POLICY "Leaders can manage bank details" ON public.bank_details
  FOR ALL USING (org_id = public.user_org_id() AND public.user_role() = 'leader');

CREATE POLICY "Leaders see all org templates" ON public.campaign_templates
  FOR SELECT USING (org_id = public.user_org_id() AND public.user_role() = 'leader');
CREATE POLICY "Affiliates see active templates" ON public.campaign_templates
  FOR SELECT USING (org_id = public.user_org_id() AND status = 'active');
CREATE POLICY "Leaders can manage templates" ON public.campaign_templates
  FOR ALL USING (org_id = public.user_org_id() AND public.user_role() = 'leader');

CREATE POLICY "Org members see template assets" ON public.assets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.campaign_templates ct
      WHERE ct.id = assets.template_id
      AND ct.org_id = public.user_org_id()
      AND (public.user_role() = 'leader' OR ct.status = 'active')
    )
  );
CREATE POLICY "Leaders can manage assets" ON public.assets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.campaign_templates ct
      WHERE ct.id = assets.template_id AND ct.org_id = public.user_org_id() AND public.user_role() = 'leader'
    )
  );

CREATE POLICY "Org members see template geos" ON public.allowed_geos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.campaign_templates ct
      WHERE ct.id = allowed_geos.template_id
      AND ct.org_id = public.user_org_id()
      AND (public.user_role() = 'leader' OR ct.status = 'active')
    )
  );
CREATE POLICY "Leaders can manage geos" ON public.allowed_geos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.campaign_templates ct
      WHERE ct.id = allowed_geos.template_id AND ct.org_id = public.user_org_id() AND public.user_role() = 'leader'
    )
  );

CREATE POLICY "Leaders see all org activations" ON public.campaign_activations
  FOR SELECT USING (org_id = public.user_org_id() AND public.user_role() = 'leader');
CREATE POLICY "Affiliates see own activations" ON public.campaign_activations
  FOR SELECT USING (affiliate_id = auth.uid());
CREATE POLICY "Affiliates can create activations" ON public.campaign_activations
  FOR INSERT WITH CHECK (affiliate_id = auth.uid() AND org_id = public.user_org_id());
CREATE POLICY "Leaders can update org activations" ON public.campaign_activations
  FOR UPDATE USING (org_id = public.user_org_id() AND public.user_role() = 'leader');

CREATE POLICY "Leaders see org payments" ON public.payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.campaign_activations ca
      WHERE ca.id = payments.activation_id AND ca.org_id = public.user_org_id() AND public.user_role() = 'leader'
    )
  );
CREATE POLICY "Affiliates see own payments" ON public.payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.campaign_activations ca
      WHERE ca.id = payments.activation_id AND ca.affiliate_id = auth.uid()
    )
  );
CREATE POLICY "Affiliates can create payments" ON public.payments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaign_activations ca
      WHERE ca.id = payments.activation_id AND ca.affiliate_id = auth.uid()
    )
  );

CREATE POLICY "Leaders see org metrics" ON public.campaign_metrics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.campaign_activations ca
      WHERE ca.id = campaign_metrics.activation_id
      AND ca.org_id = public.user_org_id()
      AND public.user_role() = 'leader'
    )
  );
CREATE POLICY "Affiliates see own metrics" ON public.campaign_metrics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.campaign_activations ca
      WHERE ca.id = campaign_metrics.activation_id AND ca.affiliate_id = auth.uid()
    )
  );

CREATE POLICY "Leaders see org activity" ON public.activity_log
  FOR SELECT USING (org_id = public.user_org_id() AND public.user_role() = 'leader');

CREATE POLICY "Users see own notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Leaders see org invitations" ON public.invitation_tokens
  FOR SELECT USING (org_id = public.user_org_id() AND public.user_role() = 'leader');
CREATE POLICY "Leaders can create invitations" ON public.invitation_tokens
  FOR INSERT WITH CHECK (org_id = public.user_org_id() AND public.user_role() = 'leader');
