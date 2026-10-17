-- Add simple timer columns to repair_items table
ALTER TABLE public.repair_items 
ADD COLUMN timer_active BOOLEAN DEFAULT FALSE,
ADD COLUMN timer_user_id UUID REFERENCES auth.users(id),
ADD COLUMN timer_elapsed_ms BIGINT DEFAULT 0,
ADD COLUMN timer_last_started TIMESTAMP WITH TIME ZONE;