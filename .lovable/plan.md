# Center the 6-row doc tab block (fix direction + vertical padding)

## What the photo shows
Measured from your print (tab is about 1240 px wide in the photo, roughly 1.5 px per printer dot):
- **Horizontal:** gap left of "Invoice" is about 33 dots, gap right of "Total" is about 74 dots. The block needs to move **right about 20 dots**. My last change pushed it the opposite way.
- **Vertical:** "TRCK" now sits above the perforation, on the main label. "Svcs" overlaps the "Invoice" row. The 4 custom rows hang low, with a big empty band under "DV / Total".
- The block fits: 6 rows of text take about 87 dots of the 152-dot strip, so each of the 7 gaps (top, 5 between rows, bottom) can be about 9 dots.

## Why it went wrong
FedEx builds this label upside down in printer terms, so the printer flips it 180 degrees when printing. On paper, a higher x number goes **left** and a higher y number goes **up**. My math assumed the opposite. That is why the block moved left, TRCK went up past the perforation, and the rows bunched toward the outer edge. My text-width guess was also wrong for FedEx's fonts, which threw off the side measurement.

## The fix
1. Detect the flip (FedEx's 180-degree print setting, or upside-down text on each line) and do all the math in "paper" coordinates, then convert back. So "move right" and "move down toward the outer edge" go the right way.
2. Measure each line's real width and height from its font settings, not from a letter-count guess, so the left and right gaps come out equal.
3. Place the 6 rows in order (TRCK, Svcs, Invoice row, Custo row, Dept row, DV row) with the same gap above the first row, between every row, and below the last row. Keep the 3 columns lined up with each other.
4. Clamp everything inside the ¾" strip so nothing can cross the perforation again.
5. Add a test built from an upside-down label like yours. It checks that the left and right gaps match within 2 dots, the top and bottom gaps match within 2 dots, and all 6 rows are evenly spaced.
6. Redeploy the test-label and live FedEx label functions.

## Fallback if anything is still off
The certification page will get a small "Download label code" link. If one print still looks wrong, I can read the exact FedEx code instead of working from the photo.

## Technical details
- File: `supabase/functions/_shared/fedex-doc-tab.ts` (`adjustDocTabZpl`), plus its `_test.ts`.
- Detect `^POI` globally or field orientation `I` in `^A<font>I,h,w`. When inverted, map to paper space: `px = PW - x - width`, `py = LL - y - height` (FT baseline handled). Compute layout there, then invert back.
- Width: for `^A0` scalable font, width per char is about 0.55 to 0.6 × the w param. For bitmap fonts, use the fixed cell widths. Use `^FB` width when present.
- Region: the strip is the 152 dots at the leading end in paper space. Choose it by where the header anchors land after mapping, not by raw y.
- Rows: group by paper-space top within ±4 dots. Pitch = rowHeight + gap, with gap = (152 − Σheights) / 7.
