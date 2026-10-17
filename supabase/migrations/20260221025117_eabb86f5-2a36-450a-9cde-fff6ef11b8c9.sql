
-- Create packing_feedback table for dimension-based learning
CREATE TABLE public.packing_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  feedback_type text NOT NULL CHECK (feedback_type IN ('selection', 'correction', 'layer_correction')),
  box_dims jsonb NOT NULL,
  algorithm_option_index int NOT NULL DEFAULT 0,
  selected_option_index int NOT NULL DEFAULT 0,
  item_profiles jsonb NOT NULL DEFAULT '[]'::jsonb,
  layer_profiles jsonb NOT NULL DEFAULT '[]'::jsonb,
  original_positions jsonb NOT NULL DEFAULT '[]'::jsonb,
  corrected_positions jsonb,
  original_layers jsonb NOT NULL DEFAULT '[]'::jsonb,
  corrected_layers jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.packing_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert packing feedback"
  ON public.packing_feedback
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can view company packing feedback"
  ON public.packing_feedback
  FOR SELECT
  USING (
    company_id IN (
      SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
    )
    OR created_by = auth.uid()
  );

CREATE INDEX idx_packing_feedback_company ON public.packing_feedback(company_id);
CREATE INDEX idx_packing_feedback_type ON public.packing_feedback(feedback_type);
CREATE INDEX idx_packing_feedback_created ON public.packing_feedback(created_at DESC);
