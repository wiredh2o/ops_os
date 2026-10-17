
-- 1) Inbound packages (customer required, no free text)
CREATE TABLE public.inbound_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  tracking_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_transit',
  initiated_via TEXT, -- e.g. 'customer_portal' | 'manual'
  label_purchased BOOLEAN NOT NULL DEFAULT FALSE,
  initiated_by_user_id UUID,
  received_at TIMESTAMPTZ,
  received_by UUID,
  intake_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inbound_packages_tracking_number_unique UNIQUE (tracking_number)
);

ALTER TABLE public.inbound_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inbound packages viewable by authenticated users"
  ON public.inbound_packages
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Inbound packages insertable by authenticated users"
  ON public.inbound_packages
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Inbound packages updatable by authenticated users"
  ON public.inbound_packages
  FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Inbound packages deletable by authenticated users"
  ON public.inbound_packages
  FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Trigger to maintain updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_inbound_packages_updated_at
BEFORE UPDATE ON public.inbound_packages
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Helpful index
CREATE INDEX inbound_packages_company_idx ON public.inbound_packages(company_id);

-- 2) Receiving events (captures date/time received and log of actions)
CREATE TABLE public.receiving_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.inbound_packages(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL DEFAULT 'received',
  note TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.receiving_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Receiving events viewable by authenticated users"
  ON public.receiving_events
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Receiving events insertable by creator"
  ON public.receiving_events
  FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Receiving events updatable by creator"
  ON public.receiving_events
  FOR UPDATE
  USING (created_by = auth.uid());

CREATE INDEX receiving_events_package_idx ON public.receiving_events(package_id);

-- 3) Package photos (store Storage file paths)
CREATE TABLE public.inbound_package_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.inbound_packages(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inbound_package_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inbound package photos viewable by authenticated users"
  ON public.inbound_package_photos
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Inbound package photos insertable by creator"
  ON public.inbound_package_photos
  FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Inbound package photos updatable by creator"
  ON public.inbound_package_photos
  FOR UPDATE
  USING (created_by = auth.uid());

CREATE INDEX inbound_package_photos_package_idx ON public.inbound_package_photos(package_id);
