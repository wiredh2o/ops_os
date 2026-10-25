# Credit limits, payment terms and credit hold

## What you will get
- **Terms list in Settings (admin only).** A list of standard terms. Each one has a name, the number of days to pay, an optional deposit percent, and a switch for whether it uses credit. It starts with your current four terms: Due in Advance, 50% Down / 50% Before Ship, Net 15 and Net 30. Customers keep the terms they have now. A term in use can be turned off but not deleted.
- **Customer form.** The terms picker and a credit limit box (starts at $0.00) appear only for admin, accounting and the tenant's admin. Changes take effect right away.
- **Customer list and order/invoice screens.**
  - Sales, marketing, admin, accounting and tenant admin see **Credit limit** and **Available credit**.
  - Only admin, accounting and tenant admin can change them.
  - Everyone else sees neither.
  - Hiding happens on the server, so the numbers never reach a screen that shouldn't show them.
- **Credit hold instead of blocking.** An order on credit terms is always accepted, whether staff or the online store enters it. If it costs more than the available credit, it gets a **Credit Hold** badge. Every step can still happen (allocation, production, packing, invoicing) except shipping. Rates can still be quoted, but no label can be bought and nothing can be marked shipped. The hold lifts by itself as soon as enough credit frees up, for example after a payment or a higher limit.
- **Accounting basis setting (per tenant).**
  - **Cash basis** (WashGear's setting, and the default) counts unpaid invoices plus open orders not yet invoiced against the limit.
  - **Accrual basis** counts unpaid invoices only.
  - In both cases, credit is used until the payment is actually received.
- **Who counts as "tenant admin":** the existing admin role of the company running the app. Distributor and vendor admins are customers, so they can't set their own limits or terms. Adding roles for running the whole platform is listed as a separate future task.

## Steps
1. Add the terms list, the accounting basis setting, and server checks for who can read or change limits and terms.
2. Add one server calculation for a customer's credit used, available credit and hold status, used by every screen.
3. Block label purchase and "shipped" status on the server while an order is on credit hold. This covers all carriers and the shipping screen.
4. Build the terms list in Settings, and the terms and limit fields on the customer form.
5. Show credit on the customer list, the order form, the customer order card, the shipping screen and the payment selector, following the visibility rules above.
6. Replace the four built-in terms in the code with the settings list. The current deposit and due-date behavior is kept by reading each term's days and deposit percent.
7. Add tests for the rules: $0.00 default, cash vs accrual totals, the hold trigger and its release, and which roles see what.

## Technical details
- New table `payment_terms`: company_id, code, label, net_days, deposit_percent, uses_credit, active, sort_order. It gets GRANTs and RLS: company members can read it, only `admin` can write it. Seeded per company with the current codes (`due_in_advance`, `fifty_fifty`, `net_15`, `net_30`) so existing `companies.payment_terms` values stay valid.
- `system_settings` key `credit_accounting_basis` (`cash` | `accrual`), default `cash`.
- `companies.credit_limit` gets default 0 and NOT NULL, with existing nulls set to 0. Column SELECT/UPDATE on `credit_limit` and `payment_terms` is revoked from `authenticated`. Writes go through the `set_customer_credit_terms` RPC (admin/accounting check plus tenant scope, and it validates the code against active `payment_terms`).
- RPC `get_customer_credit(company_ids uuid[])` (security definer). It returns credit_limit, available_credit and on_hold to sales_support/marketing/admin/accounting, and nothing to other roles. It uses the shared private function `customer_credit_used(company_id)`, which follows the basis setting.
- The order-level hold is computed live (no stored flag to drift): `production_order_credit_hold(order_id)`. A trigger on `production_orders` rejects setting `label_created_at`/tracking numbers or `status` in (`label_staged`, `shipped`) while the order is on hold. The FedEx/UPS/USPS label functions also call it first and return a clear "Credit hold" reason.
- Front end: a `useCustomerCredit` hook, a `CreditStatus` display component, and a pure `credit-rules.ts` with `node --test` tests. `PaymentTermsBadge`, `PaymentSelector` and `ShipOrderModal` read term attributes from settings instead of string matches.
- roadmap.md: "Platform-level SaaS admin roles" stays open until the user decides on it.
