-- Create production_orders table
CREATE TABLE public.production_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  customer_id UUID,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'quality_check', 'completed', 'shipped', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  total_amount DECIMAL(10,2),
  due_date TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  assigned_to UUID,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create repair_orders table
CREATE TABLE public.repair_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  repair_number TEXT NOT NULL UNIQUE,
  customer_id UUID,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'diagnosed', 'parts_ordered', 'in_repair', 'quality_check', 'completed', 'shipped', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  item_description TEXT NOT NULL,
  problem_description TEXT NOT NULL,
  diagnosis TEXT,
  repair_cost DECIMAL(10,2),
  estimated_completion TIMESTAMP WITH TIME ZONE,
  actual_completion TIMESTAMP WITH TIME ZONE,
  warranty_expiry TIMESTAMP WITH TIME ZONE,
  assigned_to UUID,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create production_order_items table
CREATE TABLE public.production_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  production_order_id UUID NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  item_sku TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2),
  total_price DECIMAL(10,2),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create repair_parts table
CREATE TABLE public.repair_parts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  repair_order_id UUID NOT NULL REFERENCES public.repair_orders(id) ON DELETE CASCADE,
  part_name TEXT NOT NULL,
  part_sku TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_cost DECIMAL(10,2),
  total_cost DECIMAL(10,2),
  status TEXT NOT NULL DEFAULT 'needed' CHECK (status IN ('needed', 'ordered', 'received', 'installed')),
  vendor TEXT,
  ordered_date TIMESTAMP WITH TIME ZONE,
  received_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create status_history table for tracking all status changes
CREATE TABLE public.status_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_type TEXT NOT NULL CHECK (order_type IN ('production', 'repair')),
  order_id UUID NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  notes TEXT,
  changed_by UUID NOT NULL,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create notification_log table to track sent notifications
CREATE TABLE public.notification_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_type TEXT NOT NULL CHECK (order_type IN ('production', 'repair')),
  order_id UUID NOT NULL,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('email', 'sms')),
  recipient TEXT NOT NULL,
  subject TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending')),
  external_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

-- Create policies for production_orders
CREATE POLICY "Production orders viewable by authenticated users" 
ON public.production_orders 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Production orders manageable by production users" 
ON public.production_orders 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Create policies for repair_orders
CREATE POLICY "Repair orders viewable by authenticated users" 
ON public.repair_orders 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Repair orders manageable by production users" 
ON public.repair_orders 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Create policies for production_order_items
CREATE POLICY "Production order items viewable by authenticated users" 
ON public.production_order_items 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Production order items manageable by production users" 
ON public.production_order_items 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Create policies for repair_parts
CREATE POLICY "Repair parts viewable by authenticated users" 
ON public.repair_parts 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Repair parts manageable by production users" 
ON public.repair_parts 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Create policies for status_history
CREATE POLICY "Status history viewable by authenticated users" 
ON public.status_history 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Status history insertable by authenticated users" 
ON public.status_history 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Create policies for notification_log
CREATE POLICY "Notification log viewable by authenticated users" 
ON public.notification_log 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Notification log insertable by authenticated users" 
ON public.notification_log 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_production_orders_updated_at
  BEFORE UPDATE ON public.production_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_repair_orders_updated_at
  BEFORE UPDATE ON public.repair_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_production_order_items_updated_at
  BEFORE UPDATE ON public.production_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_repair_parts_updated_at
  BEFORE UPDATE ON public.repair_parts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to log status changes and send notifications
CREATE OR REPLACE FUNCTION public.handle_status_change()
RETURNS TRIGGER AS $$
DECLARE
  order_type TEXT;
  customer_email TEXT;
  customer_phone TEXT;
  order_number TEXT;
BEGIN
  -- Determine order type and get customer info
  IF TG_TABLE_NAME = 'production_orders' THEN
    order_type = 'production';
    customer_email = NEW.customer_email;
    customer_phone = NEW.customer_phone;
    order_number = NEW.order_number;
  ELSIF TG_TABLE_NAME = 'repair_orders' THEN
    order_type = 'repair';
    customer_email = NEW.customer_email;
    customer_phone = NEW.customer_phone;
    order_number = NEW.repair_number;
  END IF;

  -- Log status change if status actually changed
  IF OLD IS NULL OR OLD.status != NEW.status THEN
    INSERT INTO public.status_history (
      order_type,
      order_id,
      old_status,
      new_status,
      changed_by
    ) VALUES (
      order_type,
      NEW.id,
      COALESCE(OLD.status, 'new'),
      NEW.status,
      COALESCE(auth.uid(), NEW.created_by)
    );

    -- Trigger notification function
    PERFORM net.http_post(
      url := current_setting('app.base_url', true) || '/functions/v1/send-status-notification',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '"}',
      body := json_build_object(
        'order_type', order_type,
        'order_id', NEW.id,
        'order_number', order_number,
        'status', NEW.status,
        'customer_email', customer_email,
        'customer_phone', customer_phone
      )::text
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers for status change notifications
CREATE TRIGGER production_order_status_change
  AFTER INSERT OR UPDATE ON public.production_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_status_change();

CREATE TRIGGER repair_order_status_change
  AFTER INSERT OR UPDATE ON public.repair_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_status_change();

-- Create indexes for better performance
CREATE INDEX idx_production_orders_status ON public.production_orders(status);
CREATE INDEX idx_production_orders_customer ON public.production_orders(customer_id);
CREATE INDEX idx_production_orders_assigned ON public.production_orders(assigned_to);
CREATE INDEX idx_repair_orders_status ON public.repair_orders(status);
CREATE INDEX idx_repair_orders_customer ON public.repair_orders(customer_id);
CREATE INDEX idx_repair_orders_assigned ON public.repair_orders(assigned_to);
CREATE INDEX idx_status_history_order ON public.status_history(order_type, order_id);
CREATE INDEX idx_notification_log_order ON public.notification_log(order_type, order_id);