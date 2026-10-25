import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Building, Users, Grid3X3, ArrowUp, ArrowDown, ArrowUpDown, CreditCard } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CustomerForm } from './CustomerForm';
import { PriceLevelManagement } from './PriceLevelManagement';
import { CustomerCsvExporter } from './CustomerCsvExporter';
import { CustomerCsvImporter } from './CustomerCsvImporter';
import { CustomerShippingAddressCsvExporter } from './CustomerShippingAddressCsvExporter';
import { CustomerShippingAddressCsvImporter } from './CustomerShippingAddressCsvImporter';
import { BulkCustomerEditor } from './BulkCustomerEditor';
import { BulkStripeSync } from './BulkStripeSync';
import { CreditStatus } from './CreditStatus';
import { useCustomerCredit } from '@/hooks/useCustomerCredit';
import { canViewCredit } from '@/lib/credit-rules';

interface ShippingAddress {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  signature_required: boolean;
}

interface Customer {
  id: string;
  name: string;
  owners_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  is_active: boolean;
  is_distributor: boolean;
  is_taxable?: boolean;
  billing_address?: string;
  shipping_addresses: ShippingAddress[];
  default_shipping_address_id?: string;
  preferred_shipping_carrier?: string;
  created_at: string;
  updated_at: string;
  customer_number?: number;
  start_date?: string;
  last_trans_date?: string;
}

