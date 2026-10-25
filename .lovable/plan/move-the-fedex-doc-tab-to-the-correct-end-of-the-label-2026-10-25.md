# Move the FedEx doc tab to the correct end of the label

The tab is printing at the wrong end of the 4" x 6.75" label. FedEx sells two kinds of doc-tab stock: "trailing" and "leading". The app asks for trailing. Your printer feeds labels bottom-edge first, so the tab comes out at the wrong end. Switching to leading puts it back on the bottom 3/4", where your roll has the perforation.

## What changes
- FedEx certification test labels and real FedEx shipping labels both move the tab to the other end. The label body and the tab contents stay the same.
- After the update, regenerate the test label set, print one, and check that the tab sits on the perforated 3/4" strip.

## Technical details
- `supabase/functions/_shared/fedex-doc-tab.ts`: change `labelStockType` from `STOCK_4X675_TRAILING_DOC_TAB` to `STOCK_4X675_LEADING_DOC_TAB`. Keep orientation `BOTTOM_EDGE_OF_TEXT_FIRST` (the main label is already correct).
- Redeploy `generate-fedex-test-labels` and `create-fedex-shipment`.
- If the label body ends up inverted after the switch, change orientation instead and keep the trailing stock. That decision will come from your printed test.
