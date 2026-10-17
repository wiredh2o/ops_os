import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductionDashboard } from '@/components/production/ProductionDashboard';
import { InventoryManagement } from "@/components/inventory/InventoryManagement";
import { WasteAnalyticsDashboard } from "@/components/inventory/WasteAnalyticsDashboard";
import { AccountingDashboard } from "@/components/accounting/AccountingDashboard";
import { PurchaseOrderManagement } from "@/components/purchasing/PurchaseOrderManagement";
import { UserManagement } from "@/components/users/UserManagement";
import { CustomerManagement } from "@/components/customers/CustomerManagement";
import { VendorManagement } from "@/components/vendors/VendorManagement";
import { ReceivingDashboard } from "@/components/receiving/ReceivingDashboard";
import { RepairStatusLookup } from "@/components/customer-service/RepairStatusLookup";

const Index = () => {
  return (
    <div className="bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-4xl font-bold">Production Management System</h1>
        </div>
        
        <Tabs defaultValue="orders" className="w-full">
          <TabsList className="grid w-full grid-cols-10">
            <TabsTrigger value="orders">Customer Orders</TabsTrigger>
            <TabsTrigger value="inventory">Inventory & Assemblies</TabsTrigger>
            <TabsTrigger value="waste-analytics">Waste Analytics</TabsTrigger>
            <TabsTrigger value="purchasing">Purchase Orders</TabsTrigger>
            <TabsTrigger value="receiving">Receiving</TabsTrigger>
            <TabsTrigger value="repair-lookup">Repair Lookup</TabsTrigger>
            <TabsTrigger value="customers">Customer Management</TabsTrigger>
            <TabsTrigger value="vendors">Vendor Management</TabsTrigger>
            <TabsTrigger value="accounting">Accounting</TabsTrigger>
            <TabsTrigger value="users">User Management</TabsTrigger>
          </TabsList>
          
          <TabsContent value="orders" className="mt-6">
            <ProductionDashboard />
          </TabsContent>
          
        <TabsContent value="inventory" className="mt-6">
          <InventoryManagement />
        </TabsContent>
        
        <TabsContent value="waste-analytics" className="mt-6">
          <WasteAnalyticsDashboard />
        </TabsContent>
        
        <TabsContent value="purchasing" className="mt-6">
          <PurchaseOrderManagement />
        </TabsContent>
          
          <TabsContent value="receiving" className="mt-6">
            <ReceivingDashboard />
          </TabsContent>
          
          <TabsContent value="repair-lookup" className="mt-6">
            <RepairStatusLookup />
          </TabsContent>
          
          <TabsContent value="customers" className="mt-6">
            <CustomerManagement />
          </TabsContent>
          
          <TabsContent value="vendors" className="mt-6">
            <VendorManagement />
          </TabsContent>
          
          <TabsContent value="accounting" className="mt-6">
            <AccountingDashboard />
          </TabsContent>
          
          <TabsContent value="users" className="mt-6">
            <UserManagement />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Index;
