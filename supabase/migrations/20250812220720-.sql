BEGIN;
-- Harden: ensure all public functions have an explicit search_path
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN 
    SELECT n.nspname AS schema_name, p.proname AS func_name, oidvectortypes(p.proargtypes) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path TO %L', r.schema_name, r.func_name, r.args, '');
  END LOOP;
END$$;
COMMIT;