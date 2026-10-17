import { Badge } from "@/components/ui/badge";

interface PaymentTermsBadgeProps {
  terms: string | null | undefined;
  className?: string;
}

export function PaymentTermsBadge({ terms, className }: PaymentTermsBadgeProps) {
  const termsConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
    due_in_advance: { label: "Due in Advance", variant: "default" },
    fifty_fifty: { label: "50% Down / 50% Before Ship", variant: "secondary" },
    net_15: { label: "Net 15", variant: "outline" },
    net_30: { label: "Net 30", variant: "outline" },
  };

  const config = termsConfig[terms || "due_in_advance"] || { label: terms || "Due in Advance", variant: "secondary" as const };

  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
}
