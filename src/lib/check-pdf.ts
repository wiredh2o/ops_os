import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {
  PAGE_HEIGHT_IN, PAGE_WIDTH_IN, PART_HEIGHT_IN, MICR_BASELINE_IN, MICR_FONT_SIZE_PT,
  amountInWords, micrCharX, micrLine, partTops, protectedAmount, stubTotal, type StubLine,
} from './check-layout';

export interface CheckData {
  companyName: string;
  companyAddress: string;
  logoUrl?: string | null;
  bankName: string;
  bankAddress: string;
  routingNumber: string;
  accountNumber: string;
  checkNumber: number;
  date: string;          // display date
  payee: string;
  payeeAddress?: string | null;
  amount: number;
  memo?: string | null;
  stubLines: StubLine[];
  offsetXIn?: number;    // printer nudge, + moves right
  offsetYIn?: number;    // + moves down
  voided?: boolean;
}

const PT = 72;
const ink = rgb(0, 0, 0);
const grey = rgb(0.35, 0.35, 0.35);

async function loadLogo(pdf: PDFDocument, url: string) {
  try {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    return isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  } catch { return null; }
}

/** One letter-size page: check on top third, two identical stubs below. Signature is left blank. */
export async function buildCheckPdf(d: CheckData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`Check ${d.checkNumber}`);
  const page = pdf.addPage([PAGE_WIDTH_IN * PT, PAGE_HEIGHT_IN * PT]);
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const micrBytes = new Uint8Array(await (await fetch('/fonts/GnuMICR.ttf')).arrayBuffer());
  const micr = await pdf.embedFont(micrBytes, { subset: false });
  const ox = d.offsetXIn || 0;
  const oy = d.offsetYIn || 0;

  // x/y in inches from the page's top-left
  const text = (s: string, x: number, y: number, size = 10, font: PDFFont = helv, color = ink) =>
    page.drawText(s, { x: (x + ox) * PT, y: (PAGE_HEIGHT_IN - y - oy) * PT, size, font, color });
  const textRight = (s: string, xRight: number, y: number, size = 10, font: PDFFont = helv) =>
    text(s, xRight - font.widthOfTextAtSize(s, size) / PT, y, size, font);
  const line = (x1: number, y1: number, x2: number, y2: number, t = 0.75) =>
    page.drawLine({ start: { x: (x1 + ox) * PT, y: (PAGE_HEIGHT_IN - y1 - oy) * PT }, end: { x: (x2 + ox) * PT, y: (PAGE_HEIGHT_IN - y2 - oy) * PT }, thickness: t, color: ink });
  const lines = (s: string | null | undefined) => (s || '').split(/\n|,\s*(?=[^,]*,\s*[A-Z]{2}\s+\d{5})/).map(v => v.trim()).filter(Boolean);

  const top = partTops();

  // ---------- CHECK (top third) ----------
  const cy = top.check;
  let nameX = 0.5;
  if (d.logoUrl) {
    const img = await loadLogo(pdf, d.logoUrl);
    if (img) {
      const h = 0.6, w = Math.min(1.2, (img.width / img.height) * h);
      page.drawImage(img, { x: (0.5 + ox) * PT, y: (PAGE_HEIGHT_IN - cy - 0.35 - h - oy) * PT, width: w * PT, height: h * PT });
      nameX = 0.5 + w + 0.12;
    }
  }
  text(d.companyName, nameX, cy + 0.5, 11, bold);
  lines(d.companyAddress).slice(0, 3).forEach((l, i) => text(l, nameX, cy + 0.68 + i * 0.15, 8.5));

  text(d.bankName, 3.9, cy + 0.5, 9, bold);
  lines(d.bankAddress).slice(0, 2).forEach((l, i) => text(l, 3.9, cy + 0.65 + i * 0.14, 8));

  textRight(String(d.checkNumber), 8.0, cy + 0.5, 12, bold);
  text('DATE', 6.2, cy + 1.05, 7, helv, grey);
  text(d.date, 6.6, cy + 1.05, 10);
  line(6.55, cy + 1.1, 8.0, cy + 1.1, 0.5);

  text('PAY TO THE', 0.5, cy + 1.42, 7, helv, grey);
  text('ORDER OF', 0.5, cy + 1.54, 7, helv, grey);
  text(d.payee, 1.25, cy + 1.52, 11, bold);
  line(1.2, cy + 1.58, 6.3, cy + 1.58, 0.5);
  page.drawRectangle({ x: (6.5 + ox) * PT, y: (PAGE_HEIGHT_IN - cy - 1.62 - oy) * PT, width: 1.5 * PT, height: 0.3 * PT, borderColor: ink, borderWidth: 0.75 });
  text('$', 6.55, cy + 1.53, 11, bold);
  textRight(protectedAmount(d.amount), 7.92, cy + 1.53, 11, bold);

  const words = amountInWords(d.amount);
  text(words, 0.5, cy + 1.92, 10);
  const wordsEnd = 0.5 + helv.widthOfTextAtSize(words, 10) / PT + 0.08;
  if (wordsEnd < 7.0) text('*'.repeat(Math.max(0, Math.floor((7.0 - wordsEnd) / (helv.widthOfTextAtSize('*', 10) / PT)))), wordsEnd, cy + 1.92, 10, helv, grey);
  line(0.5, cy + 1.97, 7.3, cy + 1.97, 0.5);
  text('DOLLARS', 7.35, cy + 1.95, 7, helv, grey);

  // Payee address (window envelope area)
  text(d.payee, 0.9, cy + 2.25, 9);
  lines(d.payeeAddress).slice(0, 3).forEach((l, i) => text(l, 0.9, cy + 2.4 + i * 0.14, 9));

  text('MEMO', 0.5, cy + 2.95, 7, helv, grey);
  if (d.memo) text(d.memo.slice(0, 60), 0.95, cy + 2.93, 9);
  line(0.9, cy + 2.98, 4.0, cy + 2.98, 0.5);

  // Signature line only — signature itself is left blank
  line(4.9, cy + 2.98, 8.0, cy + 2.98, 0.5);
  text('AUTHORIZED SIGNATURE', 5.75, cy + 3.1, 6.5, helv, grey);

  if (d.voided) text('VOID', 3.4, cy + 2.2, 48, bold, rgb(0.6, 0.6, 0.6));

  // MICR line — positioned from the check's right edge, baseline in the clear band
  const micrY = cy + PART_HEIGHT_IN - MICR_BASELINE_IN;
  for (const c of micrLine(d.routingNumber, d.accountNumber, d.checkNumber)) {
    page.drawText(c.char, { x: (micrCharX(c.position) + ox) * PT, y: (PAGE_HEIGHT_IN - micrY - oy) * PT, size: MICR_FONT_SIZE_PT, font: micr, color: ink });
  }

  // ---------- STUBS (identical) ----------
  for (const sy of [top.stub1, top.stub2]) drawStub(page, d, sy, { text, textRight, line, helv, bold });

  return pdf.save();
}

