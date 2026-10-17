-- 1) Utility function to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2) Create pending_invites table
CREATE TABLE IF NOT EXISTS public.pending_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  company_id uuid NOT NULL,
  intended_role app_role NOT NULL,
  inviter_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  invite_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  accepted_user_id uuid,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days')
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_pending_invites_email_pending 
  ON public.pending_invites (lower(email)) 
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS ux_pending_invites_unique_active 
  ON public.pending_invites (lower(email), company_id) 
  WHERE status = 'pending';

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_pending_invites_updated_at ON public.pending_invites;
CREATE TRIGGER trg_pending_invites_updated_at
BEFORE UPDATE ON public.pending_invites
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS and policies
ALTER TABLE public.pending_invites ENABLE ROW LEVEL SECURITY;

-- Allow reading invites to authenticated users (could be narrowed later)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'pending_invites' AND policyname = 'Pending invites viewable by authenticated users'
  ) THEN
    CREATE POLICY "Pending invites viewable by authenticated users"
      ON public.pending_invites
      FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- Only admins or sales_support can manage invites directly
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'pending_invites' AND policyname = 'Admins or Sales Support can manage invites'
  ) THEN
    CREATE POLICY "Admins or Sales Support can manage invites"
      ON public.pending_invites
      FOR ALL
      USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'sales_support'::app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'sales_support'::app_role));
  END IF;
END $$;

-- 3) Function + trigger to process invites on signup
CREATE OR REPLACE FUNCTION public.handle_user_from_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_invite_id uuid;
  v_company_id uuid;
  v_role app_role;
BEGIN
  -- Find the most recent, non-expired pending invite for this email
  SELECT id, company_id, intended_role
    INTO v_invite_id, v_company_id, v_role
  FROM public.pending_invites
  WHERE lower(email) = lower(NEW.email)
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_invite_id IS NOT NULL THEN
    -- Ensure a profile exists and link the company
    INSERT INTO public.profiles (id, email, company_id, is_active)
    VALUES (NEW.id, NEW.email, v_company_id, true)
    ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email,
          company_id = EXCLUDED.company_id;

    -- Assign the invited role; ignore if it already exists
    BEGIN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, v_role);
    EXCEPTION WHEN unique_violation THEN
      -- role already assigned; ignore
      NULL;
    END;

    -- Mark invite as accepted
    UPDATE public.pending_invites
      SET status = 'accepted', accepted_at = now(), accepted_user_id = NEW.id
    WHERE id = v_invite_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Create/replace trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created_from_invite ON auth.users;
CREATE TRIGGER on_auth_user_created_from_invite
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_user_from_invite();