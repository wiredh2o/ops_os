# Print vendor checks on top-third check stock

Print one 8.5" x 11" page per check: the full check in the top third, and two identical stubs in the bottom two-thirds. Everything prints except the signature, so blank check stock works without pre-printing in EZ-Check.

## Current state
- The Accounting screen has no "pay with check" action yet, and checking accounts have only a name and an account number. There is no bank routing number, bank address, or check numbering stored anywhere.
- The PO bills and payments just built can already record a check payment against a bill. Check printing will build on that instead of adding a new module.

## What you will see

**Settings, System tab: checking account check details** (admin and accounting)
For each checking account: bank name and address, routing number (9 digits, checked with the bank checksum), account number, next check number, company name and address as printed, optional logo, and print nudge (fine up/down/left/right offsets for your printer).

**Accounting screen: "Pay with check"**
- Pick an open vendor bill (or a PO, for an advance). Payee, amount and memo (PO and vendor invoice numbers) fill in automatically. You pick the checking account and date.
- Check number comes from that account's next check number and goes up by one each time.
- Saving records the payment against the bill (same rules as now: no overpaying, earliest bill first) and opens the PDF to print.
- **Reprint** for an already-issued check, and **Void** (keeps the number used, reverses the payment).

**Purchase Order form**
- Bills from a PO keep their link. A **Pay with check** button on each open bill opens the same check dialog with that bill picked.

## The printed page (top third = check)
- Top left: logo, company name and address. Top center: bank name and address. Top right: check number and date.
- "Pay to the order of" with the vendor name, the amount in numbers in a box, the amount in words on the line below with a fill line, vendor mailing address in the window area, memo line.
- Signature line left blank.
- MICR line at the bottom: routing number, account number and check number in E-13B font, at the standard bank position (bottom 5/8" of the check).
- **Both stubs:** company and vendor name, check number, date, check total, and a table of what is paid: bill or vendor invoice number, PO number, bill date, bill amount, amount paid on this check.

## Things you need to know
- Banks read the MICR line magnetically. Most banks accept laser-printed MICR, but some require MICR toner. Ask your bank, or print a test and have them check it.
- Each check's PDF is generated in the browser at print time. Print at "Actual size" (100%), not "Fit to page". The nudge settings fix small printer offsets.

## Technical details
- Migration: add check columns to `accounts` (bank_name, bank_address, routing_number, check_account_number, next_check_number, check_company_name, check_company_address, check_logo_path, print_offset_x/y), editable only by admin/accounting; add `check_number`, `payee_name`, `memo`, `voided_at` to `vendor_payments`; unique (account_id, check_number).
- `issue_vendor_check` RPC (private implementation, public invoker wrapper, like the other bill RPCs): locks the account, takes the next number, records the payment through the existing payment rules, returns the check data. `void_vendor_check` reverses it.
- `src/lib/check-layout.ts` (pure): amount-in-words, routing checksum, MICR line string, stub rows, page coordinates for a three-part 8.5x11 page. Tested with node:test.
- PDF via `pdf-lib` with the free GnuMICR E-13B font bundled as an app asset; rendered at exact inch positions.
- Edits: `AccountingDashboard.tsx` (Pay with check, reprint, void), `SystemSettings.tsx` and `Settings.tsx` (check details), `POReceiptsBillsPanel.tsx`, `PurchaseOrderForm.tsx` and `PurchaseOrderManagement.tsx` (bill links and Pay with check button). New small files only for the pure layout helper and font asset.

## Assumptions to confirm
- "Two identical stubs" means the same details on both (one to mail with the check, one for your files).
- Check numbers are tracked per checking account.
