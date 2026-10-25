import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { adjustDocTabZpl, docTabDate } from "./fedex-doc-tab.ts";

Deno.test("doc tab date is DDMMMYY", () => {
  assertEquals(docTabDate(new Date(Date.UTC(2026, 9, 24))), "24OCT26");
});

Deno.test("tab text is centred in its 3/4 inch strip; label fields don't move", () => {
  // Label 1370 long, tab = 1218..1370. Text spans 1222..1302 (80 tall) -> pad 36.
  const zpl = "^XA^LL1370^FO40,100^A0N,40,40^FDLABEL^FS" +
    "^FO10,1222^A0N,20,20^FDInvoice: X^FS^FO10,1282^A0N,20,20^FDDate: 24OCT26^FS^XZ";
  const out = adjustDocTabZpl(zpl);
  assertEquals(out.includes("^FO40,100^A0N,40,40^FDLABEL"), true);
  assertEquals(out.includes("^FO36,1254^A0N,20,20^FDInvoice"), true);
  assertEquals(out.includes("^FO36,1314^A0N,20,20^FDDate"), true);
});
