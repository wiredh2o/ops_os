# Move the doc tab block by fixed amounts

## What changes
On every FedEx label, both the certification test labels and real shipments, the 6-row doc tab block moves:
- **Down 0.050"**, away from the perforation. That is 10 printer dots at 203 dpi.
- **Right 0.3125"**. That is 63 printer dots.

The automatic centering doesn't work on real FedEx labels, so it comes out. Each line starts from where FedEx puts it and moves by exactly these amounts. Nothing else on the label moves.

## Steps
1. Replace the centering logic with a fixed nudge that applies only to the text inside the doc tab.
2. Go by how the label comes out on paper, which is flipped from how FedEx builds it, so "down" and "right" go the right way.
3. Keep the two amounts as named settings, so a later tweak is a one-number change.
4. Update the test to check that the tab lines move exactly 63 dots right and 10 dots down on paper, and that the label body doesn't move.
5. Redeploy both FedEx label functions.

## Technical details
- File: `supabase/functions/_shared/fedex-doc-tab.ts`: `adjustDocTabZpl` adds constants `TAB_SHIFT_RIGHT_DOTS = 63` and `TAB_SHIFT_DOWN_DOTS = 10`.
- For inverted fields (`^POI` or font orientation `I`), label coordinates become `x -= 63` and `y -= 10`. For normal fields, `x += 63` and `y += 10`. Values never go below 0.
- Tab fields are found as they are now: header anchors, TRCK/Svcs included, within the 152-dot strip in paper space.
