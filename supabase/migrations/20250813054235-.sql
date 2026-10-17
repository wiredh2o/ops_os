-- Fix: schema-qualify enum type inside function due to empty search_path
CREATE OR REPLACE FUNCTION public.handle_user_from_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_invite_id uuid;
  v_company_id uuid;
  v_role public.app_role;
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