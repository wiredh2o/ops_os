import { parseTaxLines } from '@/lib/tax-engine';
import { formatCurrency } from '@/lib/utils';
export function TaxLines({ lines, legacyAmount = 0, reviewRequired = false }: { lines: unknown; legacyAmount?: number; reviewRequired?: boolean }) {
  const taxes = parseTaxLines(lines);
  return <div className="space-y-1 text-sm">
    {taxes.map((line, index) => <div key={`${line.jurisdiction_id}-${line.type}-${index}`} className="flex justify-between gap-3"><span className="min-w-0 break-words text-muted-foreground">{line.name}{line.type === 'sales_tax' ? ` (${line.rate}%)` : ''}</span><span className="shrink-0 tabular-nums">{formatCurrency(line.amount)}</span></div>)}
    {!taxes.length && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Tax</span><span>{formatCurrency(legacyAmount)}</span></div>}
    {reviewRequired && <p className="text-destructive text-xs">Tax jurisdiction review required</p>}
  </div>;
}