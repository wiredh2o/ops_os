-- Phase 1: Create Security Infrastructure

-- Create security definer function to get current user's company ID (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.get_current_user_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Create function to check if user has access to a specific company's data
CREATE OR REPLACE FUNCTION public.has_company_access(target_company_id UUID)
RETURNS BOOLEAN AS $$
  SELECT 
    -- Admins and sales support have access to all companies
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'sales_support'::app_role) OR
    -- Other users only have access to their own company
    (SELECT company_id FROM public.profiles WHERE id = auth.uid()) = target_company_id;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Create function to check if user is admin or owner
CREATE OR REPLACE FUNCTION public.is_admin_or_owner()
RETURNS BOOLEAN AS $$
  SELECT 
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'sales_support'::app_role);
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Phase 2: Add company_id columns to high-priority tables

-- Add company_id to production_orders (customer's company)
ALTER TABLE public.production_orders 
ADD COLUMN customer_company_id UUID;

-- Add foreign key constraint
ALTER TABLE public.production_orders 
ADD CONSTRAINT fk_production_orders_customer_company 
FOREIGN KEY (customer_company_id) REFERENCES public.companies(id);

-- Add company_id to repair_orders  
ALTER TABLE public.repair_orders 
ADD COLUMN customer_company_id UUID;

-- Add foreign key constraint
ALTER TABLE public.repair_orders 
ADD CONSTRAINT fk_repair_orders_customer_company 
FOREIGN KEY (customer_company_id) REFERENCES public.companies(id);

-- Add company_id to purchase_orders (purchasing company)
ALTER TABLE public.purchase_orders 
ADD COLUMN company_id UUID;

-- Add foreign key constraint
ALTER TABLE public.purchase_orders 
ADD CONSTRAINT fk_purchase_orders_company 
FOREIGN KEY (company_id) REFERENCES public.companies(id);

-- Add company_id to accounts (company's financial accounts)
ALTER TABLE public.accounts 
ADD COLUMN company_id UUID;

-- Add foreign key constraint
ALTER TABLE public.accounts 
ADD CONSTRAINT fk_accounts_company 
FOREIGN KEY (company_id) REFERENCES public.companies(id);

-- Add company_id to transactions (company's financial transactions)
ALTER TABLE public.transactions 
ADD COLUMN company_id UUID;

-- Add foreign key constraint
ALTER TABLE public.transactions 
ADD CONSTRAINT fk_transactions_company 
FOREIGN KEY (company_id) REFERENCES public.companies(id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_production_orders_customer_company_id ON public.production_orders(customer_company_id);
CREATE INDEX IF NOT EXISTS idx_repair_orders_customer_company_id ON public.repair_orders(customer_company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_company_id ON public.purchase_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_accounts_company_id ON public.accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_transactions_company_id ON public.transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON public.profiles(company_id);

-- Phase 3: Update RLS Policies for Production Orders

-- Drop existing production orders policies
DROP POLICY IF EXISTS "Production orders manageable by production users" ON public.production_orders;
DROP POLICY IF EXISTS "Production orders viewable by authenticated users" ON public.production_orders;

-- Create new company-scoped policies for production orders
CREATE POLICY "Production orders viewable by company users" 
ON public.production_orders FOR SELECT 
USING (
  auth.uid() IS NOT NULL AND (
    -- Admins and sales support see all orders
    is_admin_or_owner() OR
    -- Users see orders for their company or where they're the customer
    has_company_access(customer_company_id) OR
    -- Production users with permission can see all orders
    (has_role(auth.uid(), 'production'::app_role) AND has_permission(auth.uid(), 'view_production_orders'))
  )
);

CREATE POLICY "Production orders manageable by authorized users" 
ON public.production_orders FOR ALL 
USING (
  auth.uid() IS NOT NULL AND (
    -- Admins and sales support can manage all orders
    is_admin_or_owner() OR
    -- Production users with permission can manage all orders
    (has_role(auth.uid(), 'production'::app_role) AND has_permission(auth.uid(), 'manage_production_orders')) OR
    -- Car wash admins can manage orders for their company
    (has_role(auth.uid(), 'car_wash_admin'::app_role) AND has_company_access(customer_company_id))
  )
);

-- Update RLS Policies for Repair Orders

-- Drop existing repair orders policies
DROP POLICY IF EXISTS "Repair orders manageable by production users" ON public.repair_orders;
DROP POLICY IF EXISTS "Repair orders viewable by authenticated users" ON public.repair_orders;

-- Create new company-scoped policies for repair orders
CREATE POLICY "Repair orders viewable by company users" 
ON public.repair_orders FOR SELECT 
USING (
  auth.uid() IS NOT NULL AND (
    -- Admins and production can see all repair orders
    is_admin_or_owner() OR
    has_role(auth.uid(), 'production'::app_role) OR
    -- Users see repair orders for their company
    has_company_access(customer_company_id)
  )
);

CREATE POLICY "Repair orders manageable by authorized users" 
ON public.repair_orders FOR ALL 
USING (
  auth.uid() IS NOT NULL AND (
    -- Admins can manage all repair orders
    is_admin_or_owner() OR
    -- Production users can manage all repair orders
    has_role(auth.uid(), 'production'::app_role) OR
    -- Car wash admins can manage repair orders for their company
    (has_role(auth.uid(), 'car_wash_admin'::app_role) AND has_company_access(customer_company_id))
  )
);

-- Update RLS Policies for Purchase Orders

-- Drop existing purchase orders policies
DROP POLICY IF EXISTS "Purchase orders manageable by authenticated users" ON public.purchase_orders;
DROP POLICY IF EXISTS "Purchase orders viewable by authenticated users" ON public.purchase_orders;

-- Create new company-scoped policies for purchase orders
CREATE POLICY "Purchase orders viewable by company users" 
ON public.purchase_orders FOR SELECT 
USING (
  auth.uid() IS NOT NULL AND (
    -- Admins and production can see all purchase orders
    is_admin_or_owner() OR
    has_role(auth.uid(), 'production'::app_role) OR
    -- Users see purchase orders for their company
    has_company_access(company_id)
  )
);

CREATE POLICY "Purchase orders manageable by authorized users" 
ON public.purchase_orders FOR ALL 
USING (
  auth.uid() IS NOT NULL AND (
    -- Admins can manage all purchase orders
    is_admin_or_owner() OR
    -- Production users can manage all purchase orders  
    has_role(auth.uid(), 'production'::app_role) OR
    -- Car wash admins can manage purchase orders for their company
    (has_role(auth.uid(), 'car_wash_admin'::app_role) AND has_company_access(company_id))
  )
);

-- Update RLS Policies for Accounts

-- Drop existing accounts policies
DROP POLICY IF EXISTS "Accounts manageable by authenticated users" ON public.accounts;
DROP POLICY IF EXISTS "Accounts viewable by authenticated users" ON public.accounts;

-- Create new company-scoped policies for accounts
CREATE POLICY "Accounts viewable by company users" 
ON public.accounts FOR SELECT 
USING (
  auth.uid() IS NOT NULL AND (
    -- Admins and accounting can see all accounts
    is_admin_or_owner() OR
    has_role(auth.uid(), 'accounting'::app_role) OR
    -- Users see accounts for their company
    has_company_access(company_id)
  )
);

CREATE POLICY "Accounts manageable by authorized users" 
ON public.accounts FOR ALL 
USING (
  auth.uid() IS NOT NULL AND (
    -- Admins and accounting can manage all accounts
    is_admin_or_owner() OR
    has_role(auth.uid(), 'accounting'::app_role) OR
    -- Car wash admins can manage accounts for their company
    (has_role(auth.uid(), 'car_wash_admin'::app_role) AND has_company_access(company_id))
  )
);

-- Update RLS Policies for Transactions

-- Drop existing transactions policies
DROP POLICY IF EXISTS "Transactions manageable by authenticated users" ON public.transactions;
DROP POLICY IF EXISTS "Transactions viewable by authenticated users" ON public.transactions;

-- Create new company-scoped policies for transactions
CREATE POLICY "Transactions viewable by company users" 
ON public.transactions FOR SELECT 
USING (
  auth.uid() IS NOT NULL AND (
    -- Admins and accounting can see all transactions
    is_admin_or_owner() OR
    has_role(auth.uid(), 'accounting'::app_role) OR
    -- Users see transactions for their company
    has_company_access(company_id)
  )
);

CREATE POLICY "Transactions manageable by authorized users" 
ON public.transactions FOR ALL 
USING (
  auth.uid() IS NOT NULL AND (
    -- Admins and accounting can manage all transactions
    is_admin_or_owner() OR
    has_role(auth.uid(), 'accounting'::app_role) OR
    -- Car wash admins can manage transactions for their company
    (has_role(auth.uid(), 'car_wash_admin'::app_role) AND has_company_access(company_id))
  )
);

-- Ensure inbound_packages already has proper company-scoped RLS
-- (It already has company_id column, just verify policies are correct)

-- Drop and recreate inbound packages policies to ensure proper company scoping
DROP POLICY IF EXISTS "Inbound packages viewable by authenticated users" ON public.inbound_packages;
DROP POLICY IF EXISTS "Inbound packages insertable by authenticated users" ON public.inbound_packages;
DROP POLICY IF EXISTS "Inbound packages updatable by authenticated users" ON public.inbound_packages;
DROP POLICY IF EXISTS "Inbound packages deletable by authenticated users" ON public.inbound_packages;

CREATE POLICY "Inbound packages viewable by company users" 
ON public.inbound_packages FOR SELECT 
USING (
  auth.uid() IS NOT NULL AND (
    -- Admins can see all packages
    is_admin_or_owner() OR
    -- Users see packages for their company
    has_company_access(company_id)
  )
);

CREATE POLICY "Inbound packages manageable by company users" 
ON public.inbound_packages FOR ALL 
USING (
  auth.uid() IS NOT NULL AND (
    -- Admins can manage all packages
    is_admin_or_owner() OR
    -- Users can manage packages for their company
    has_company_access(company_id)
  )
);