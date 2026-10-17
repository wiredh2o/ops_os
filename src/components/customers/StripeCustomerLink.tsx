import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface StripeCustomerLinkProps {
  open: boolean;
  onClose: () => void;
  company: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    billing_address?: string;
    customer_number?: number;
    owners_name?: string;
  };
  onSuccess: () => void;
}

export function StripeCustomerLink({ open, onClose, company, onSuccess }: StripeCustomerLinkProps) {
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  const handleCreateNew = async () => {
    setIsCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-customer', {
        body: {
          company_id: company.id,
          name: company.name,
          email: company.email,
          phone: company.phone,
          billing_address: company.billing_address,
          customer_number: company.customer_number,
          owners_name: company.owners_name,
        }
      });

      if (error) throw error;

      toast({
        title: "Customer created",
        description: `Created and linked Stripe customer: ${data.stripe_customer_id}`,
      });
      onSuccess();
      onClose();
    } catch (error: any) {
      toast({
        title: "Creation failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Create Stripe Customer
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Creating a Stripe customer for:
          </p>
          
          <div className="p-3 bg-muted rounded-lg">
            <p className="font-medium">{company.name}</p>
            {company.email && <p className="text-sm text-muted-foreground">{company.email}</p>}
          </div>

          <p className="text-sm text-muted-foreground">
            This will create a new customer in Stripe and link it to this company record.
          </p>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateNew}
            disabled={isCreating}
            className="gap-2"
          >
            {isCreating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            Create in Stripe
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
