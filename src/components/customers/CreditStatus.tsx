import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/credit-rules';
import type { CustomerCredit } from '@/hooks/useCustomerCredit';

/** Credit limit + available credit. Renders nothing when the user may not see credit (no data). */
export function CreditStatus({ credit, compact }: { credit?: CustomerCredit; compact?: boolean }) {
  if (!credit) return null;
  const low = credit.available_credit < 0;
  return (
    <div className={compact ? 'flex flex-wrap items-center gap-2 text-xs' : 'flex flex-wrap items-center gap-3 text-sm'}>
      <span className="text-muted-foreground">Limit <span className="font-medium text-foreground">{formatMoney(credit.credit_limit)}</span></span>
      <span className="text-muted-foreground">Available <span className={low ? 'font-medium text-destructive' : 'font-medium text-foreground'}>{formatMoney(credit.available_credit)}</span></span>
      {credit.on_hold && <CreditHoldBadge />}
    </div>
  );
}

export function CreditHoldBadge() {
  return <Badge variant="destructive">Credit Hold</Badge>;
}
