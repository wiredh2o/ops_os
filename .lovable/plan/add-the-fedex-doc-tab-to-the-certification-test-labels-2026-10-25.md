# Add the FedEx doc tab to the certification test labels

No. The Bar Code Analysis labels still print on plain 4" x 6.75" stock with no tab. FedEx needs the packet to look like your real production labels, so the test labels should get the same tab.

## What changes
- The certification test labels switch to FedEx's 4" x 6.75" stock with a trailing doc tab. The last 3/4" shows the same summary as real labels: Invoice, Custo, Dept, Date, Weight, COD, DV, Shipping, Special, Handling, Total.
- Each scenario fills the tab with test values: Invoice = "TEST-<scenario>", Custo = the Ship To company name, Handling = 0.00. FedEx fills in the date, weight and charges itself.
- After the update, regenerate the test label set. Your saved addresses fill in automatically. Then reprint, check the tab and send the labels to FedEx.

## Technical details
- `supabase/functions/generate-fedex-test-labels/index.ts`: set `labelStockType: 'STOCK_4X675_TRAILING_DOC_TAB'` and add `customerSpecifiedDetail.docTabContent` (ZONE001, the same 11 zones as `create-fedex-shipment`). Keep `BOTTOM_EDGE_OF_TEXT_FIRST`.
- Move the zone list into `supabase/functions/_shared/fedex-doc-tab.ts` so both functions build an identical tab. Then redeploy both.
- If the sandbox rejects the doc-tab request, show the FedEx error on the page and do not generate the labels without the tab.
