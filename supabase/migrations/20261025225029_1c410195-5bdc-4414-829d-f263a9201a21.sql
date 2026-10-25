CREATE OR REPLACE FUNCTION public.customer_credit_used(_company_id uuid)
 RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT sum(COALESCE(po.total_amount,0) + COALESCE(po.tax_amount,0)
      + COALESCE(po.shipping_cost, (
          SELECT CASE WHEN tot.v > 0 THEN COALESCE(co.estimated_shipping,0) * LEAST(COALESCE(po.total_amount,0) / tot.v, 1) ELSE 0 END
          FROM public.customer_orders co,
               LATERAL (SELECT sum(COALESCE(i.quantity_ordered,0) * COALESCE(i.unit_price,0)) v FROM public.customer_order_items i WHERE i.customer_order_id = co.id) tot
          WHERE co.id = po.parent_customer_order_id), 0)
      - COALESCE(po.credit_applied,0) - CASE WHEN po.deposit_paid THEN COALESCE(po.deposit_amount,0) ELSE 0 END)
    FROM public.production_orders po
    WHERE po.customer_company_id = _company_id AND po.order_type = 'customer' AND po.payment_received_at IS NULL), 0)
  + CASE WHEN COALESCE((SELECT setting_value FROM public.system_settings WHERE setting_key = 'credit_accounting_basis' LIMIT 1), 'cash') = 'cash' THEN
      COALESCE((
        SELECT sum(o.open_value + CASE WHEN o.total_value > 0 THEN (COALESCE(o.tax_amount,0) + COALESCE(o.estimated_shipping,0)) * o.open_value / o.total_value ELSE 0 END)
        FROM (
          SELECT co.id, co.tax_amount, co.estimated_shipping,
            sum(GREATEST(COALESCE(i.quantity_ordered,0) - COALESCE(i.quantity_invoiced,0), 0) * COALESCE(i.unit_price,0)) open_value,
            sum(COALESCE(i.quantity_ordered,0) * COALESCE(i.unit_price,0)) total_value
          FROM public.customer_orders co JOIN public.customer_order_items i ON i.customer_order_id = co.id
          WHERE co.customer_company_id = _company_id AND COALESCE(co.order_status,'pending') NOT IN ('fulfilled','cancelled')
          GROUP BY co.id, co.tax_amount, co.estimated_shipping) o), 0)
    ELSE 0 END
$function$;

CREATE OR REPLACE FUNCTION public.lock_paid_invoice_shipping()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.payment_received_at IS NOT NULL AND NEW.shipping_cost IS DISTINCT FROM OLD.shipping_cost THEN
    NEW.shipping_cost := OLD.shipping_cost;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.lock_paid_invoice_shipping() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS lock_paid_invoice_shipping ON public.production_orders;
CREATE TRIGGER lock_paid_invoice_shipping BEFORE UPDATE OF shipping_cost ON public.production_orders
FOR EACH ROW EXECUTE FUNCTION public.lock_paid_invoice_shipping();