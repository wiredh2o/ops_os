CREATE OR REPLACE FUNCTION notification_private.retry_notification(p_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE n public.notification_outbox; em text; ph text; meth text; BEGIN
IF NOT public.is_notification_staff() OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active) THEN RAISE EXCEPTION 'Staff access required'; END IF;
SELECT * INTO n FROM public.notification_outbox WHERE id=p_id AND status IN ('failed','blocked','awaiting_credentials','partial'); IF NOT FOUND THEN RAISE EXCEPTION 'Not retryable'; END IF;
IF n.user_id IS NULL THEN em:=n.recipient_email; ph:=n.recipient_phone; meth:='both';
ELSE SELECT email,phone,notification_method INTO em,ph,meth FROM public.profiles WHERE id=n.user_id; IF NOT FOUND THEN RAISE EXCEPTION 'Not retryable'; END IF; END IF;
IF NOT EXISTS(SELECT 1 FROM (VALUES('email',lower(trim(coalesce(em,'')))),('text',regexp_replace(coalesce(ph,''),'[^+0-9]','','g'))) v(channel,contact) LEFT JOIN public.notification_contacts c ON c.channel=v.channel AND c.contact=v.contact WHERE v.contact<>'' AND coalesce(c.failures,0)<5 AND (meth='both' OR meth=v.channel) AND NOT EXISTS(SELECT 1 FROM public.notification_deliveries d WHERE d.notification_id=p_id AND d.channel=v.channel AND d.contact=v.contact AND d.status='sent')) THEN RAISE EXCEPTION 'Update blocked contact before retrying'; END IF;
UPDATE public.notification_outbox SET status='pending',next_attempt_at=now(),manual_retry=true WHERE id=p_id; END; $function$;