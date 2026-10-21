import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Plus, Search, Package, Truck, DollarSign, Key } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/utils';
import { PurchaseOrderForm } from './PurchaseOrderForm';
import { VendorForm } from '../vendors/VendorForm';
import { POSerialEntryModal } from './POSerialEntryModal';

interface Vendor {
  id: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  lead_time_days: number;
  is_active: boolean;
}

interface PurchaseOrder {
  id: string;
  purchase_order_number: string;
  supplier_id: string;
  status: string;
  order_date: string;
  expected_delivery_date?: string;
  actual_delivery_date?: string;
  total_amount: number;
  supplier?: Vendor;
  purchase_order_items?: any[];
}

export function PurchaseOrderManagement() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPOForm, setShowPOForm] = useState(false);
  const [showVendorForm, setShowVendorForm] = useState(false);
  const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [serialEntryOpen, setSerialEntryOpen] = useState(false);
  const [serialEntryPO, setSerialEntryPO] = useState<PurchaseOrder | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [poResponse, vendorsResponse] = await Promise.all([
        supabase
          .from('purchase_orders')
          .select(`
            *,
             supplier:suppliers(*),
             purchase_order_items(
               id,
               item_type,
               inventory_item_id,
               assembly_id,
               quantity,
               stocking_quantity,
               inventory_item:inventory_items(id, sku, sales_description, serial_tracking_type),
               assembly:assemblies(id, sku, sales_description, serial_tracking_type)
             )
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('suppliers')
          .select('*')
          .order('name')
      ]);

      if (poResponse.error) throw poResponse.error;
      if (vendorsResponse.error) throw vendorsResponse.error;

      setPurchaseOrders(poResponse.data || []);
      setVendors(vendorsResponse.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load purchase orders data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePO = async (id: string) => {
    try {
      const { error } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setPurchaseOrders(prev => prev.filter(po => po.id !== id));
      toast({
        title: 'Success',
        description: 'Purchase order deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting purchase order:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete purchase order',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteVendor = async (id: string) => {
    try {
      const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setVendors(prev => prev.filter(s => s.id !== id));
      toast({
        title: 'Success',
        description: 'Vendor deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting vendor:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete vendor',
        variant: 'destructive',
      });
    }
  };

  const filteredPOs = purchaseOrders.filter(po =>
    po.purchase_order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    po.supplier?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const poHasManualSerialItems = (po: PurchaseOrder) => {
    const items = (po.purchase_order_items || []) as any[];
    return items.some((i) => {
      const trackingType = i?.inventory_item?.serial_tracking_type || i?.assembly?.serial_tracking_type;
      return trackingType === 'manual';
    });
  };

  const filteredVendors = vendors.filter(vendor =>
    vendor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    vendor.contact_person?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-secondary';
      case 'sent': return 'bg-blue-500';
      case 'partial': return 'bg-orange-500';
      case 'delivered': return 'bg-green-500';
      case 'cancelled': return 'bg-red-500';
      case 'closed': return 'bg-muted-foreground';
      default: return 'bg-secondary';
    }
  };

  const stats = {
    totalPOs: purchaseOrders.length,
    totalValue: purchaseOrders.reduce((sum, po) => sum + Number(po.total_amount), 0),
    pendingPOs: purchaseOrders.filter(po => ['sent', 'confirmed', 'partial'].includes(po.status)).length,
    activeVendors: vendors.filter(s => s.is_active).length,
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Purchase Order Management</h1>
          <p className="text-muted-foreground">Manage purchase orders and suppliers</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <Package className="h-8 w-8 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Total POs</p>
                <p className="text-2xl font-bold">{stats.totalPOs}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <DollarSign className="h-8 w-8 text-green-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Total Value</p>
                <p className="text-2xl font-bold"><FinancialGuard kind="supplier_price">{formatCurrency(stats.totalValue)}</FinancialGuard></p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <Truck className="h-8 w-8 text-orange-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold">{stats.pendingPOs}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <Package className="h-8 w-8 text-purple-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Vendors</p>
                <p className="text-2xl font-bold">{stats.activeVendors}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="purchase-orders" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="purchase-orders">Purchase Orders</TabsTrigger>
          <TabsTrigger value="vendors">Vendors</TabsTrigger>
        </TabsList>

        <TabsContent value="purchase-orders">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Purchase Orders</CardTitle>
                  <CardDescription>Manage all purchase orders</CardDescription>
                </div>
                <Button onClick={() => setShowPOForm(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Purchase Order
                </Button>
              </div>
              <div className="flex items-center space-x-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search purchase orders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-sm"
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredPOs.map((po) => (
                  <Card key={po.id}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold">{po.purchase_order_number}</h3>
                            <Badge className={getStatusColor(po.status)}>
                              {po.status}
                            </Badge>
                          </div>
                           <p className="text-muted-foreground mb-1">
                             Vendor: {po.supplier?.name}
                           </p>
                          <p className="text-sm text-muted-foreground">
                            Order Date: {format(new Date(po.order_date), 'MMM dd, yyyy')}
                          </p>
                          {po.expected_delivery_date && (
                            <p className="text-sm text-muted-foreground">
                              Expected: {format(new Date(po.expected_delivery_date), 'MMM dd, yyyy')}
                            </p>
                          )}
                          <p className="font-semibold mt-2">
                            Total: {formatCurrency(Number(po.total_amount))}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {poHasManualSerialItems(po) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSerialEntryPO(po);
                                setSerialEntryOpen(true);
                              }}
                            >
                              <Key className="mr-2 h-4 w-4" />
                              Enter Serials
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingPO(po);
                              setShowPOForm(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeletePO(po.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {filteredPOs.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No purchase orders found
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vendors">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Vendors</CardTitle>
                  <CardDescription>Manage vendor information</CardDescription>
                </div>
                <Button onClick={() => setShowVendorForm(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Vendor
                </Button>
              </div>
              <div className="flex items-center space-x-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search vendors..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-sm"
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredVendors.map((vendor) => (
                  <Card key={vendor.id}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold">{vendor.name}</h3>
                            <Badge variant={vendor.is_active ? "default" : "secondary"}>
                              {vendor.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          {vendor.contact_person && (
                            <p className="text-muted-foreground mb-1">
                              Contact: {vendor.contact_person}
                            </p>
                          )}
                          {vendor.email && (
                            <p className="text-sm text-muted-foreground">
                              Email: {vendor.email}
                            </p>
                          )}
                          {vendor.phone && (
                            <p className="text-sm text-muted-foreground">
                              Phone: {vendor.phone}
                            </p>
                          )}
                          <p className="text-sm text-muted-foreground">
                            Lead Time: {vendor.lead_time_days} days
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingVendor(vendor);
                              setShowVendorForm(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteVendor(vendor.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {filteredVendors.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No vendors found
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {showPOForm && (
        <PurchaseOrderForm
          purchaseOrder={editingPO}
          suppliers={vendors}
          onClose={() => {
            setShowPOForm(false);
            setEditingPO(null);
          }}
          onSuccess={() => {
            fetchData();
            setShowPOForm(false);
            setEditingPO(null);
          }}
        />
      )}

      {showVendorForm && (
        <VendorForm
          vendor={editingVendor}
          onClose={() => {
            setShowVendorForm(false);
            setEditingVendor(null);
          }}
          onSuccess={() => {
            fetchData();
            setShowVendorForm(false);
            setEditingVendor(null);
          }}
        />
      )}

      {serialEntryPO && (
        <POSerialEntryModal
          open={serialEntryOpen}
          onOpenChange={(open) => {
            setSerialEntryOpen(open);
            if (!open) setSerialEntryPO(null);
          }}
          purchaseOrderId={serialEntryPO.id}
          purchaseOrderNumber={serialEntryPO.purchase_order_number}
          items={(serialEntryPO.purchase_order_items || []) as any[]}
          onSuccess={() => {
            fetchData();
          }}
        />
      )}
    </div>
  );
}