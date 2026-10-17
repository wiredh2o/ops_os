-- Update all saved email templates with new logo size (33% smaller) and bottom alignment
UPDATE system_settings 
SET setting_value = REPLACE(
  REPLACE(
    REPLACE(setting_value, 
      'align-items: center', 
      'align-items: flex-end'),
    'width: 80px',
    'width: 53px'),
  'width="53"',
  'width="35"'
),
updated_at = now()
WHERE (setting_key LIKE 'email_%_body' OR setting_key LIKE 'po_email_%')
AND setting_value LIKE '%company_logo%';

-- Also update height attributes for edge function templates stored in DB
UPDATE system_settings 
SET setting_value = REPLACE(setting_value, 'height="53"', 'height="35"'),
updated_at = now()
WHERE (setting_key LIKE 'email_%_body' OR setting_key LIKE 'po_email_%')
AND setting_value LIKE '%height="53"%';