-- Enable real-time for repair_items table
ALTER TABLE repair_items REPLICA IDENTITY FULL;

-- Add repair_items to the supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE repair_items;