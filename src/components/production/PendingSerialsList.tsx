import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Package, AlertCircle, CheckCircle, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface PendingSerialItem {
  id: string;
  customer_order_id: string;
  requested_serial: string | null;
  actual_serial: string | null;
  serial_pending: boolean;
  quantity_ordered: number;
  customer_order: {
    id: string;
    order_number: string;
    company: {
      name: string;
    };
  };
  inventory_item?: {
    sku: string;
    sales_description: string | null;
  } | null;
  assembly?: {
    sku: string;
    sales_description: string | null;
  } | null;
  drop_ship_purchase_order?: {
    id: string;
    purchase_order_number: string;
    created_at: string;
  } | null;
}

export function PendingSerialsList() {
  const { toast } = useToast();
  const [items, setItems] = useState<PendingSerialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Resolution modal state
  const [selectedItem, setSelectedItem] = useState<PendingSerialItem | null>(null);
  const [serialInput, setSerialInput] = useState('');
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    fetchPendingItems();
  }, []);

  const fetchPendingItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('customer_order_items')
        .select(`
          id,
          customer_order_id,
          requested_serial,
          actual_serial,
          serial_pending,
          quantity_ordered,
          customer_order:customer_orders(
            id,
            order_number,
            company:companies(name)
          ),
          inventory_item:inventory_items(sku, sales_description),
          assembly:assemblies(sku, sales_description),
          drop_ship_purchase_order:purchase_orders(id, purchase_order_number, created_at)
        `)
        .eq('serial_pending', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems(data || []);
    } catch (err: any) {
      console.error('Error fetching pending serials:', err);
      toast({
        title: 'Error',
        description: 'Failed to load pending serial items',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async () => {
    if (!selectedItem || !serialInput.trim()) {
      toast({
        title: 'Serial Required',
        description: 'Please enter the serial number from the vendor invoice',
        variant: 'destructive',
      });
      return;
    }

    setResolving(true);
    try {
      const { error } = await supabase
        .from('customer_order_items')
        .update({
          actual_serial: serialInput.trim(),
          serial_pending: false,
        })
        .eq('id', selectedItem.id);

      if (error) throw error;

      toast({
        title: 'Serial Resolved',
        description: `Serial number ${serialInput.trim()} has been recorded`,
      });

      setSelectedItem(null);
      setSerialInput('');
      fetchPendingItems();
    } catch (err: any) {
      console.error('Error resolving serial:', err);
      toast({
        title: 'Error',
        description: err.message || 'Failed to update serial number',
        variant: 'destructive',
      });
    } finally {
      setResolving(false);
    }
  };

  const getItemDetails = (item: PendingSerialItem) => {
    if (item.inventory_item) {
      return {
        sku: item.inventory_item.sku,
        description: item.inventory_item.sales_description,
      };
    }
    if (item.assembly) {
      return {
        sku: item.assembly.sku,
        description: item.assembly.sales_description,
      };
    }
    return { sku: 'Unknown', description: null };
  };

  const filteredItems = items.filter(item => {
    const details = getItemDetails(item);
    const search = searchTerm.toLowerCase();
    return (
      details.sku.toLowerCase().includes(search) ||
      item.customer_order?.order_number?.toLowerCase().includes(search) ||
      item.customer_order?.company?.name?.toLowerCase().includes(search) ||
      item.drop_ship_purchase_order?.purchase_order_number?.toLowerCase().includes(search)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Pending Serial Numbers
              {items.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {items.length}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Items awaiting actual serial numbers from vendor invoices
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchPendingItems}>
            Refresh
          </Button>
        </div>

        {items.length > 0 && (
          <div className="flex items-center gap-2 pt-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by SKU, order, customer, or PO..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
        )}
      </CardHeader>

      <CardContent>
        {items.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="text-muted-foreground">All serial numbers have been resolved</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>PO #</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map(item => {
                const details = getItemDetails(item);
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{details.sku}</p>
                        <p className="text-xs text-muted-foreground">{details.description}</p>
                      </div>
                    </TableCell>
                    <TableCell>{item.customer_order?.company?.name}</TableCell>
                    <TableCell>{item.customer_order?.order_number}</TableCell>
                    <TableCell>
                      {item.drop_ship_purchase_order?.purchase_order_number || '-'}
                    </TableCell>
                    <TableCell>
                      {item.drop_ship_purchase_order?.created_at 
                        ? format(new Date(item.drop_ship_purchase_order.created_at), 'MMM dd, yyyy')
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedItem(item);
                          setSerialInput('');
                        }}
                      >
                        Enter Serial
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Resolution Modal */}
      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter Serial Number</DialogTitle>
            <DialogDescription>
              Enter the actual serial number from the vendor's invoice for this item.
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-4 py-4">
              <div className="p-3 bg-muted rounded-md">
                <p className="font-medium">{getItemDetails(selectedItem).sku}</p>
                <p className="text-sm text-muted-foreground">
                  {getItemDetails(selectedItem).description}
                </p>
                <p className="text-sm mt-2">
                  <span className="text-muted-foreground">Customer:</span>{' '}
                  {selectedItem.customer_order?.company?.name}
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Order:</span>{' '}
                  {selectedItem.customer_order?.order_number}
                </p>
                {selectedItem.drop_ship_purchase_order && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">PO:</span>{' '}
                    {selectedItem.drop_ship_purchase_order.purchase_order_number}
                  </p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium">Serial Number from Vendor</label>
                <Input
                  placeholder="Enter serial number..."
                  value={serialInput}
                  onChange={(e) => setSerialInput(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedItem(null)}>
              Cancel
            </Button>
            <Button onClick={handleResolve} disabled={resolving || !serialInput.trim()}>
              {resolving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Serial'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
