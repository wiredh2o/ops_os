# Even padding on the FedEx doc tab, plus clean-ups from the test print

FedEx draws the doc tab itself, and its API has no padding or margin setting. To get even space around the text, the app will adjust the FedEx label data before it goes to the printer. Your photo also showed three other problems, which this plan fixes too.

## What changes
1. **Equal padding.** The tab text moves away from the shipping label, so the space between the text and the perforation matches the space at the outer edge and both sides. Only the tab text moves. The shipping label, its barcodes and FedEx's TRCK/SVC lines stay exactly where FedEx put them, so certification isn't affected.
2. **Date.** The date now prints as "24OCT26" instead of the cut-off "2026-10-25T00:0".
3. **Shipping charge position.** "Shipping" currently shares a line with Date. It moves to the top of the right-hand column, above Special, Handling and Total, like your original sample.
4. **Custo.** Custo shows the Ship To company name ("Doe" printed because the company name was used as a fallback). On test labels it shows the company from the form.

After the update, regenerate the test labels, print one, and check the spacing.

## Technical details
- First generate one sandbox label and inspect its ZPL. This confirms which `^FO` fields belong to the doc-tab zone (by coordinate and region) and how far they sit from the perforation and the outer edge. The padding is set from those measurements, not guessed.
- Add `adjustDocTabZpl(zpl)` to `supabase/functions/_shared/fedex-doc-tab.ts`. It rewrites only the `^FO`/`^FT` coordinates of fields inside the tab region so the top, bottom, left and right gaps are equal. Then apply it to the decoded label in `generate-fedex-test-labels` and `create-fedex-shipment` before returning or storing the label. Add a Deno test with a sample ZPL snippet that checks the shifted coordinates and that fields outside the tab don't move.
- Date zone: replace the `ShipTimestamp` data field with a literal DDMMMYY value computed server-side.
- Zones: renumber so Shipping is the first zone of the right column (Shipping, Special, Handling, Total). The left column becomes Invoice, Custo, Dept, Date, Weight, COD, DV.
- Redeploy both functions.
