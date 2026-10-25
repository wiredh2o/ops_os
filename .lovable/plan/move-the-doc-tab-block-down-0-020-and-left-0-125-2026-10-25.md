# Move the doc tab block down 0.020" and left 0.125"

## What changes
On every FedEx label, both the certification test labels and real shipments, the 6-row doc tab block moves:
- **Down another 0.020"**, which is 4 printer dots. Total move down becomes 0.100" (20 dots).
- **Left 0.125"**, which is 25 printer dots. Total move right becomes 0.1875" (38 dots).
- Nothing else on the label changes.

## Steps
1. Change the down setting from 16 to 20 dots and the right setting from 63 to 38 dots.
2. Update the test values to match.
3. Run the test, then redeploy both FedEx label functions.

## Technical details
- `supabase/functions/_shared/fedex-doc-tab.ts`: `TAB_SHIFT_RIGHT_DOTS = 38` (0.1875"), `TAB_SHIFT_DOWN_DOTS = 20` (0.100").
- `fedex-doc-tab_test.ts`: inverted expectations become `^FO462,120` (TRCK), `^FO582,80` (Invoice), `^FO22,20` (Total); normal-label case becomes `^FO78,1260`. Test names updated to "38 right / 20 down".
