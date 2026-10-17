import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Package } from "lucide-react";

interface InventoryReceivingFormProps {
  onBack: () => void;
}

export function InventoryReceivingForm({ onBack }: InventoryReceivingFormProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack}>
          ← Back to Categories
        </Button>
        <div className="flex items-center gap-2">
          <Package className="w-6 h-6 text-primary" />
          <h2 className="text-2xl font-bold">Inventory Receiving</h2>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Receive Inventory Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="po-number">Purchase Order Number</Label>
              <Input id="po-number" placeholder="Enter PO number" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier">Supplier</Label>
              <Input id="supplier" placeholder="Enter supplier name" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tracking">Tracking Number</Label>
              <Input id="tracking" placeholder="Enter tracking number" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="received-date">Date Received</Label>
              <Input id="received-date" type="date" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="items">Items Received</Label>
            <Textarea 
              id="items" 
              placeholder="List items received (one per line)"
              rows={6}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Receiving Notes</Label>
            <Textarea 
              id="notes" 
              placeholder="Any notes about condition, discrepancies, etc."
              rows={3}
            />
          </div>

          <div className="flex gap-2">
            <Button className="flex-1">Process Receiving</Button>
            <Button variant="outline">Save as Draft</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}