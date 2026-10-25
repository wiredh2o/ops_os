import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { adjustDocTabZpl, docTabDate } from "../_shared/fedex-doc-tab.ts";

Deno.test("doc tab date is DDMMMYY", () => {
  assertEquals(docTabDate(new Date(Date.UTC(2026, 9, 24))), "24OCT26");
});

Deno.test("all 6 tab rows get equal gaps and the block is centred; label fields don't move", () => {
  // Label 1370 long, tab = 1218..1370. Six rows, each 20 tall (total 120).
  // gap = floor((152-120)/7) = 4; start = 1218 + floor((152-(120+4*5))/2) = 1222.
  // New row tops: 1222, 1246, 1270, 1294, 1318, 1342.
  const row = (top: number, text: string) => `^FO10,${top}^A0N,20,20^FD${text}^FS`;
  const zpl = "^XA^LL1370^FO40,100^A0N,40,40^FDLABEL^FS" +
    row(1220, "TRCK: 7946") + row(1230, "Svcs: GND PPD") +
    row(1240, "Invoice: TEST-1") + row(1250, "Custo: Doe") +
    row(1260, "Dept:") + row(1270, "Total: 20.69") + "^XZ";
  const out = adjustDocTabZpl(zpl);
  assertEquals(out.includes("^FO40,100^A0N,40,40^FDLABEL"), true);
  for (const [text, top] of [["TRCK", 1222], ["Svcs", 1246], ["Invoice", 1270], ["Custo", 1294], ["Dept", 1318], ["Total", 1342]] as const) {
    assertEquals(out.includes(`^FO10,${top}^A0N,20,20^FD${text}`), true, `${text} at ${top}`);
  }
});
