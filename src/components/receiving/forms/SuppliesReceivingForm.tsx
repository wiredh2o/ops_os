import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Clipboard } from "lucide-react";

interface SuppliesReceivingFormProps {
  onBack: () => void;
}

export function SuppliesReceivingForm({ onBack }: SuppliesReceivingFormProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack}>
          ← Back to Categories
        </Button>
        <div className="flex items-center gap-2">
          <Clipboard className="w-6 h-6 text-primary" />
          <h2 className="text-2xl font-bold">Supplies Receiving</h2>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Receive Office & Operational Supplies</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="order-number">Order Number</Label>
              <Input id="order-number" placeholder="Enter order number" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vendor">Vendor</Label>
              <Input id="vendor" placeholder="Enter vendor name" />
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
            <Label htmlFor="supplies">Supplies Received</Label>
            <Textarea 
              id="supplies" 
              placeholder="List supplies received (e.g., paper, pens, cleaning supplies)"
              rows={6}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Receiving Notes</Label>
            <Textarea 
              id="notes" 
              placeholder="Any notes about quantity, condition, storage location"
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