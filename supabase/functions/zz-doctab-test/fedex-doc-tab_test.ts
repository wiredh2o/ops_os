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

Deno.test("inverted label: 6 rows evenly spaced and block centred on paper", () => {
  const f = (x: number, y: number, t: string) => `^FO${x},${y}^ABN,20,10^FD${t}^FS`;
  // Paper tops wanted wrong on purpose (crowded at top, shifted left on paper).
  const zpl = "^XA^POI^PW812^LL1370" + f(300, 600, "LABEL BODY") +
    f(500, 140, "TRCK: 0000") + f(500, 120, "Svcs: GND") +
    f(620, 100, "Invoice: TEST-1") + f(320, 100, "Date: 25OCT26") + f(60, 100, "Shipping: 14.06") +
    f(620, 80, "Custo: Doe") + f(620, 60, "Dept:") + f(60, 40, "Total: 20.69") + "^XZ";
  const out = adjustDocTabZpl(zpl);
  assertEquals(out.includes("^FO300,600^ABN,20,10^FDLABEL BODY"), true);
  const tab = paperBoxes(out).filter((b) => b.text !== "LABEL BODY");
  const tops = [...new Set(tab.map((b) => b.top))].sort((a, b) => a - b);
  assertEquals(tops.length, 6);
  const gaps = [tops[0] - 1218, ...tops.slice(1).map((t, i) => t - tops[i] - 20), 1370 - (tops[5] + 20)];
  for (const g of gaps) assertEquals(Math.abs(g - gaps[0]) <= 2, true, `gaps ${gaps}`);
  const left = Math.min(...tab.map((b) => b.left)), right = 812 - Math.max(...tab.map((b) => b.right));
  assertEquals(Math.abs(left - right) <= 2, true, `left ${left} right ${right}`);
});
