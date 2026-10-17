import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CreditCard, Plus } from "lucide-react";
import { StripePaymentMethods } from "@/components/customers/StripePaymentMethods";
import { AddCardForm } from "@/components/shipping/AddCardForm";
import { useToast } from "@/hooks/use-toast";

interface ManageCardsModalProps {
  open: boolean;
  onClose: () => void;
  stripeCustomerId: string;
  customerName: string;
  onPaymentMethodsChanged: () => void;
}

export const ManageCardsModal: React.FC<ManageCardsModalProps> = ({
  open,
  onClose,
  stripeCustomerId,
  customerName,
  onPaymentMethodsChanged,
}) => {
  const [showAddCardForm, setShowAddCardForm] = useState(false);
  const { toast } = useToast();

  const handleCardAdded = (paymentMethodId: string) => {
    toast({
      title: "Card added",
      description: "New payment method saved successfully.",
    });
    setShowAddCardForm(false);
    onPaymentMethodsChanged();
  };

  const handleClose = () => {
    setShowAddCardForm(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Manage Payment Methods
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{customerName}</p>
        </DialogHeader>

        <div className="space-y-4">
          {!showAddCardForm ? (
            <>
              {/* Existing Cards List */}
              <StripePaymentMethods
                stripeCustomerId={stripeCustomerId}
                allowDelete
                onPaymentMethodDeleted={onPaymentMethodsChanged}
              />

              <Separator />

              {/* Add Card Button */}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowAddCardForm(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add New Card
              </Button>
            </>
          ) : (
            /* Add Card Form */
            <AddCardForm
              stripeCustomerId={stripeCustomerId}
              onSuccess={handleCardAdded}
              onCancel={() => setShowAddCardForm(false)}
            />
          )}
        </div>

        {!showAddCardForm && (
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Done
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};
