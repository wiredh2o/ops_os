import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Clock, User, MessageSquare, Mail, Phone } from 'lucide-react';
import { OrderStatusBadge } from './OrderStatusBadge';
import { useToast } from '@/hooks/use-toast';

interface OrderTimelineProps {
  order: any;
  onClose: () => void;
  onUpdate: () => void;
}

interface StatusHistory {
  id: string;
  old_status: string;
  new_status: string;
  notes: string;
  changed_at: string;
  changed_by: string;
}

export const OrderTimeline: React.FC<OrderTimelineProps> = ({ order, onClose, onUpdate }) => {
  const [statusHistory, setStatusHistory] = useState<StatusHistory[]>([]);
  const [newStatus, setNewStatus] = useState(order.status);
  const [updateNotes, setUpdateNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchStatusHistory();
  }, [order.id]);

  const fetchStatusHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('status_history')
        .select('*')
        .eq('order_type', order.type)
        .eq('order_id', order.id)
        .order('changed_at', { ascending: false });

      if (error) throw error;
      setStatusHistory(data || []);
    } catch (error: any) {
      console.error('Error fetching status history:', error);
    }
  };

  const getStatusOptions = () => {
    if (order.type === 'production') {
      return [
        'pending', 'in_progress', 'quality_check', 'completed', 'label_staged', 'awaiting_pickup', 'in_transit', 'delivered', 'cancelled'
      ];
    } else {
      return [
        'received', 'diagnosed', 'parts_ordered', 'in_repair', 'quality_check', 'completed', 'label_staged', 'awaiting_pickup', 'in_transit', 'delivered', 'cancelled'
      ];
    }
  };

  const updateOrderStatus = async () => {
    if (newStatus === order.status && !updateNotes.trim()) {
      toast({
        title: "No Changes",
        description: "Status and notes are unchanged",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const tableName = order.type === 'production' ? 'production_orders' : 'repair_orders';
      const updateData: any = {};
      
      if (newStatus !== order.status) {
        updateData.status = newStatus;
      }

      // If production order is being marked as awaiting_pickup, capture revenue/expense timestamps
      if (order.type === 'production' && newStatus === 'awaiting_pickup') {
        const nowIso = new Date().toISOString();
        updateData.sold_at = nowIso;
        updateData.payment_received_at = nowIso;
      }
      
      // Add notes to the order if provided
      if (updateNotes.trim()) {
        const currentNotes = order.notes || '';
        const timestamp = new Date().toLocaleString();
        const newNote = `[${timestamp}] ${updateNotes.trim()}`;
        updateData.notes = currentNotes ? `${currentNotes}\n\n${newNote}` : newNote;
      }

      const { error } = await supabase
        .from(tableName)
        .update(updateData)
        .eq('id', order.id);

      if (error) throw error;

      // Add manual status history entry if notes provided
      if (updateNotes.trim()) {
        await supabase.from('status_history').insert({
          order_type: order.type,
          order_id: order.id,
          old_status: order.status,
          new_status: newStatus,
          notes: updateNotes.trim(),
          changed_by: (await supabase.auth.getUser()).data.user?.id
        });
      }

      toast({
        title: "Success",
        description: "Order updated successfully",
      });
      
      onUpdate();
      fetchStatusHistory();
      setUpdateNotes('');
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to update order: " + error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const sendTestNotification = async () => {
    try {
      const { error } = await supabase.functions.invoke('send-status-notification', {
        body: {
          order_type: order.type,
          order_id: order.id,
          order_number: order.order_number || order.repair_number,
          status: order.status,
          customer_email: order.customer_email,
          customer_phone: order.customer_phone
        }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Test notification sent successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to send notification: " + error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {order.type === 'production' ? 'Production Order' : 'Repair Order'}: {order.order_number || order.repair_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Order Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Order Details
                <OrderStatusBadge status={order.status} type={order.type} />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Customer</p>
                  <p className="font-medium">{order.customer_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Priority</p>
                  <Badge variant={order.priority === 'urgent' ? 'destructive' : order.priority === 'high' ? 'secondary' : 'outline'}>
                    {order.priority}
                  </Badge>
                </div>
              </div>
              
              {order.customer_email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{order.customer_email}</span>
                </div>
              )}
              
              {order.customer_phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{order.customer_phone}</span>
                </div>
              )}

              {order.type === 'repair' && (
                <>
                  <div>
                    <p className="text-sm text-muted-foreground">Item</p>
                    <p className="font-medium">{order.item_description}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Problem</p>
                    <p>{order.problem_description}</p>
                  </div>
                </>
              )}

              <div className="flex gap-2">
                <Button onClick={sendTestNotification} variant="outline" size="sm">
                  <Mail className="h-4 w-4 mr-2" />
                  Send Test Notification
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Status Update */}
          <Card>
            <CardHeader>
              <CardTitle>Update Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="status">Status</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getStatusOptions().map(status => (
                      <SelectItem key={status} value={status}>
                        {status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="notes">Update Notes</Label>
                <Textarea
                  id="notes"
                  value={updateNotes}
                  onChange={(e) => setUpdateNotes(e.target.value)}
                  placeholder="Add notes about this status update..."
                  rows={3}
                />
              </div>

              <Button 
                onClick={updateOrderStatus} 
                disabled={loading}
                className="w-full bg-gradient-primary"
              >
                {loading ? 'Updating...' : 'Update Order'}
              </Button>
            </CardContent>
          </Card>

          {/* Status History */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Status History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statusHistory.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No status changes yet</p>
              ) : (
                <div className="space-y-4">
                  {statusHistory.map((entry, index) => (
                    <div key={entry.id} className="flex gap-3 pb-4 border-b border-border last:border-b-0">
                      <div className="flex-shrink-0 mt-1">
                        <div className="w-2 h-2 bg-primary rounded-full"></div>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <OrderStatusBadge status={entry.new_status} type={order.type} />
                          <span className="text-sm text-muted-foreground">
                            {new Date(entry.changed_at).toLocaleString()}
                          </span>
                        </div>
                        {entry.old_status && (
                          <p className="text-sm text-muted-foreground">
                            Changed from <span className="font-medium">{entry.old_status}</span> to <span className="font-medium">{entry.new_status}</span>
                          </p>
                        )}
                        {entry.notes && (
                          <div className="mt-2 p-2 bg-muted rounded text-sm">
                            <MessageSquare className="h-3 w-3 inline mr-1" />
                            {entry.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};