# Turn received POs into bills, record PO payments, link manual receipts

All changes extend the existing Purchase Order screen and the two existing receiving windows. No new screens.

## What you will see

**Purchase Orders list**
- A PO can have many item receipts (one per shipment that arrives). Each receipt has a **Bill received** switch the user turns on once the vendor's bill arrives, which turns that item receipt into a bill.
- One PO can produce several item receipts and so several bills. Each bill covers only the items on its receipt: received quantity times unit cost, plus any tax and shipping on the vendor's bill. You enter the vendor's invoice number, bill date and due date (the amounts can be adjusted to match the vendor's bill).
- A new **Bill** column/badge: No bill, Open, Partially paid, Paid.
- Each received item can be billed only once: an item already on a bill can't go on another bill, but one PO can have several bills for partial shipments. When a vendor ships more than the PO ordered, the extra quantity is received and billed normally, flagged as **Over-shipped** on the receipt and bill, with no error or blocked step. When a vendor ships a few pieces short, the receipt and bill cover only what arrived and the line is flagged **Under-shipped**; the missing pieces either stay open on the PO for a later shipment, or the user marks them **Short-closed** so the PO can close without them.

**Purchase Order form**
- New **Payments** section: lists every payment and the balance due.
- **Record payment** button: amount, date, method (check, ACH, card, cash), paid-from account (bank or credit-card account from your chart of accounts), and reference.
- Payments made before the PO is billed are marked **Advance**. When the bill is created, advances are applied to it automatically.
- A payment can't exceed the remaining balance (advances can't exceed the PO total).

**Receiving windows (Log Package and Open Box)**
- The current manual receipt path is unchanged.
- New optional **Link to** field on a manual receipt: either
  - an existing **PO** (searchable by PO number or vendor), or
  - a **credit-card transaction** (searchable by date, amount, description, from credit-card accounts).
- The link shows on the package card and can be changed or removed later.

## Who can do it
- Convert to bill and record payments: admin and accounting.
- Link a receipt: anyone who can already create receipts.
- Bill and payment amounts are hidden from staff without financial access (same rule as other financial displays).

## Technical details
- New table `vendor_bills` (company_id, purchase_order_id, receipt_id unique, bill_number, bill_date, due_date, subtotal, tax, shipping, total, status) with `vendor_bill_items` (bill_id, receipt line, po item, quantity, unit_cost, is_over_shipment; each receipt line billable once via unique constraint), and `vendor_payments` (purchase_order_id, bill_id nullable, amount, paid_at, method, account_id → accounts, reference, is_advance). GRANTs + RLS via `has_role` (admin, accounting; read for financial viewers).
- Item receipts per PO use the existing receiving records (`receiving_items`), grouped per arrival; quantity above the PO line's remaining ordered amount is recorded as over-shipped instead of rejected.
- `convert_receipt_to_bill(receipt_id, ...)` security-definer RPC (fired by the Bill received switch): bills only that receipt's unbilled lines, applies unapplied PO advances, writes a `transactions` + `transaction_lines` entry (Inventory debit / Accounts Payable credit). Payments post AP debit / bank-or-card credit.
- Trigger keeps bill status (open/partial/paid) in sync with payment sum; rejects overpayment.
- `inbound_packages` gains `linked_purchase_order_id` and `linked_transaction_id` (nullable; at most one set, enforced by trigger; transaction must belong to a credit-card account in the same company).
- Pure helpers in `src/lib/vendor-bill-rules.ts` (bill amount, over-shipment split, billed-once check, balance, advance application, status) with node:test tests.
- Edits: `PurchaseOrderManagement.tsx`, `PurchaseOrderForm.tsx`, `UnifiedPackageModal.tsx`, `UnifiedOpenBoxModal.tsx`, `InboundPackageCard.tsx` (link display); AGENTS.md rule.

## Confirmed decisions
- Bill is for received quantities, not ordered quantities.
- Advances apply to the earliest open bill first.
