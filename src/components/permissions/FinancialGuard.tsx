import { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { canViewFinancial, FinancialKind } from '@/hooks/financial-visibility';

// Financial flags are independent of the View permissions that open a tab.
export function FinancialGuard({ kind, children, fallback = null }: {
  kind: FinancialKind; children: ReactNode; fallback?: ReactNode;
}) {
  const { roles, rolesLoading, financialFlags, financialFlagsLoading } = useAuth();
  if (rolesLoading || financialFlagsLoading || !canViewFinancial(roles, financialFlags, kind)) return <>{fallback}</>;
  return <>{children}</>;
}