function drawStub(page: PDFPage, d: CheckData, sy: number, h: {
  text: (s: string, x: number, y: number, size?: number, font?: PDFFont, color?: ReturnType<typeof rgb>) => void;
  textRight: (s: string, x: number, y: number, size?: number, font?: PDFFont) => void;
  line: (x1: number, y1: number, x2: number, y2: number, t?: number) => void;
  helv: PDFFont; bold: PDFFont;
}) {
  const { text, textRight, line, bold } = h;
  text(d.companyName, 0.5, sy + 0.45, 10, bold);
  text(`Paid to: ${d.payee}`, 0.5, sy + 0.65, 9);
  textRight(`Check ${d.checkNumber}`, 8.0, sy + 0.45, 10, bold);
  textRight(`Date ${d.date}`, 8.0, sy + 0.65, 9);
  const head = sy + 0.95;
  text('Bill / Invoice #', 0.5, head, 8, bold);
  text('PO #', 2.4, head, 8, bold);
  text('Bill date', 3.8, head, 8, bold);
  textRight('Bill amount', 6.4, head, 8, bold);
  textRight('Paid', 8.0, head, 8, bold);
  line(0.5, head + 0.06, 8.0, head + 0.06, 0.5);
  const rows = d.stubLines.slice(0, 12);
  rows.forEach((r, i) => {
    const y = head + 0.22 + i * 0.17;
    text(r.billNumber || 'Advance', 0.5, y, 8.5);
    text(r.poNumber, 2.4, y, 8.5);
    text(r.billDate || '', 3.8, y, 8.5);
    textRight(r.billAmount ? r.billAmount.toFixed(2) : '', 6.4, y, 8.5);
    textRight(r.paid.toFixed(2), 8.0, y, 8.5);
  });
  if (d.stubLines.length > rows.length) text(`+ ${d.stubLines.length - rows.length} more`, 0.5, head + 0.22 + rows.length * 0.17, 8);
  const ty = sy + PART_HEIGHT_IN - 0.45;
  line(5.5, ty - 0.15, 8.0, ty - 0.15, 0.5);
  text('Check total', 5.5, ty, 9, bold);
  textRight(`$${stubTotal(d.stubLines).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 8.0, ty, 10, bold);
  if (d.memo) text(`Memo: ${d.memo.slice(0, 80)}`, 0.5, ty, 8.5);
  if (d.voided) text('VOID', 3.6, sy + 1.9, 36, bold);
}

export function openPdf(bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
