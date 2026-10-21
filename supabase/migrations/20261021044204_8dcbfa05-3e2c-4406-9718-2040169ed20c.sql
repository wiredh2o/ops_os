ALTER TABLE public.profiles ADD COLUMN account_notifications boolean NOT NULL DEFAULT true, ADD COLUMN offers_marketing boolean NOT NULL DEFAULT false, ADD COLUMN notification_method text NOT NULL DEFAULT 'email', ADD COLUMN notification_preferences_locked boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.is_notification_staff() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role::text IN ('admin','sales_support','production','accounting','marketing','tech_support')); $$;
CREATE OR REPLACE FUNCTION public.can_lock_notification_preferences(p_target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.has_role(auth.uid(),'admin') OR (p_target<>auth.uid() AND EXISTS(SELECT 1 FROM public.profiles a JOIN public.profiles b ON b.company_id=a.company_id WHERE a.id=auth.uid() AND b.id=p_target AND a.company_id IS NOT NULL) AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role::text IN ('car_wash_admin','distributor_admin','vendor_admin')) AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_target AND role::text IN ('car_wash_employee','distributor_employee','vendor_employee')) AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_target AND role::text IN ('admin','sales_support','production','accounting','marketing','tech_support','car_wash_admin','distributor_admin','vendor_admin'))); $$;
CREATE OR REPLACE FUNCTION public.protect_notification_preferences() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NEW.notification_method NOT IN ('email','text','both') THEN RAISE EXCEPTION 'Invalid notification method'; END IF;
IF auth.uid() IS NOT NULL THEN
 IF TG_OP='INSERT' THEN
  IF NEW.notification_preferences_locked AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Only an administrator can lock preferences'; END IF;
 ELSE
  IF NEW.notification_preferences_locked IS DISTINCT FROM OLD.notification_preferences_locked AND NOT public.can_lock_notification_preferences(NEW.id) THEN RAISE EXCEPTION 'Only an authorized administrator can change the employee lock'; END IF;
  IF (NEW.account_notifications,NEW.offers_marketing,NEW.notification_method) IS DISTINCT FROM (OLD.account_notifications,OLD.offers_marketing,OLD.notification_method) AND NOT public.can_lock_notification_preferences(NEW.id) AND (NEW.id<>auth.uid() OR OLD.notification_preferences_locked) THEN RAISE EXCEPTION 'Notification preferences are locked or not yours'; END IF;
 END IF;
