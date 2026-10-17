-- Create account type enums
CREATE TYPE account_type AS ENUM (
  'asset',
  'liability', 
  'equity',
  'income',
  'expense'
);

CREATE TYPE account_subtype AS ENUM (
  'checking',
  'credit_card',
  'inventory',
  'accounts_receivable',
  'accounts_payable',
  'sales',
  'cost_of_goods_sold',
  'operating_expenses',
  'other_income',
  'other_expenses'
);

-- Create accounts table
CREATE TABLE public.accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  account_type account_type NOT NULL,
  account_subtype account_subtype NOT NULL,
  account_number TEXT UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  current_balance NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Create transactions table
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_number TEXT,
  description TEXT NOT NULL,
  total_amount NUMERIC NOT NULL,
  is_reconciled BOOLEAN NOT NULL DEFAULT false,
  transaction_type TEXT NOT NULL, -- 'manual', 'inventory_purchase', 'production_sale', 'repair_sale'
  reference_id UUID, -- references production_orders.id, repair_orders.id, etc.
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Create transaction_lines table
CREATE TABLE public.transaction_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id),
  description TEXT,
  debit_amount NUMERIC DEFAULT 0,
  credit_amount NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create reconciliations table
CREATE TABLE public.reconciliations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id),
  reconciliation_date DATE NOT NULL,
  ending_balance NUMERIC NOT NULL,
  statement_date DATE NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Create reconciliation_items table
CREATE TABLE public.reconciliation_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reconciliation_id UUID NOT NULL REFERENCES public.reconciliations(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id),
  is_cleared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for accounts
CREATE POLICY "Accounts viewable by authenticated users" 
ON public.accounts FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Accounts manageable by authenticated users" 
ON public.accounts FOR ALL 
USING (auth.uid() IS NOT NULL);

-- RLS Policies for transactions
CREATE POLICY "Transactions viewable by authenticated users" 
ON public.transactions FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Transactions manageable by authenticated users" 
ON public.transactions FOR ALL 
USING (auth.uid() IS NOT NULL);

-- RLS Policies for transaction_lines
CREATE POLICY "Transaction lines viewable by authenticated users" 
ON public.transaction_lines FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Transaction lines manageable by authenticated users" 
ON public.transaction_lines FOR ALL 
USING (auth.uid() IS NOT NULL);

-- RLS Policies for reconciliations
CREATE POLICY "Reconciliations viewable by authenticated users" 
ON public.reconciliations FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Reconciliations manageable by authenticated users" 
ON public.reconciliations FOR ALL 
USING (auth.uid() IS NOT NULL);

-- RLS Policies for reconciliation_items
CREATE POLICY "Reconciliation items viewable by authenticated users" 
ON public.reconciliation_items FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Reconciliation items manageable by authenticated users" 
ON public.reconciliation_items FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Create triggers for updated_at timestamps
CREATE TRIGGER update_accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_reconciliations_updated_at
  BEFORE UPDATE ON public.reconciliations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to update account balances when transaction lines change
CREATE OR REPLACE FUNCTION public.update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- Handle INSERT
  IF TG_OP = 'INSERT' THEN
    UPDATE public.accounts 
    SET current_balance = current_balance + (NEW.debit_amount - NEW.credit_amount)
    WHERE id = NEW.account_id;
    RETURN NEW;
  END IF;
  
  -- Handle UPDATE
  IF TG_OP = 'UPDATE' THEN
    -- Reverse old amounts
    UPDATE public.accounts 
    SET current_balance = current_balance - (OLD.debit_amount - OLD.credit_amount)
    WHERE id = OLD.account_id;
    
    -- Apply new amounts
    UPDATE public.accounts 
    SET current_balance = current_balance + (NEW.debit_amount - NEW.credit_amount)
    WHERE id = NEW.account_id;
    RETURN NEW;
  END IF;
  
  -- Handle DELETE
  IF TG_OP = 'DELETE' THEN
    UPDATE public.accounts 
    SET current_balance = current_balance - (OLD.debit_amount - OLD.credit_amount)
    WHERE id = OLD.account_id;
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for account balance updates
CREATE TRIGGER update_account_balance_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.transaction_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.update_account_balance();

-- Function to automatically create transactions for inventory purchases
CREATE OR REPLACE FUNCTION public.handle_inventory_purchase()
RETURNS TRIGGER AS $$
DECLARE
  checking_account_id UUID;
  inventory_account_id UUID;
  transaction_id UUID;
BEGIN
  -- Only process inventory items with unit_price > 0
  IF NEW.unit_price > 0 THEN
    -- Get account IDs
    SELECT id INTO checking_account_id FROM public.accounts 
    WHERE account_subtype = 'checking' LIMIT 1;
    
    SELECT id INTO inventory_account_id FROM public.accounts 
    WHERE account_subtype = 'inventory' LIMIT 1;
    
    -- Only proceed if both accounts exist
    IF checking_account_id IS NOT NULL AND inventory_account_id IS NOT NULL THEN
      -- Create transaction
      INSERT INTO public.transactions (
        description,
        total_amount,
        transaction_type,
        reference_id,
        created_by
      ) VALUES (
        'Inventory Purchase: ' || NEW.name,
        NEW.unit_price * NEW.quantity_on_hand,
        'inventory_purchase',
        NEW.id,
        NEW.created_by
      ) RETURNING id INTO transaction_id;
      
      -- Create transaction lines
      -- Debit Inventory (increase asset)
      INSERT INTO public.transaction_lines (
        transaction_id,
        account_id,
        description,
        debit_amount
      ) VALUES (
        transaction_id,
        inventory_account_id,
        'Inventory Purchase: ' || NEW.name,
        NEW.unit_price * NEW.quantity_on_hand
      );
      
      -- Credit Checking (decrease asset)
      INSERT INTO public.transaction_lines (
        transaction_id,
        account_id,
        description,
        credit_amount
      ) VALUES (
        transaction_id,
        checking_account_id,
        'Inventory Purchase: ' || NEW.name,
        NEW.unit_price * NEW.quantity_on_hand
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for inventory purchases
CREATE TRIGGER handle_inventory_purchase_trigger
  AFTER INSERT ON public.inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_inventory_purchase();