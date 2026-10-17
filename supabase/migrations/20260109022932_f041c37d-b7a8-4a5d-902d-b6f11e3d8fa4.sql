-- Reset repair items for Test Company back to diagnosed status so they appear in queue
UPDATE repair_items 
SET status = 'diagnosed'
WHERE id IN (
  SELECT DISTINCT ri.id
  FROM repair_items ri
  JOIN inbound_package_items ipi ON ipi.repair_item_id = ri.id
  JOIN inbound_packages ip ON ipi.package_id = ip.id
  WHERE ip.company_id IN (SELECT id FROM companies WHERE name ILIKE '%Test Company%')
  AND ri.status IN ('queued_for_shipping', 'label_created', 'invoiced')
)