export function CustomerManagement() {
  const { user, roles } = useAuth();
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [customerTypeFilter, setCustomerTypeFilter] = useState<'all' | 'distributors' | 'retail'>('all');
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [showBulkEditor, setShowBulkEditor] = useState(false);
  const [showBulkStripeSync, setShowBulkStripeSync] = useState(false);
  const [currentUserRoles, setCurrentUserRoles] = useState<string[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [userDataLoading, setUserDataLoading] = useState(true);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    loadCurrentUserData();
  }, [user]);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const loadCurrentUserData = async () => {
    if (!user) {
      setUserDataLoading(false);
      return;
    }

    try {
      // Load user roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (rolesError) throw rolesError;
      setCurrentUserRoles(rolesData.map(r => r.role));

      // Load user profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;
      setCurrentUserProfile(profileData);
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setUserDataLoading(false);
    }
  };

  const canEditCustomer = (customer: Customer): boolean => {
    // Admins and sales support can edit any customer
    if (currentUserRoles.includes('admin') || currentUserRoles.includes('sales_support')) {
      return true;
    }
    
    // Car wash admins can only edit their associated customer
    if (currentUserRoles.includes('car_wash_admin')) {
      return currentUserProfile?.company_id === customer.id;
    }
    
    return false;
  };

  const canDeleteCustomer = (customer: Customer): boolean => {
    // Car wash admins cannot delete or make inactive their associated customer
    if (currentUserRoles.includes('car_wash_admin')) {
      return false;
    }
    
    // Only admins and sales support can delete customers
    return currentUserRoles.includes('admin') || currentUserRoles.includes('sales_support');
  };

  const canCreateCustomer = (): boolean => {
    return currentUserRoles.includes('admin') || currentUserRoles.includes('sales_support');
  };

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const allCustomers: any[] = [];
      const batchSize = 1000;
      let hasMore = true;
      let offset = 0;

      // Fetch in batches to get around Supabase's 1000 row limit
      while (hasMore) {
        const { data, error } = await supabase
          .from('companies')
          .select('*')
          .order('customer_number', { ascending: true })
          .range(offset, offset + batchSize - 1);

        if (error) throw error;
        
        if (data && data.length > 0) {
          allCustomers.push(...data);
          console.log(`Fetched batch: ${data.length} customers (offset: ${offset})`);
          offset += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }
      
      console.log(`Total fetched: ${allCustomers.length} customers from database`);
      
      // Parse shipping_addresses JSON field and ensure signature_required field
      const customersWithParsedData = allCustomers.map((customer) => {
        try {
          return {
            ...customer,
            shipping_addresses: (typeof customer.shipping_addresses === 'string' 
              ? JSON.parse(customer.shipping_addresses || '[]')
              : customer.shipping_addresses || []
            ).map((addr: any) => ({
              ...addr,
              signature_required: addr.signature_required ?? false
            }))
          };
        } catch (parseError) {
          console.error(`Error parsing customer ${customer.customer_number}:`, parseError);
          return {
            ...customer,
            shipping_addresses: []
          };
        }
      });
      
      console.log(`Processed ${customersWithParsedData.length} customers successfully`);
      setCustomers(customersWithParsedData);
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast({
        title: 'Error',
        description: 'Failed to load customers',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCustomer = async (customerId: string) => {
    try {
      const { error } = await supabase
        .from('companies')
        .delete()
        .eq('id', customerId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Customer deleted successfully',
      });
      
      fetchCustomers();
    } catch (error) {
      console.error('Error deleting customer:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete customer',
        variant: 'destructive',
      });
    }
  };

  // Handle sort toggle
  const handleSort = (field: string) => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortField(null);
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Render sort icon for column headers
  const renderSortIcon = (field: string) => {
    if (sortField === field) {
      return sortDirection === 'asc' 
        ? <ArrowUp className="w-4 h-4" /> 
        : <ArrowDown className="w-4 h-4" />;
    }
    return <ArrowUpDown className="w-4 h-4 text-muted-foreground" />;
  };

  // Filter customers based on user role and customer type
  const getFilteredCustomers = () => {
    let baseFiltered = customers.filter(customer =>
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.owners_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.customer_number?.toString().includes(searchTerm)
    );
    
    // Apply customer type filter
    if (customerTypeFilter === 'distributors') {
      baseFiltered = baseFiltered.filter(customer => customer.is_distributor);
    } else if (customerTypeFilter === 'retail') {
      baseFiltered = baseFiltered.filter(customer => !customer.is_distributor);
    }
    
    // Car wash admins can only see their associated customer
    if (currentUserRoles.includes('car_wash_admin') && currentUserProfile?.company_id) {
      baseFiltered = baseFiltered.filter(customer => customer.id === currentUserProfile.company_id);
    }
    
    // Apply sorting
    if (sortField) {
      baseFiltered = [...baseFiltered].sort((a, b) => {
        let aVal: any;
        let bVal: any;

        switch (sortField) {
          case 'customer_number':
            aVal = a.customer_number ?? 0;
            bVal = b.customer_number ?? 0;
            break;
          case 'name':
            aVal = a.name?.toLowerCase() ?? '';
            bVal = b.name?.toLowerCase() ?? '';
            break;
          case 'owners_name':
            aVal = a.owners_name?.toLowerCase() ?? '';
            bVal = b.owners_name?.toLowerCase() ?? '';
            break;
          case 'email':
            aVal = a.email?.toLowerCase() ?? '';
            bVal = b.email?.toLowerCase() ?? '';
            break;
          case 'phone':
            aVal = a.phone ?? '';
            bVal = b.phone ?? '';
            break;
          case 'is_distributor':
            aVal = a.is_distributor ? 1 : 0;
            bVal = b.is_distributor ? 1 : 0;
            break;
          case 'is_active':
            aVal = a.is_active ? 1 : 0;
            bVal = b.is_active ? 1 : 0;
            break;
          default:
            return 0;
        }

        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }
    
    return baseFiltered;
  };
  
  const filteredCustomers = getFilteredCustomers();
  const showCredit = canViewCredit(roles);
  const { data: creditMap = {} } = useCustomerCredit(filteredCustomers.map((c) => c.id));

  const stats = {
    total: customers.length,
    active: customers.filter(c => c.is_active).length,
    inactive: customers.filter(c => !c.is_active).length,
  };

  if (loading || userDataLoading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Customer Management</h2>
          <p className="text-muted-foreground">Manage customers and price levels</p>
        </div>
        {canCreateCustomer() && (
          <Button onClick={() => setShowCustomerForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Customer
          </Button>
        )}
      </div>

      <Tabs defaultValue="customers" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="price-levels">Price Levels</TabsTrigger>
        </TabsList>
        
        <TabsContent value="customers" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
                <Building className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Customers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.active}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Inactive Customers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.inactive}</div>
              </CardContent>
            </Card>
          </div>

          {/* Search and Actions */}
          <div className="flex items-center justify-between space-x-2">
            <div className="flex items-center space-x-2 flex-1">
              <Search className="w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search customers by name, number, owner, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-md"
              />
              <Select value={customerTypeFilter} onValueChange={(value) => setCustomerTypeFilter(value as 'all' | 'distributors' | 'retail')}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  <SelectItem value="distributors">Distributors</SelectItem>
                  <SelectItem value="retail">Retail</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 flex-wrap">
              {canCreateCustomer() && (
                <>
                  <Button variant="outline" onClick={() => setShowBulkEditor(true)}>
                    <Grid3X3 className="w-4 h-4 mr-2" />
                    Bulk Edit
                  </Button>
                  <Button variant="outline" onClick={() => setShowBulkStripeSync(true)}>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Stripe Sync
                  </Button>
                </>
              )}
              <CustomerCsvImporter onImported={fetchCustomers} />
              <CustomerCsvExporter />
              <CustomerShippingAddressCsvImporter onImported={fetchCustomers} />
              <CustomerShippingAddressCsvExporter />
            </div>
          </div>

          {/* Customers Table */}
          <Card>
            <CardHeader>
              <CardTitle>{filteredCustomers.length} Customers</CardTitle>
              <CardDescription>
                Manage your car wash business customers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table className="table-fixed w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead 
                      className="w-[90px] cursor-pointer select-none hover:bg-muted/50"
                      onClick={() => handleSort('customer_number')}
                    >
                      <div className="flex items-center gap-1">
                        Customer #
                        {renderSortIcon('customer_number')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="w-[160px] cursor-pointer select-none hover:bg-muted/50"
                      onClick={() => handleSort('name')}
                    >
                      <div className="flex items-center gap-1">
                        Name
                        {renderSortIcon('name')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="w-[120px] cursor-pointer select-none hover:bg-muted/50"
                      onClick={() => handleSort('owners_name')}
                    >
                      <div className="flex items-center gap-1">
                        Owner
                        {renderSortIcon('owners_name')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="w-[120px] cursor-pointer select-none hover:bg-muted/50"
                      onClick={() => handleSort('email')}
                    >
                      <div className="flex items-center gap-1">
                        Email
                        {renderSortIcon('email')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="w-[110px] cursor-pointer select-none hover:bg-muted/50"
                      onClick={() => handleSort('phone')}
                    >
                      <div className="flex items-center gap-1">
                        Phone
                        {renderSortIcon('phone')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="w-[130px] cursor-pointer select-none hover:bg-muted/50"
                      onClick={() => handleSort('is_distributor')}
                    >
                      <div className="flex items-center gap-1">
                        Type
                        {renderSortIcon('is_distributor')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="w-[80px] cursor-pointer select-none hover:bg-muted/50"
                      onClick={() => handleSort('is_active')}
                    >
                      <div className="flex items-center gap-1">
                        Status
                        {renderSortIcon('is_active')}
                      </div>
                    </TableHead>
                    {showCredit && <TableHead className="w-[200px]">Credit</TableHead>}
                    <TableHead className="w-[150px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-mono text-sm">{customer.customer_number}</TableCell>
                      <TableCell className="font-medium truncate" title={customer.name}>{customer.name}</TableCell>
                      <TableCell className="truncate" title={customer.owners_name || 'N/A'}>{customer.owners_name || 'N/A'}</TableCell>
                      <TableCell className="truncate max-w-[120px]" title={customer.email || 'N/A'}>{customer.email || 'N/A'}</TableCell>
                      <TableCell>{customer.phone || 'N/A'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {customer.is_distributor && (
                            <Badge variant="default">Distributor</Badge>
                          )}
                          {!customer.is_taxable && (
                            <Badge variant="secondary">Tax-Exempt</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={customer.is_active ? 'default' : 'secondary'}>
                          {customer.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      {showCredit && (
                        <TableCell>
                          <CreditStatus compact credit={creditMap[customer.id]} />
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingCustomer(customer);
                              setShowCustomerForm(true);
                            }}
                            disabled={!canEditCustomer(customer)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteCustomer(customer.id)}
                            disabled={!canDeleteCustomer(customer)}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="price-levels" className="space-y-6">
          <PriceLevelManagement />
        </TabsContent>
      </Tabs>

      {/* Customer Form */}
      {showCustomerForm && (
        <CustomerForm
          customer={editingCustomer}
          onClose={() => {
            setShowCustomerForm(false);
            setEditingCustomer(null);
          }}
          onSuccess={() => {
            setShowCustomerForm(false);
            setEditingCustomer(null);
            fetchCustomers();
          }}
        />
      )}

      {/* Bulk Editor */}
      {showBulkEditor && (
        <BulkCustomerEditor
          customers={filteredCustomers}
          onClose={() => setShowBulkEditor(false)}
          onSaved={() => {
            setShowBulkEditor(false);
            fetchCustomers();
          }}
        />
      )}

      {/* Bulk Stripe Sync */}
      <BulkStripeSync
        open={showBulkStripeSync}
        onClose={() => setShowBulkStripeSync(false)}
        onComplete={fetchCustomers}
      />
    </div>
  );
}