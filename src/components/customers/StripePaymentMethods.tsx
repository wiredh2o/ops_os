import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CreditCard, Star, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
  type?: 'payment_method' | 'source';
}

interface StripePaymentMethodsProps {
  stripeCustomerId: string;
  onSelectPaymentMethod?: (paymentMethodId: string) => void;
  selectable?: boolean;
  selectedPaymentMethodId?: string;
  allowDelete?: boolean;
  onPaymentMethodDeleted?: () => void;
}

export function StripePaymentMethods({
  stripeCustomerId,
  onSelectPaymentMethod,
  selectable = false,
  selectedPaymentMethodId,
  allowDelete = false,
  onPaymentMethodDeleted,
}: StripePaymentMethodsProps) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadPaymentMethods();
  }, [stripeCustomerId]);

  const loadPaymentMethods = async () => {
    if (!stripeCustomerId) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-stripe-payment-methods', {
        body: { stripe_customer_id: stripeCustomerId }
      });

      if (error) throw error;
      setPaymentMethods(data.payment_methods || []);
    } catch (error: any) {
      toast({
        title: "Failed to load payment methods",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeletePaymentMethod = async (pm: PaymentMethod) => {
    if (confirmDeleteId !== pm.id) {
      setConfirmDeleteId(pm.id);
      return;
    }

    setDeletingId(pm.id);
    setConfirmDeleteId(null);

    try {
      const { data, error } = await supabase.functions.invoke('detach-stripe-payment-method', {
        body: {
          stripe_customer_id: stripeCustomerId,
          payment_method_id: pm.id,
          type: pm.type || 'payment_method'
        }
      });

      if (error) throw error;

      toast({
        title: "Payment method deleted",
        description: `Card ending in ${pm.last4} has been removed.`,
      });

      // Remove from local state
      setPaymentMethods(prev => prev.filter(p => p.id !== pm.id));
      
      // Notify parent
      onPaymentMethodDeleted?.();

    } catch (error: any) {
      toast({
        title: "Failed to delete payment method",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (paymentMethods.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No saved payment methods</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {paymentMethods.map((pm) => (
        <div
          key={pm.id}
          className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
            selectable && !confirmDeleteId ? "cursor-pointer hover:bg-accent" : ""
          } ${selectedPaymentMethodId === pm.id ? "border-primary bg-primary/5" : ""}`}
          onClick={() => selectable && !confirmDeleteId && onSelectPaymentMethod?.(pm.id)}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-6 bg-gradient-to-r from-gray-700 to-gray-900 rounded flex items-center justify-center text-white text-xs font-mono shrink-0">
              {pm.brand.toUpperCase().slice(0, 4)}
            </div>
            <div className="min-w-0">
              <p className="font-medium flex items-center gap-2">
                •••• {pm.last4}
                {pm.is_default && (
                  <Badge variant="secondary" className="text-xs">
                    <Star className="h-3 w-3 mr-1" />
                    Default
                  </Badge>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                Expires {pm.exp_month.toString().padStart(2, '0')}/{pm.exp_year}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {selectable && selectedPaymentMethodId === pm.id && !confirmDeleteId && (
              <Badge>Selected</Badge>
            )}
            
            {allowDelete && (
              <>
                {confirmDeleteId === pm.id ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(null);
                      }}
                      disabled={deletingId === pm.id}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePaymentMethod(pm);
                      }}
                      disabled={deletingId === pm.id}
                    >
                      {deletingId === pm.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Delete"
                      )}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(pm.id);
                    }}
                    disabled={deletingId !== null}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
