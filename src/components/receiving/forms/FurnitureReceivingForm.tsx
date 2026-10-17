import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Armchair } from "lucide-react";

interface FurnitureReceivingFormProps {
  onBack: () => void;
}

export function FurnitureReceivingForm({ onBack }: FurnitureReceivingFormProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack}>
          ← Back to Categories
        </Button>
        <div className="flex items-center gap-2">
          <Armchair className="w-6 h-6 text-primary" />
          <h2 className="text-2xl font-bold">Furniture & Equipment Receiving</h2>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Receive Furniture & Equipment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="po-number">Purchase Order Number</Label>
              <Input id="po-number" placeholder="Enter PO number" />
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="asset-tag">Asset Tag Number</Label>
              <Input id="asset-tag" placeholder="Enter asset tag" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Assigned Location</Label>
              <Input id="location" placeholder="Enter location/department" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="items">Items Received</Label>
            <Textarea 
              id="items" 
              placeholder="List furniture/equipment received with details"
              rows={6}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="condition">Condition Notes</Label>
            <Textarea 
              id="condition" 
              placeholder="Note any damage, assembly requirements, warranties"
              rows={3}
            />
          </div>

          <div className="flex gap-2">
            <Button className="flex-1">Process Receiving & Create Asset Record</Button>
            <Button variant="outline">Save as Draft</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}