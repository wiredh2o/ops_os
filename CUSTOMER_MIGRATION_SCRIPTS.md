# Customer Migration Helper Scripts

These SQL scripts help you safely migrate customer data during consolidation. Run them in the Supabase SQL Editor in the order shown.

## Two-CSV Approach

**Important**: Customer data is now split into two separate CSV files for cleaner import/export:
1. **Customers CSV** - Contains main customer data (no shipping addresses)
2. **Shipping Addresses CSV** - Contains all shipping addresses linked by customer_number

This approach makes the data easier to edit in spreadsheets and maintains proper relational structure.

---

## Migration Workflow

### Phase 1: Pre-Migration Export
1. **Export current customer data** using the "Export CSV" button
2. **Export shipping addresses** using the "Export Addresses CSV" button
3. **Map old data to new template** in your spreadsheets
   - Edit `customers-export-YYYY-MM-DD.csv` for main customer data
   - Edit `customer-shipping-addresses-export-YYYY-MM-DD.csv` for addresses

### Phase 2: Database Preparation
4. **Run backup script** (Script 1) to preserve package-customer relationships
5. **Orphan packages** (Script 2) - sets all `company_id` to NULL
6. **Delete old customers** (Script 2) - removes all existing customer records

### Phase 3: Data Import
7. **Import customer CSV** using "Import CSV" button (assigns new customer_numbers)
8. **Import shipping addresses CSV** using "Import Addresses CSV" button (links via customer_numbers)

### Phase 4: Package Reassignment
9. **Auto-reassign packages** (Script 3) - reconnects by name matching
10. **Check unmatched packages** (Script 4) - identifies orphans
11. **Manual reassignment** (Script 5) - fix any remaining orphans

### Phase 5: Verification & Cleanup
12. **Verify everything** (Script 6) - confirm all packages are assigned
13. **Restore NOT NULL constraint** (Script 7) - lock down the schema
14. **Drop backup table** (Script 7) - cleanup

---

## CSV File Formats

### Customers CSV Format
**File**: `customers-export-YYYY-MM-DD.csv`

**Columns**:
- `customer_number` - Unique numeric identifier
- `name` - Company name (required)
- `cust_since` - Customer since date (YYYY-MM-DD)
- `owners_name` - Owner's name
- `email` - Email address
- `phone` - Phone number
- `billing_address` - Billing address
- `is_active` - Active status (true/false)
- `is_distributor` - Distributor flag (true/false)
- `is_taxable` - Taxable flag (true/false)
- `preferred_shipping_carrier` - Preferred carrier
- `signature_required` - Signature requirement (true/false)
- `default_shipping_address_name` - Name of default shipping address (read-only reference)
- `sales_tax_license_expires_at` - License expiration date
- `sales_tax_license_url` - License URL

**Note**: The legacy `address` field has been removed. Use `billing_address` for billing addresses and the `shipping_addresses` JSONB array for shipping locations. `default_shipping_address_name` is for reference only and cannot be updated via customer CSV. Use the shipping addresses CSV to manage default addresses.

### Shipping Addresses CSV Format
**File**: `customer-shipping-addresses-export-YYYY-MM-DD.csv`

**Columns**:
- `customer_number` - Links to customer (required)
- `customer_name` - Customer name (for reference)
- `address_name` - Unique name for this address (required)
- `address` - Street address
- `city` - City
- `state` - State/Province
- `zip` - Postal code
- `country` - Country
- `signature_required` - Signature requirement (true/false)
- `is_default` - Mark as default address (true/false)

**Import Modes**:
- **Merge Mode** (default): Updates existing addresses by name, adds new ones
- **Replace All Mode**: Removes all existing addresses and creates only what's in CSV

---

## Script 1: Create Backup Table

**Purpose**: Create a backup of all current package-customer relationships before making any changes.

