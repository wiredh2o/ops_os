// Pure layout rules for printing vendor checks on 8.5" x 11" three-part stock:
// check on the top third, two identical stubs on the bottom two-thirds.
// All measurements are inches; the PDF renderer converts to points.

export const PAGE_WIDTH_IN = 8.5;
export const PAGE_HEIGHT_IN = 11;
export const PART_HEIGHT_IN = PAGE_HEIGHT_IN / 3; // 3.667" check, then two stubs

// E-13B: 8 characters per inch, counted from the check's right edge.
export const MICR_PITCH_IN = 0.125;
export const MICR_RIGHT_MARGIN_IN = 5 / 16;   // position 1 starts 5/16" from the right edge
export const MICR_BASELINE_IN = 0.25;          // character bottoms sit 1/4" above the check's bottom edge (inside the 5/8" clear band)
export const MICR_FONT_SIZE_PT = 12;           // GnuMICR glyph advance 0.751 em -> 12pt = 0.125"

// GnuMICR symbol characters
export const MICR_TRANSIT = 'A';
export const MICR_ON_US = 'C';

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function under1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) { parts.push(`${ONES[Math.floor(n / 100)]} Hundred`); n %= 100; }
  if (n >= 20) { parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '')); }
  else if (n > 0) parts.push(ONES[n]);
  return parts.join(' ');
}

/** "One Thousand Two Hundred Thirty-Four and 56/100" */
export function amountInWords(amount: number): string {
  const totalCents = Math.round(amount * 100);
  if (totalCents < 0) throw new Error('Amount cannot be negative');
  let dollars = Math.floor(totalCents / 100);
  const cents = totalCents % 100;
  if (dollars === 0) return `Zero and ${String(cents).padStart(2, '0')}/100`;
  const scales = ['', 'Thousand', 'Million', 'Billion'];
  const words: string[] = [];
  let i = 0;
  while (dollars > 0) {
    const chunk = dollars % 1000;
    if (chunk) words.unshift(under1000(chunk) + (scales[i] ? ` ${scales[i]}` : ''));
    dollars = Math.floor(dollars / 1000);
    i++;
  }
  return `${words.join(' ')} and ${String(cents).padStart(2, '0')}/100`;
}

/** ABA routing number checksum: 3-7-1 weights must total a multiple of 10. */
export function isValidRoutingNumber(routing: string): boolean {
  if (!/^\d{9}$/.test(routing)) return false;
  const d = routing.split('').map(Number);
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
  return sum % 10 === 0;
}

export function isValidCheckAccountNumber(acct: string): boolean {
  return /^[0-9-]{4,17}$/.test(acct);
}

export interface MicrChar { char: string; position: number } // position 1 = rightmost

/**
 * Business-check MICR line, placed by field position from the right edge:
 *   aux on-us (check number) | transit (routing) positions 43-33 | on-us (account) ending at 14 | amount field 1-12 left blank for the bank.
 * Account dashes print as spaces-free digits; the GnuMICR dash symbol is 'D'.
 */
export function micrLine(routing: string, account: string, checkNumber: number): MicrChar[] {
  if (!isValidRoutingNumber(routing)) throw new Error('Routing number is not valid');
  if (!isValidCheckAccountNumber(account)) throw new Error('Account number is not valid');
  const out: MicrChar[] = [];
  const place = (text: string, rightmostPosition: number) => {
    const chars = text.split('');
    chars.forEach((c, idx) => out.push({ char: c, position: rightmostPosition + (chars.length - 1 - idx) }));
  };
  const onUs = account.replace(/-/g, 'D') + MICR_ON_US;          // account then on-us symbol
  place(onUs, 14);
  place(`${MICR_TRANSIT}${routing}${MICR_TRANSIT}`, 33);          // positions 33..43
  const aux = `${MICR_ON_US}${String(checkNumber).padStart(6, '0')}${MICR_ON_US}`;
  place(aux, 45);                                                  // one blank at 44
  if (14 + onUs.length - 1 >= 33) throw new Error('Account number is too long for the MICR line');
  return out.sort((a, b) => b.position - a.position);
}

/** Left x (inches from the check's left edge) of a MICR character at a field position. */
export function micrCharX(position: number, checkWidthIn = PAGE_WIDTH_IN): number {
  return checkWidthIn - MICR_RIGHT_MARGIN_IN - position * MICR_PITCH_IN;
}

/** "**1,234.56" style protected amount. */
export function protectedAmount(amount: number): string {
  return '**' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export interface StubLine { billNumber: string; poNumber: string; billDate: string; billAmount: number; paid: number }

export function stubTotal(lines: StubLine[]): number {
  return Math.round(lines.reduce((s, l) => s + l.paid, 0) * 100) / 100;
}

/** Top-left (inches from the page top) of each of the three parts. */
export function partTops(): { check: number; stub1: number; stub2: number } {
  return { check: 0, stub1: PART_HEIGHT_IN, stub2: PART_HEIGHT_IN * 2 };
}
