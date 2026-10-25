import { describe, expect, it } from "vitest";
import { docTabRows, formatDocTabDate } from "./doc-tab";

describe("doc tab", () => {
  it("formats the date like 23OCT26", () => {
    expect(formatDocTabDate(new Date(2026, 9, 23))).toBe("23OCT26");
  });

  it("totals shipping + special + handling", () => {
    const { right } = docTabRows({
      invoice: "50762", customer: "Acme", date: new Date(2026, 9, 23), weightLbs: 4,
      shipping: 12.98, special: 23.33, handling: 0,
    });
    expect(right.find(([k]) => k === "Total")?.[1]).toBe("36.31");
  });
});
