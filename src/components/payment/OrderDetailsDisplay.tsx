import React from "react";
import { RepairPhotosGallery } from "./RepairPhotosGallery";
import { Separator } from "@/components/ui/separator";

interface OrderDetailsDisplayProps {
  order: {
    id?: string;
    order_number: string;
    order_type?: string;
    status?: string;
    created_at?: string;
  };
  customer: {
    name: string;
    email?: string;
    phone?: string;
  } | null;
  lineItems: Array<{
    id: string;
    item_name: string;
    item_sku: string | null;
    item_type: string;
    quantity: number;
    unit_price: number | null;
    total_price: number | null;
    notes: string | null;
    is_taxable: boolean;
    tax_amount: number | null;
    repair_item_id: string | null;
  }>;
  repairItems: Array<{
    id: string;
    item_description: string;
    diagnosis_notes: string | null;
    repair_notes: string | null;
    actual_issue: string | null;
    repair_item_photos: Array<{
      id: string;
      file_path: string;
      photo_type: string;
      signed_url: string | null;
    }>;
  }>;
  totals: {
    subtotal: number;
    tax: number;
    shipping: number;
    total: number;
  };
}

export function OrderDetailsDisplay({
  order,
  customer,
  lineItems,
  repairItems,
  totals,
}: OrderDetailsDisplayProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  // Get all photos from repair items
  const allPhotos = repairItems.flatMap(
    (item) =>
      item.repair_item_photos?.filter((p) => p.signed_url).map((p) => ({
        id: p.id,
        url: p.signed_url!,
        type: p.photo_type,
      })) || []
  );

  // Map repair item details to line items
  const getRepairDetails = (repairItemId: string | null) => {
    if (!repairItemId) return null;
    return repairItems.find((r) => r.id === repairItemId);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">WashGear</h1>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Order</p>
          <p className="font-semibold">#{order.order_number}</p>
        </div>
      </div>

      {/* Greeting */}
      {customer && (
        <div className="mb-6">
          <p className="text-lg">
            Hi <span className="font-medium">{customer.name}</span>,
          </p>
          <p className="text-muted-foreground">Your order is ready for payment.</p>
        </div>
      )}

      <Separator className="my-6" />

      {/* Repair Photos */}
      {allPhotos.length > 0 && (
        <div className="mb-6">
          <h2 className="font-semibold mb-3">Repair Photos</h2>
          <RepairPhotosGallery photos={allPhotos} />
        </div>
      )}

      {/* Line Items */}
      <div className="mb-6">
        <h2 className="font-semibold mb-3">Order Details</h2>
        <div className="space-y-4">
          {lineItems.map((item) => {
            const repairDetails = getRepairDetails(item.repair_item_id);
            return (
              <div key={item.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-medium">{item.item_name}</p>
                    {item.item_sku && (
                      <p className="text-sm text-muted-foreground">SKU: {item.item_sku}</p>
                    )}
                  </div>
                  <p className="font-medium">
                    {item.total_price ? formatCurrency(item.total_price) : "-"}
                  </p>
                </div>
                
                {repairDetails && (
                  <div className="mt-3 pl-4 border-l-2 border-muted">
                    {repairDetails.diagnosis_notes && (
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium">Diagnosis:</span> {repairDetails.diagnosis_notes}
                      </p>
                    )}
                    {repairDetails.actual_issue && (
                      <p className="text-sm text-muted-foreground mt-1">
                        <span className="font-medium">Issue:</span> {repairDetails.actual_issue}
                      </p>
                    )}
                    {repairDetails.repair_notes && (
                      <p className="text-sm text-muted-foreground mt-1">
                        <span className="font-medium">Work performed:</span> {repairDetails.repair_notes}
                      </p>
                    )}
                  </div>
                )}
                
                {item.notes && !repairDetails && (
                  <p className="text-sm text-muted-foreground mt-2">{item.notes}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Separator className="my-6" />

      {/* Totals */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatCurrency(totals.subtotal)}</span>
        </div>
        {totals.tax > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tax</span>
            <span>{formatCurrency(totals.tax)}</span>
          </div>
        )}
        {totals.shipping > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Shipping</span>
            <span>{formatCurrency(totals.shipping)}</span>
          </div>
        )}
        <Separator className="my-2" />
        <div className="flex justify-between font-semibold text-lg">
          <span>Total Due</span>
          <span>{formatCurrency(totals.total)}</span>
        </div>
      </div>
    </div>
  );
}
