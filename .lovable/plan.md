# Count shipping in available credit

## What you will get
- **Open orders (not yet invoiced):** the estimated shipping on the order counts against available credit, on top of the item amounts.
- **Invoices:** once shipping is known, the invoice's shipping counts. Before any label is bought, the order's estimate counts instead.
- **Price changes:** if the real shipping price is different from the estimate, the real price replaces it. Available credit updates right away.
- **Multiple shipments:** each box or shipment's charge adds up. The total of all shipments for the invoice is what counts, not just the first or last one.
- **Shipping is never counted twice.** For example, an estimate on the order and the real charge on the invoice are not both counted.
- The credit-hold check uses the same figure, so a big shipping charge can put an order on hold, and a lower one can lift a hold.

## Steps
1. Check how shipping reaches an invoice today. Is it already part of the invoice total, a separate freight line, or only the carrier's cost on the order and on each shipment? Then pick the one figure that counts as what the customer is charged.
2. Update the single server credit calculation:
   - Unpaid invoices count items + tax + shipping. Shipping is the sum of all shipments when any exist, otherwise the estimate.
   - Open orders (cash basis) add their estimated shipping.
3. Keep the order form's credit check in step with this by adding the estimated shipping before comparing to available credit.
4. Add tests for these cases: estimate counts before shipping; real price replaces the estimate; two shipments add together; no double counting when shipping is already in the invoice total.

## Technical details
- Function to change: `public.customer_credit_used`. Today it sums `production_orders.total_amount + tax_amount - credit_applied - deposit` and, on cash basis, uninvoiced `customer_order_items`. It does not reference `shipping_cost`, `production_order_shipments.shipping_cost` or `customer_orders.estimated_shipping`.
- Shipping per invoice = `COALESCE(sum(production_order_shipments.shipping_cost), production_orders.shipping_cost)`. Add it only if step 1 shows `total_amount` excludes it. If shipping is billed through a FREIGHT labor line instead, that line already counts and only the estimate fallback is added.
- Open orders add `customer_orders.estimated_shipping` for orders not yet fully invoiced. Partially invoiced orders don't add it again, because their invoice already carries shipping.
- No new tables. `get_customer_credit` and `production_order_credit_hold` pick up the change automatically. Add tests to `credit-rules.test.ts` using a pure `shippingForCredit()` helper that mirrors the SQL.
