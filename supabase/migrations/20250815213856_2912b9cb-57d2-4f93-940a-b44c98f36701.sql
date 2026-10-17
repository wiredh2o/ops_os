-- Update permission descriptions to be more specific and detailed

-- Accounting permissions - make them very specific
UPDATE permissions SET description = 'View chart of accounts, account balances, and account histories' WHERE name = 'view_accounting';
UPDATE permissions SET description = 'Create new accounts, edit account details, and archive accounts' WHERE name = 'manage_accounts';
UPDATE permissions SET description = 'Create journal entries, record payments, process invoices, and adjust account balances' WHERE name = 'manage_transactions';
UPDATE permissions SET description = 'Match bank statements with recorded transactions and resolve discrepancies' WHERE name = 'reconcile_accounts';

-- Split transaction management into more specific permissions
INSERT INTO permissions (name, category, description) VALUES 
('create_journal_entries', 'accounting', 'Create manual journal entries and account adjustments'),
('process_payments', 'accounting', 'Record customer payments, vendor payments, and bank transfers'),
('manage_invoices', 'accounting', 'Create, edit, send, and void customer invoices'),
('manage_bills', 'accounting', 'Enter, approve, and pay vendor bills and expenses'),
('view_financial_reports', 'accounting', 'Access profit & loss, balance sheet, and cash flow reports'),
('manage_tax_settings', 'accounting', 'Configure sales tax rates, tax exemptions, and tax reporting'),
('manage_payment_terms', 'accounting', 'Set up payment terms, late fees, and collection policies');

-- Production permissions - more specific
UPDATE permissions SET description = 'View production dashboard, order status, and manufacturing schedules' WHERE name = 'view_production_orders';
UPDATE permissions SET description = 'Create new production orders, modify existing orders, and change order priorities' WHERE name = 'manage_production_orders';
UPDATE permissions SET description = 'View repair ticket details, repair history, and warranty information' WHERE name = 'view_repair_orders';
UPDATE permissions SET description = 'Create repair tickets, assign technicians, update repair status, and close repairs' WHERE name = 'manage_repair_orders';

-- Inventory permissions - more detailed
UPDATE permissions SET description = 'View inventory levels, item details, and stock movement history' WHERE name = 'view_inventory';
UPDATE permissions SET description = 'Add new items, edit item details, adjust quantities, and set reorder points' WHERE name = 'manage_inventory';
UPDATE permissions SET description = 'Bulk import inventory data, update pricing, and synchronize with external systems' WHERE name = 'import_inventory';
UPDATE permissions SET description = 'Create item categories, set up product hierarchies, and manage item classifications' WHERE name = 'manage_inventory_categories';
UPDATE permissions SET description = 'Access demand forecasting, reorder analysis, and inventory performance metrics' WHERE name = 'view_inventory_analytics';

-- Assembly permissions - more specific
UPDATE permissions SET description = 'View assembly definitions, bills of materials, and assembly costs' WHERE name = 'view_assemblies';
UPDATE permissions SET description = 'Create new assemblies, modify assembly definitions, and set assembly pricing' WHERE name = 'manage_assemblies';
UPDATE permissions SET description = 'Add/remove components from assemblies, set quantities, and manage substitutions' WHERE name = 'manage_assembly_components';

-- Purchasing permissions - more detailed
UPDATE permissions SET description = 'View purchase orders, delivery schedules, and receiving status' WHERE name = 'view_purchase_orders';
UPDATE permissions SET description = 'Create purchase orders, approve orders, modify delivery dates, and cancel orders' WHERE name = 'manage_purchase_orders';
UPDATE permissions SET description = 'Add new suppliers, edit contact information, set payment terms, and manage supplier performance' WHERE name = 'manage_suppliers';

-- Customer permissions - more specific
UPDATE permissions SET description = 'View customer profiles, contact information, and order history' WHERE name = 'view_customers';
UPDATE permissions SET description = 'Add new customers, edit customer details, set credit limits, and manage customer status' WHERE name = 'manage_customers';
UPDATE permissions SET description = 'Create pricing tiers, set discount percentages, and assign customers to price levels' WHERE name = 'manage_price_levels';

-- User management permissions - more detailed
UPDATE permissions SET description = 'View user accounts, roles, and access permissions across the system' WHERE name = 'view_users';
UPDATE permissions SET description = 'Create user accounts, assign roles, reset passwords, and deactivate users' WHERE name = 'manage_users';
UPDATE permissions SET description = 'Send user invitations, manage invitation expiry, and resend invitations' WHERE name = 'invite_users';
UPDATE permissions SET description = 'Create, modify, and delete user roles and their associated permissions' WHERE name = 'manage_roles';
UPDATE permissions SET description = 'Grant or revoke specific permissions for roles and individual users' WHERE name = 'manage_permissions';

-- Add receiving-specific permissions
INSERT INTO permissions (name, category, description) VALUES 
('manage_receiving', 'purchasing', 'Process incoming shipments, update received quantities, and handle receiving discrepancies'),
('view_receiving', 'purchasing', 'View incoming packages, delivery schedules, and receiving history');

-- Add shipping-specific permissions  
INSERT INTO permissions (name, category, description) VALUES 
('manage_shipping', 'production', 'Create shipping labels, schedule pickups, and update shipment tracking'),
('view_shipping', 'production', 'View outbound shipments, tracking information, and delivery status');

-- Add more granular inventory permissions
INSERT INTO permissions (name, category, description) VALUES 
('adjust_inventory', 'inventory', 'Perform physical inventory counts and adjust stock quantities'),
('transfer_inventory', 'inventory', 'Move inventory between locations and warehouses'),
('reserve_inventory', 'inventory', 'Allocate inventory for specific orders and manage reservations');