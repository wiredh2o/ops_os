-- 1. Rename cust_since to start_date
ALTER TABLE public.companies 
RENAME COLUMN cust_since TO start_date;

-- 2. Add last_trans_date column
ALTER TABLE public.companies 
ADD COLUMN last_trans_date DATE;

-- 3. Add helpful comments
COMMENT ON COLUMN public.companies.start_date IS 'Date when customer relationship started';
COMMENT ON COLUMN public.companies.last_trans_date IS 'Date of most recent transaction (auto-updated from orders)';

-- 4. Add index for performance
CREATE INDEX idx_companies_last_trans_date ON public.companies(last_trans_date);

-- 5. Create automatic update trigger function
CREATE OR REPLACE FUNCTION public.update_customer_last_transaction_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  trans_date DATE;
  target_company_id UUID;
BEGIN
  -- Determine company ID from either customer_id or customer_company_id
  IF TG_TABLE_NAME = 'production_orders' THEN
    target_company_id := NEW.customer_company_id;
  ELSIF TG_TABLE_NAME = 'repair_orders' THEN
    target_company_id := NEW.customer_id;
  ELSE
    RETURN NEW;
  END IF;
  
  -- Only proceed if company_id is set
  IF target_company_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Only trigger on status changes to 'shipped' or 'completed'
  IF NEW.status IN ('shipped', 'completed') AND 
     (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    
    -- Use sold_at if available (production_orders), otherwise use current date
    IF NEW.sold_at IS NOT NULL THEN
      trans_date := NEW.sold_at::DATE;
    ELSE
      trans_date := CURRENT_DATE;
    END IF;
    
    -- Update companies.last_trans_date
    UPDATE public.companies
    SET last_trans_date = trans_date
    WHERE id = target_company_id
      -- Only update if this transaction is more recent (or if NULL)
      AND (last_trans_date IS NULL OR last_trans_date < trans_date);
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- 6. Apply trigger to production_orders
DROP TRIGGER IF EXISTS trg_update_last_trans_date_production ON public.production_orders;
CREATE TRIGGER trg_update_last_trans_date_production
  AFTER INSERT OR UPDATE OF status, sold_at
  ON public.production_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_customer_last_transaction_date();

-- 7. Apply trigger to repair_orders
DROP TRIGGER IF EXISTS trg_update_last_trans_date_repair ON public.repair_orders;
CREATE TRIGGER trg_update_last_trans_date_repair
  AFTER INSERT OR UPDATE OF status
  ON public.repair_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_customer_last_transaction_date();