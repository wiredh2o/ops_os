CREATE OR REPLACE FUNCTION notification_private.save_notification_preferences(p_target uuid,p_account boolean,p_marketing boolean,p_method text,p_locked boolean DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active) THEN RAISE EXCEPTION 'Sign in required'; END IF;
IF p_target<>auth.uid() THEN
 IF p_locked IS NULL OR NOT public.can_lock_notification_preferences(p_target) THEN RAISE EXCEPTION 'Not authorized to set lock'; END IF;
 UPDATE public.profiles SET notification_preferences_locked=p_locked WHERE id=p_target;
ELSE
 IF p_method NOT IN ('email','text','both') OR p_account IS NULL OR p_marketing IS NULL THEN RAISE EXCEPTION 'Invalid preferences'; END IF;
 IF p_locked IS NOT NULL AND NOT public.can_lock_notification_preferences(p_target) THEN RAISE EXCEPTION 'Not authorized to set lock'; END IF;
 UPDATE public.profiles SET account_notifications=p_account,offers_marketing=p_marketing,notification_method=p_method,notification_preferences_locked=coalesce(p_locked,notification_preferences_locked) WHERE id=p_target;
END IF;
IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF; END; $$;
CREATE OR REPLACE FUNCTION public.protect_notification_preferences() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NEW.notification_method NOT IN ('email','text','both') THEN RAISE EXCEPTION 'Invalid notification method'; END IF;
IF auth.uid() IS NOT NULL THEN
 IF TG_OP='INSERT' THEN
  IF NEW.notification_preferences_locked AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Only an administrator can lock preferences'; END IF;
 ELSE
  IF NEW.notification_preferences_locked IS DISTINCT FROM OLD.notification_preferences_locked AND NOT public.can_lock_notification_preferences(NEW.id) THEN RAISE EXCEPTION 'Only an authorized administrator can change the employee lock'; END IF;
  IF (NEW.account_notifications,NEW.offers_marketing,NEW.notification_method) IS DISTINCT FROM (OLD.account_notifications,OLD.offers_marketing,OLD.notification_method) AND (NEW.id<>auth.uid() OR OLD.notification_preferences_locked) THEN RAISE EXCEPTION 'Notification preferences are locked or not yours'; END IF;
 END IF;
END IF; RETURN NEW; END; $$;
DO $$ DECLARE d text; BEGIN SELECT pg_get_functiondef('public.notification_wake()'::regprocedure) INTO d; d:=regexp_replace(d,'headers:=''[^'']*''::jsonb','headers:=''{}''::jsonb'); EXECUTE d; END; $$;
CREATE OR REPLACE FUNCTION public.notification_profile_events() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN PERFORM public.enqueue_notification(NEW.id,CASE WHEN NEW.is_active THEN 'account_enabled' ELSE 'account_disabled' END,CASE WHEN NEW.is_active THEN 'Account re-enabled' ELSE 'Account disabled' END,'<table role="presentation"><tr><td>Your account has been '||CASE WHEN NEW.is_active THEN 're-enabled' ELSE 'disabled' END||'.</td></tr></table>','Your account has been '||CASE WHEN NEW.is_active THEN 're-enabled' ELSE 'disabled' END||'.',NULL); END IF;
IF lower(trim(NEW.email)) IS DISTINCT FROM lower(trim(OLD.email)) THEN UPDATE public.notification_contacts SET failures=0 WHERE channel='email' AND contact=lower(trim(NEW.email)); END IF;
IF NEW.phone IS DISTINCT FROM OLD.phone THEN UPDATE public.notification_contacts SET failures=0 WHERE channel='text' AND contact=regexp_replace(coalesce(NEW.phone,''),'[^+0-9]','','g'); END IF;
IF (NEW.email,NEW.phone) IS DISTINCT FROM (OLD.email,OLD.phone) THEN UPDATE public.notification_outbox SET status='pending',manual_retry=true,next_attempt_at=now() WHERE user_id=NEW.id AND status IN ('blocked','failed','awaiting_credentials'); END IF;
RETURN NEW; END; $$;