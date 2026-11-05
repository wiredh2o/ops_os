# Customer order becomes the only payable record

## Goal
The customer order is the one place that holds the balance, payment status, deposit and Stripe IDs. Work cards (kanban) only do production and shipping. They link to their customer order and show its payment status.

## Decisions (defaults, since the questions were skipped)
- **Partial shipments:** the customer order keeps one balance. Each shipment links to the order. A shipment no longer has its own payment status. Credit used, credit hold and the tax/shipping locks now read the customer order's balance instead of per-shipment invoices.
- **Shipping & Handling markup:** Settings gets one global markup (percent plus a flat amount). FedEx, UPS and USPS can each override it. The default is 0%/$0, so totals don't change until you set it.
- **Existing orders:** payment info already on work cards is copied onto their linked customer order. A customer order is created for any paid work card that doesn't have one. The old fields stay readable for history but nothing writes to them anymore.

## What changes for users
- At confirmation (web checkout or a phone order), the order gets a carrier quote plus the markup. It's saved as one "Shipping & Handling" line, and that's the amount charged.
- When the label prints, the real carrier cost is saved on the shipment for margin reports only. The customer total stays the same.
- Paying, deposits, payment links, saved-card charges, refunds and Stripe confirmations all update the customer order.
- Kanban cards and the ship window show payment status read from the linked order.

## Technical details
- Migration:
  - Add `production_orders.customer_order_id` (FK, backfilled from `parent_customer_order_id`).
  - Add `customer_orders.total_amount`, `payment_received_at`, `stripe_checkout_session_id`, `payment_token`, `payment_token_expires_at`, `shipping_handling_amount`.
  - Add `production_orders.actual_carrier_cost`.
  - Add a `shipping_handling_markups` settings table (global row plus optional per-carrier rows, with GRANTs and RLS).
  - Backfill payment fields onto customer orders.
  - Add a trigger that rejects writes to payment/Stripe columns on `production_orders`.
  - Rewrite `customer_credit_used`, the credit-hold trigger, the paid-lock triggers and `get_order_by_token`-related lookups to use customer orders.
  - Keep the "paid requires `payment_received_at` and `stripe_payment_intent_id`" rule on `customer_orders`.
- Edge functions retargeted to `customer_orders`: stripe-webhook, process-token-payment, charge-saved-card, create-payment-intent, create-stripe-checkout, send-payment-link, get-order-by-token. The label function's credit precheck reads the order too.
- Frontend: PendingRefundsManager, PaymentSelector, ShipOrderModal, CustomerOrderForm (S&H line at confirmation), ProductionOrderForm, FulfillCustomerOrderModal, and the kanban card badge read through the link. Settings gets a markup editor. `types.ts` regenerates after the migration; it isn't edited by hand.
- Pure `computeShippingHandling(quote, markup)` helper with tests (percent, flat, carrier override over global, no rounding drift).
- Update AGENTS.md and memory: replace the "order vs invoice" and "one invoice = one shipment" credit rules.
- Verification: run a database dry run in a rolled-back transaction covering confirm, deposit, webhook paid, refund, and label with a differing actual cost so the total stays unchanged. Run the unit tests. The signed-in UI walkthrough isn't possible on this external Supabase project.
