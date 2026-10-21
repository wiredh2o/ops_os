import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useStaffTabPermissions } from '@/hooks/usePermissions';
import { STAFF_TABS } from '@/hooks/staff-tab-access';
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
import { useAuth } from '@/hooks/useAuth';
import { canRequestRma, canReceiveRma } from '@/lib/rma';

const Index = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const activeTab = pathname.replace(/\/$/, "").split("/")[2] || "orders";
  const { visibleTabs, loading, error } = useStaffTabPermissions();
  const { roles } = useAuth();
  if (loading) return <div className="container mx-auto p-6" role="status">Loading...</div>;
  if (error) return <div className="container mx-auto p-6 text-destructive" role="alert">Unable to load your access. Please refresh the page.</div>;
  if (visibleTabs.length === 0 && (canRequestRma(roles) || canReceiveRma(roles))) return <Navigate to="/rma" replace />;
  if (visibleTabs.length === 0) return <div className="container mx-auto p-6">No staff screens are available for your account.</div>;
  if (!visibleTabs.some(tab => tab === activeTab)) return <Navigate to={`/staff/${visibleTabs[0]}`} replace />;

  return (
    <div className="bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-4xl font-bold">Production Management System</h1>
        </div>
        
        <Tabs value={activeTab} onValueChange={(tab) => navigate(`/staff/${tab}`)} className="w-full">
          <TabsList className="flex w-full justify-start overflow-x-auto">
            {STAFF_TABS.filter(tab => visibleTabs.includes(tab.id)).map(tab => (
              <TabsTrigger key={tab.id} value={tab.id} className="flex-1">{tab.label}</TabsTrigger>
            ))}
          </TabsList>
          
          {visibleTabs.includes('orders') && <TabsContent value="orders" className="mt-6">
            <ProductionDashboard />
          </TabsContent>}
          
        {visibleTabs.includes('inventory') && <TabsContent value="inventory" className="mt-6">
          <InventoryManagement />
        </TabsContent>}
        
        {visibleTabs.includes('waste-analytics') && <TabsContent value="waste-analytics" className="mt-6">
          <WasteAnalyticsDashboard />
        </TabsContent>}
        
        {visibleTabs.includes('purchasing') && <TabsContent value="purchasing" className="mt-6">
          <PurchaseOrderManagement />
        </TabsContent>}
          
          {visibleTabs.includes('receiving') && <TabsContent value="receiving" className="mt-6">
            <ReceivingDashboard />
          </TabsContent>}
          
          {visibleTabs.includes('repair-lookup') && <TabsContent value="repair-lookup" className="mt-6">
            <RepairStatusLookup />
          </TabsContent>}
          
          {visibleTabs.includes('customers') && <TabsContent value="customers" className="mt-6">
            <CustomerManagement />
          </TabsContent>}
          
          {visibleTabs.includes('vendors') && <TabsContent value="vendors" className="mt-6">
            <VendorManagement />
          </TabsContent>}
          
          {visibleTabs.includes('accounting') && <TabsContent value="accounting" className="mt-6">
            <AccountingDashboard />
          </TabsContent>}
          
          {visibleTabs.includes('users') && <TabsContent value="users" className="mt-6">
            <UserManagement />
          </TabsContent>}
        </Tabs>
      </div>
    </div>
  );
};

export default Index;