END IF; RETURN NEW; END; $$;
CREATE TRIGGER protect_notification_preferences BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_notification_preferences();
CREATE OR REPLACE FUNCTION public.save_notification_preferences(p_target uuid,p_account boolean,p_marketing boolean,p_method text,p_locked boolean DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active) THEN RAISE EXCEPTION 'Sign in required'; END IF;
IF p_method NOT IN ('email','text','both') OR p_account IS NULL OR p_marketing IS NULL THEN RAISE EXCEPTION 'Invalid preferences'; END IF;
IF p_target<>auth.uid() AND NOT public.can_lock_notification_preferences(p_target) THEN RAISE EXCEPTION 'Not authorized'; END IF;
IF p_locked IS NOT NULL AND NOT public.can_lock_notification_preferences(p_target) THEN RAISE EXCEPTION 'Not authorized to set lock'; END IF;
UPDATE public.profiles SET account_notifications=p_account,offers_marketing=p_marketing,notification_method=p_method,notification_preferences_locked=coalesce(p_locked,notification_preferences_locked) WHERE id=p_target;
IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF; END; $$;
REVOKE ALL ON FUNCTION public.save_notification_preferences(uuid,boolean,boolean,text,boolean) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.save_notification_preferences(uuid,boolean,boolean,text,boolean) TO authenticated;
CREATE TABLE public.notification_outbox(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, event_key text UNIQUE, kind text NOT NULL, subject text NOT NULL, html text NOT NULL, sms text NOT NULL, status text NOT NULL DEFAULT 'pending', next_attempt_at timestamptz DEFAULT now(), automatic_tries integer NOT NULL DEFAULT 0, last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.notification_outbox TO authenticated; GRANT ALL ON public.notification_outbox TO service_role;
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_staff_read ON public.notification_outbox FOR SELECT TO authenticated USING(public.is_notification_staff());
CREATE TRIGGER notification_outbox_updated BEFORE UPDATE ON public.notification_outbox FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TABLE public.notification_contacts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),channel text NOT NULL,contact text NOT NULL,failures integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(channel,contact));
GRANT SELECT ON public.notification_contacts TO authenticated; GRANT ALL ON public.notification_contacts TO service_role;
ALTER TABLE public.notification_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_contacts_staff_read ON public.notification_contacts FOR SELECT TO authenticated USING(public.is_notification_staff());
CREATE TRIGGER notification_contacts_updated BEFORE UPDATE ON public.notification_contacts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TABLE public.notification_deliveries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),notification_id uuid NOT NULL REFERENCES public.notification_outbox(id) ON DELETE CASCADE,channel text NOT NULL,contact text NOT NULL,status text NOT NULL DEFAULT 'pending',attempts integer NOT NULL DEFAULT 0,last_error text,provider_id text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(notification_id,channel,contact));
GRANT SELECT ON public.notification_deliveries TO authenticated; GRANT ALL ON public.notification_deliveries TO service_role;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_deliveries_staff_read ON public.notification_deliveries FOR SELECT TO authenticated USING(public.is_notification_staff());
CREATE TRIGGER notification_deliveries_updated BEFORE UPDATE ON public.notification_deliveries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX notification_due ON public.notification_outbox(next_attempt_at) WHERE status IN ('pending','failed','awaiting_credentials');
CREATE OR REPLACE FUNCTION public.enqueue_notification(p_user uuid,p_kind text,p_subject text,p_html text,p_sms text,p_key text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE n uuid; p public.profiles; BEGIN
SELECT * INTO p FROM public.profiles WHERE id=p_user; IF NOT FOUND THEN RETURN NULL; END IF;
IF p_kind NOT IN ('rma_issued','account_disabled','account_enabled','failed_payment','account','marketing') THEN RAISE EXCEPTION 'Invalid notification category'; END IF;
IF p_kind='account' AND NOT p.account_notifications OR p_kind='marketing' AND NOT p.offers_marketing THEN RETURN NULL; END IF;
INSERT INTO public.notification_outbox(user_id,kind,subject,html,sms,event_key) VALUES(p_user,p_kind,left(p_subject,255),p_html,left(p_sms,1600),p_key) ON CONFLICT(event_key) DO NOTHING RETURNING id INTO n; RETURN n; END; $$;
REVOKE ALL ON FUNCTION public.enqueue_notification(uuid,text,text,text,text,text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.enqueue_notification(uuid,text,text,text,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.retry_notification(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE p public.profiles; BEGIN
IF NOT public.is_notification_staff() OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active) THEN RAISE EXCEPTION 'Staff access required'; END IF;
SELECT pr.* INTO p FROM public.profiles pr JOIN public.notification_outbox n ON n.user_id=pr.id WHERE n.id=p_id AND n.status IN ('failed','blocked','awaiting_credentials');
IF NOT FOUND THEN RAISE EXCEPTION 'Notification is not retryable'; END IF;
IF NOT EXISTS(SELECT 1 FROM (VALUES('email',lower(trim(coalesce(p.email,'')))),('text',regexp_replace(coalesce(p.phone,''),'[^+0-9]','','g'))) v(channel,contact) LEFT JOIN public.notification_contacts c ON c.channel=v.channel AND c.contact=v.contact WHERE v.contact<>'' AND coalesce(c.failures,0)<5 AND (p.notification_method='both' OR p.notification_method=v.channel)) THEN RAISE EXCEPTION 'Contact blocked: update the email or phone before retrying'; END IF;
UPDATE public.notification_outbox SET status='pending',next_attempt_at=now() WHERE id=p_id; END; $$;
REVOKE ALL ON FUNCTION public.retry_notification(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.retry_notification(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.notification_profile_events() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN PERFORM public.enqueue_notification(NEW.id,CASE WHEN NEW.is_active THEN 'account_enabled' ELSE 'account_disabled' END,CASE WHEN NEW.is_active THEN 'Account re-enabled' ELSE 'Account disabled' END,'<table role="presentation"><tr><td>Your account has been '||CASE WHEN NEW.is_active THEN 're-enabled' ELSE 'disabled' END||'.</td></tr></table>','Your account has been '||CASE WHEN NEW.is_active THEN 're-enabled' ELSE 'disabled' END||'.',NULL); END IF;
IF lower(trim(NEW.email)) IS DISTINCT FROM lower(trim(OLD.email)) THEN UPDATE public.notification_contacts SET failures=0 WHERE channel='email' AND contact=lower(trim(NEW.email)); END IF;
IF NEW.phone IS DISTINCT FROM OLD.phone THEN UPDATE public.notification_contacts SET failures=0 WHERE channel='text' AND contact=regexp_replace(coalesce(NEW.phone,''),'[^+0-9]','','g'); END IF;
IF (NEW.email,NEW.phone) IS DISTINCT FROM (OLD.email,OLD.phone) THEN UPDATE public.notification_outbox SET status='pending',next_attempt_at=now() WHERE user_id=NEW.id AND status IN ('blocked','failed','awaiting_credentials'); END IF;
RETURN NEW; END; $$;
CREATE TRIGGER notification_profile_events AFTER UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.notification_profile_events();
CREATE OR REPLACE FUNCTION public.notification_rma_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NEW.status='issued' AND OLD.status IS DISTINCT FROM NEW.status THEN PERFORM public.enqueue_notification(NEW.requester_id,'rma_issued','RMA approved / number issued','<table role="presentation"><tr><td>Your RMA has been approved. RMA number: '||NEW.rma_number||'</td></tr></table>','Your RMA has been approved. RMA number: '||NEW.rma_number,'rma-issued:'||NEW.id); END IF; RETURN NEW; END; $$;
CREATE TRIGGER notification_rma_event AFTER UPDATE ON public.rma_requests FOR EACH ROW EXECUTE FUNCTION public.notification_rma_event();