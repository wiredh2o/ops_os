# Nudge the doc tab block down another 0.030"

## What changes
On every FedEx label, both the certification test labels and real shipments, the 6-row doc tab block moves down another 0.030", which is 6 printer dots at 203 dpi.
- Total move down: 0.080" (16 dots).
- The move to the right stays at 0.3125" (63 dots).
- Nothing else on the label changes.

## Steps
1. Change the down-shift setting from 10 to 16 dots.
2. Update the test values to match the new amount.
3. Run the test, then redeploy both FedEx label functions.

## Technical details
- `supabase/functions/_shared/fedex-doc-tab.ts`: `TAB_SHIFT_DOWN_DOTS = 16` (0.080").
- `fedex-doc-tab_test.ts`: inverted expectations become y 124 / 84 / 24, and the normal-label case becomes `^FO103,1256`.
