import { Badge } from "@/components/ui/badge";
import { usePaymentTerms } from "@/hooks/usePaymentTerms";
import { findTerm, termKind } from "@/lib/credit-rules";

interface PaymentTermsBadgeProps {
  terms: string | null | undefined;
  className?: string;
}

/** Shows the term's name from the settings list. */
export function PaymentTermsBadge({ terms, className }: PaymentTermsBadgeProps) {
  const { data: list = [] } = usePaymentTerms();
  const term = findTerm(list, terms);
  const kind = termKind(term);
  const variant = kind === "prepay" ? "default" : kind === "deposit" ? "secondary" : "outline";
  return (
    <Badge variant={variant} className={className}>
      {term?.label ?? terms ?? "Due in Advance"}
    </Badge>
  );
}
