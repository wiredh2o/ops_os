-- Add discount_tier_id to companies table
ALTER TABLE public.companies 
ADD COLUMN discount_tier_id UUID REFERENCES public.discount_tiers(id);

-- Add index for better performance
CREATE INDEX idx_companies_discount_tier_id ON public.companies(discount_tier_id);