```sql
-- Run this BEFORE deleting any customers
CREATE TABLE temp_orphaned_packages AS
SELECT 
  ip.id as package_id,
  ip.tracking_number,
  ip.status,
  ip.created_at as package_created_at,
  c.id as old_company_id,
  c.name as company_name,
  c.customer_number as old_customer_number,
  c.owners_name,
  c.email,
  c.phone
FROM inbound_packages ip
JOIN companies c ON ip.company_id = c.id
ORDER BY ip.created_at;

-- Verify backup
SELECT COUNT(*) as total_packages FROM temp_orphaned_packages;
SELECT company_name, COUNT(*) as package_count 
FROM temp_orphaned_packages 
GROUP BY company_name 
ORDER BY package_count DESC;
```

---

## Script 2: Orphan Packages and Delete Customers

**Purpose**: Temporarily orphan all packages and delete all customer records to prepare for fresh import.

```sql
-- Set all inbound_packages.company_id to NULL
UPDATE inbound_packages SET company_id = NULL;

-- Verify orphaning
SELECT COUNT(*) FROM inbound_packages WHERE company_id IS NULL;

-- Delete all customer records
DELETE FROM companies;

-- Verify deletion (should show 0)
SELECT COUNT(*) FROM companies;
```

---

## Script 3: Auto-Reassign Packages by Name Match

**Purpose**: After importing new customer data, automatically reconnect packages to customers by matching names.

```sql
-- Run this AFTER importing customers CSV
UPDATE inbound_packages ip
SET company_id = c.id
FROM temp_orphaned_packages top
JOIN companies c ON c.name = top.company_name
WHERE ip.id = top.package_id;

-- Check how many were reassigned
SELECT 
  COUNT(*) as reassigned_count 
FROM inbound_packages 
WHERE company_id IS NOT NULL;

SELECT 
  COUNT(*) as still_orphaned 
FROM inbound_packages 
WHERE company_id IS NULL;

-- Show reassignment summary
SELECT 
  c.customer_number,
  c.name,
  COUNT(ip.id) as packages_assigned
FROM companies c
LEFT JOIN inbound_packages ip ON ip.company_id = c.id
GROUP BY c.customer_number, c.name
ORDER BY c.customer_number;
```

---

## Script 4: Show Unmatched Packages

**Purpose**: Identify any packages that couldn't be auto-matched and need manual reassignment.

```sql
SELECT 
  top.package_id,
  top.tracking_number,
  top.company_name as old_company_name,
  top.old_customer_number,
  top.owners_name,
  top.email
FROM temp_orphaned_packages top
LEFT JOIN inbound_packages ip ON ip.id = top.package_id
WHERE ip.company_id IS NULL
ORDER BY top.tracking_number;
```

---

## Script 5: Manual Reassignment Template

**Purpose**: Use this template to manually assign orphaned packages to the correct customers.

```sql
-- First, find the correct customer UUID
SELECT id, customer_number, name, owners_name 
FROM companies 
WHERE name ILIKE '%search-term%' 
ORDER BY customer_number;

-- Then assign the package
UPDATE inbound_packages 
SET company_id = 'PASTE-NEW-COMPANY-UUID-HERE'
WHERE id = 'PASTE-PACKAGE-UUID-HERE';

-- Verify the assignment
SELECT 
  ip.tracking_number,
  c.customer_number,
  c.name as customer_name
FROM inbound_packages ip
JOIN companies c ON c.id = ip.company_id
WHERE ip.id = 'PASTE-PACKAGE-UUID-HERE';
```

---

## Script 6: Verification Queries

**Purpose**: Verify all packages are properly assigned and data looks correct.

