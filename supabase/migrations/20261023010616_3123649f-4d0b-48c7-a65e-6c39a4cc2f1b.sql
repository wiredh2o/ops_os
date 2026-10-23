CREATE TABLE public.company_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider text NOT NULL,
  encrypted_secrets text NOT NULL,
  encryption_iv text NOT NULL,
  public_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, provider)
);
REVOKE ALL ON public.company_integrations FROM anon, authenticated;
GRANT ALL ON public.company_integrations TO service_role;
ALTER TABLE public.company_integrations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.validate_company_integration()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.provider NOT IN ('stripe','fedex','ups','usps','mouser','digikey') THEN
    RAISE EXCEPTION 'Unknown integration provider %', NEW.provider;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER company_integrations_validate BEFORE INSERT OR UPDATE ON public.company_integrations
FOR EACH ROW EXECUTE FUNCTION public.validate_company_integration();