-- Fix search_path for the search_repair_items function
ALTER FUNCTION search_repair_items(text) SET search_path = public;