import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RotateCcw } from "lucide-react";
import { useState } from 'react';
import { useRmaRequests } from '@/hooks/useRmaRequests';
import { UnifiedPackageModal } from '../UnifiedPackageModal';
import { getRmaItems } from '@/lib/rma';
import { useCompanies } from '@/hooks/useCompanies';

interface ReturnsReceivingFormProps {
  onBack: () => void;
}

export function ReturnsReceivingForm({ onBack }: ReturnsReceivingFormProps) {
  const requests = useRmaRequests(true);
  const { data: companies } = useCompanies();
  const [selectedId, setSelectedId] = useState('');
  const [receiving, setReceiving] = useState(false);
  const rma = requests.data?.find(entry => entry.id === selectedId);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack}>
          ← Back to Categories
        </Button>
        <div className="flex items-center gap-2">
          <RotateCcw className="w-6 h-6 text-primary" />
          <h2 className="text-2xl font-bold">Product Returns Receiving</h2>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Process Product Returns</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Approved RMA</Label><Select value={selectedId} onValueChange={setSelectedId}><SelectTrigger aria-label="Approved return RMA"><SelectValue placeholder="Select approved RMA" /></SelectTrigger><SelectContent>{(requests.data || []).map(entry => <SelectItem key={entry.id} value={entry.id}>{entry.rma_number}{entry.tracking_number ? ` · ${entry.tracking_number}` : ''}</SelectItem>)}</SelectContent></Select>{requests.error && <p role="alert" className="text-destructive">Unable to load approved RMAs.</p>}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rma-number">RMA Number</Label>
              <Input id="rma-number" placeholder="Select approved RMA" value={rma?.rma_number || ''} readOnly />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer">Customer Name</Label>
              <Input id="customer" placeholder="Selected RMA company" value={companies?.find(company => company.id === rma?.company_id)?.name || ''} readOnly />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tracking">Tracking Number</Label>
              <Input id="tracking" placeholder="Tracking not yet entered" value={rma?.tracking_number || ''} readOnly />
            </div>
            <div className="space-y-2">
              <Label htmlFor="received-date">Date Received</Label>
              <Input id="received-date" type="date" value={new Date().toLocaleDateString('en-CA')} readOnly />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="items">Items Returned</Label>
            <Textarea 
              id="items" 
              readOnly
              value={rma ? getRmaItems(rma.items).map(item => `${item.quantity} × ${item.item_name}${item.serial_number ? ` · ${item.serial_number}` : ''}`).join('\n') : ''}
              placeholder="List items returned with quantities and condition"
              rows={6}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Return Notes</Label>
            <Textarea 
              id="notes" 
              readOnly
              value={rma?.problem_reported || ''}
              placeholder="Additional notes about the return"
              rows={3}
            />
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" disabled={!rma} onClick={() => setReceiving(true)}>Review and record receipt</Button>
          </div>
        </CardContent>
      </Card>
      {rma && <UnifiedPackageModal open={receiving} onOpenChange={setReceiving} mode="receive" rma={rma} onSuccess={() => { requests.refetch(); setSelectedId(''); }} />}
    </div>
  );
}