import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { adjustDocTabZpl, docTabDate } from "../_shared/fedex-doc-tab.ts";

Deno.test("doc tab date is DDMMMYY", () => {
  assertEquals(docTabDate(new Date(Date.UTC(2026, 9, 24))), "24OCT26");
});

// Inverted (^POI) label like FedEx sends: paper = (812 - x - w, 1370 - y - h).
// Font ^ABN,20,10 -> width = len*10.
function paperBoxes(out: string) {
  return [...out.matchAll(/\^FO(\d+),(\d+)\^ABN,20,10\^FD([^^]*)\^FS/g)].map((m) => {
    const w = m[3].length * 10;
    return { text: m[3], left: 812 - Number(m[1]) - w, right: 812 - Number(m[1]), top: 1370 - Number(m[2]) - 20 };
  });
}

Deno.test("inverted label: tab block moves 63 dots right and 10 down on paper; body stays", () => {
  const f = (x: number, y: number, t: string) => `^FO${x},${y}^ABN,20,10^FD${t}^FS`;
  const zpl = "^XA^POI^PW812^LL1370" + f(300, 600, "LABEL BODY") +
    f(500, 140, "TRCK: 0000") + f(620, 100, "Invoice: TEST-1") + f(60, 40, "Total: 20.69") + "^XZ";
  const out = adjustDocTabZpl(zpl);
  assertEquals(out.includes("^FO300,600^ABN,20,10^FDLABEL BODY"), true);
  assertEquals(out.includes("^FO437,130^ABN,20,10^FDTRCK"), true);
  assertEquals(out.includes("^FO557,90^ABN,20,10^FDInvoice"), true);
  assertEquals(out.includes("^FO0,30^ABN,20,10^FDTotal"), true);
});

Deno.test("normal label: tab block moves +63 x and +10 y", () => {
  const zpl = "^XA^PW812^LL1370^FO40,1240^ABN,20,10^FDInvoice: X^FS^XZ";
  assertEquals(adjustDocTabZpl(zpl).includes("^FO103,1250"), true);
});
