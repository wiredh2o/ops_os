-- Phase 1: Repair Item Status Workflow Overhaul

-- 1.1 Add new columns to repair_items table
ALTER TABLE repair_items 
ADD COLUMN IF NOT EXISTS diagnosis_assessment TEXT DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS completion_outcome TEXT;

-- 1.2 Migrate existing data - First, set diagnosis_assessment based on current repairability
UPDATE repair_items SET
  diagnosis_assessment = CASE
    WHEN repairability = 'repairable' THEN 'repairable'
    WHEN repairability = 'not_repairable' THEN 'not_repairable'
    WHEN repairability = 'needs_parts' THEN 'needs_parts'
    ELSE 'unknown'
  END;

-- 1.3 Update status and completion_outcome
UPDATE repair_items SET
  completion_outcome = CASE
    -- Items that were genuinely repaired
    WHEN status = 'repaired' AND repairability = 'repairable' THEN 'repaired'
    -- Items marked "repaired" but were actually unrepairable (workaround for lack of close option)
    WHEN status = 'repaired' AND repairability = 'not_repairable' THEN 'unrepairable'
    -- Items marked as not_repairable status
    WHEN status = 'not_repairable' THEN 'unrepairable'
    ELSE NULL
  END,
  status = CASE
    WHEN status = 'under_review' THEN 'diagnosed'
    WHEN status = 'repairable' THEN 'diagnosed'
    WHEN status = 'not_repairable' THEN 'completed'
    WHEN status = 'repaired' THEN 'completed'
    WHEN status = 'needs_parts' THEN 'diagnosed'
    ELSE status  -- keeps 'logged', 'in_repair' as-is
  END;

-- 1.4 Create status history table
CREATE TABLE IF NOT EXISTS repair_item_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_item_id UUID NOT NULL REFERENCES repair_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  diagnosis_assessment TEXT,
  completion_outcome TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by UUID REFERENCES auth.users(id),
  notes TEXT
);

-- Enable RLS
ALTER TABLE repair_item_status_history ENABLE ROW LEVEL SECURITY;

-- Add RLS policies
CREATE POLICY "Status history viewable by authenticated users"
  ON repair_item_status_history FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Status history insertable by authenticated users"
  ON repair_item_status_history FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 1.5 Seed initial history for existing items
INSERT INTO repair_item_status_history (repair_item_id, status, diagnosis_assessment, completion_outcome, changed_at, notes)
SELECT id, status, diagnosis_assessment, completion_outcome, COALESCE(updated_at, created_at), 'Initial status from migration'
FROM repair_items;

-- 1.6 Create trigger for automatic history logging
CREATE OR REPLACE FUNCTION log_repair_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status 
     OR OLD.diagnosis_assessment IS DISTINCT FROM NEW.diagnosis_assessment
     OR OLD.completion_outcome IS DISTINCT FROM NEW.completion_outcome THEN
    INSERT INTO repair_item_status_history (repair_item_id, status, diagnosis_assessment, completion_outcome, changed_by)
    VALUES (NEW.id, NEW.status, NEW.diagnosis_assessment, NEW.completion_outcome, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop existing trigger if exists and create new one
DROP TRIGGER IF EXISTS repair_status_change_trigger ON repair_items;
CREATE TRIGGER repair_status_change_trigger
AFTER UPDATE ON repair_items
FOR EACH ROW EXECUTE FUNCTION log_repair_status_change();

-- 1.7 Update timer auto-status trigger to use new workflow
CREATE OR REPLACE FUNCTION update_repair_status_on_total_hours()
RETURNS TRIGGER AS $$
BEGIN
  -- When total_accumulated_hours exceeds 5 minutes and status is 'diagnosed', move to 'in_repair'
  IF NEW.total_accumulated_hours > 0.0833 AND NEW.status = 'diagnosed' THEN
    NEW.status := 'in_repair';
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;