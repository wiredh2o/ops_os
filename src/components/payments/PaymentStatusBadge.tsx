import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, AlertCircle, XCircle, FileText } from "lucide-react";

interface PaymentStatusBadgeProps {
  status: string | null | undefined;
  className?: string;
}

export function PaymentStatusBadge({ status, className }: PaymentStatusBadgeProps) {
  const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle }> = {
    paid: { label: "Paid", variant: "default", icon: CheckCircle },
    pending: { label: "Pending", variant: "secondary", icon: Clock },
    invoiced: { label: "Invoiced", variant: "outline", icon: FileText },
    failed: { label: "Failed", variant: "destructive", icon: XCircle },
    refunded: { label: "Refunded", variant: "secondary", icon: AlertCircle },
  };

  const config = statusConfig[status || "pending"] || statusConfig.pending;
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={className}>
      <Icon className="h-3 w-3 mr-1" />
      {config.label}
    </Badge>
  );
}