```sql
-- Verify NO orphaned packages remain
SELECT COUNT(*) as orphaned_count 
FROM inbound_packages 
WHERE company_id IS NULL;
-- Should return 0

-- Show customer numbers are sequential
SELECT customer_number, name, cust_since
FROM companies
ORDER BY customer_number
LIMIT 20;

-- Show package-customer relationships
SELECT 
  c.customer_number,
  c.name as customer_name,
  COUNT(ip.id) as package_count
FROM companies c
LEFT JOIN inbound_packages ip ON ip.company_id = c.id
GROUP BY c.customer_number, c.name
ORDER BY c.customer_number;

-- Show total package count (should be 17)
SELECT COUNT(*) as total_packages FROM inbound_packages;

-- Show packages with their assigned customers
SELECT 
  ip.tracking_number,
  ip.status,
  ip.created_at,
  c.customer_number,
  c.name as customer_name
FROM inbound_packages ip
JOIN companies c ON c.id = ip.company_id
ORDER BY ip.created_at DESC;
```

---

## Script 7: Restore NOT NULL Constraint

**Purpose**: Once you're 100% satisfied all packages are correctly assigned, restore the database constraint and cleanup.

**⚠️ WARNING**: Only run this when you're absolutely sure all packages are correctly assigned. After running this, you can no longer have orphaned packages.

```sql
-- Make company_id required again
ALTER TABLE inbound_packages 
ALTER COLUMN company_id SET NOT NULL;

-- Drop backup table
DROP TABLE temp_orphaned_packages;

-- Verify constraint is active
SELECT 
  column_name,
  is_nullable,
  data_type
FROM information_schema.columns
WHERE table_name = 'inbound_packages' 
AND column_name = 'company_id';
-- is_nullable should show 'NO'
```

---

## Script 8: Emergency Rollback

**Purpose**: If something goes wrong during migration, use this to restore original relationships.

**⚠️ CAUTION**: This assumes you still have the `temp_orphaned_packages` backup table.

```sql
-- EMERGENCY ROLLBACK - Restore original company_id values
UPDATE inbound_packages ip
SET company_id = top.old_company_id
FROM temp_orphaned_packages top
WHERE ip.id = top.package_id;

-- Verify rollback
SELECT 
  COUNT(*) as packages_with_original_assignments
FROM inbound_packages ip
JOIN temp_orphaned_packages top ON ip.id = top.package_id
WHERE ip.company_id = top.old_company_id;
-- Should match total package count (17)

-- Show restored relationships
SELECT 
  ip.tracking_number,
  c.name as restored_customer_name,
  top.company_name as original_name,
  CASE 
    WHEN c.name = top.company_name THEN '✓ Match'
    ELSE '✗ Mismatch'
  END as verification
FROM inbound_packages ip
JOIN companies c ON c.id = ip.company_id
JOIN temp_orphaned_packages top ON top.package_id = ip.id
ORDER BY ip.tracking_number;
```

---

## Notes

- **Backup Before Everything**: Always create the backup table (Script 1) before making any destructive changes
- **Test Queries First**: Run SELECT queries before UPDATE/DELETE to verify what will be affected
- **Keep Backup Table**: Don't drop `temp_orphaned_packages` until you're 100% confident
- **Document Mappings**: Keep a spreadsheet showing old names → new names for reference
- **Rollback Ready**: Know how to use Script 8 if needed
- **Timing**: Entire migration should take 20-30 minutes with proper preparation

## Migration Checklist

- [ ] Export current customer data
- [ ] Map data in spreadsheet (old → new)
- [ ] Run Script 1 (backup)
- [ ] Verify backup has 17 records
- [ ] Run Script 2 (orphan + delete)
- [ ] Verify 0 customers, 17 orphaned packages
- [ ] Import new customer CSV
- [ ] Verify customer numbers start at 25001
- [ ] Run Script 3 (auto-reassign)
- [ ] Run Script 4 (check unmatched)
- [ ] Run Script 5 (manual fixes if needed)
- [ ] Run Script 6 (full verification)
- [ ] Verify 0 orphaned packages
- [ ] Test application functionality
- [ ] Run Script 7 (restore constraint)
- [ ] Drop backup table
- [ ] Done! 🎉
