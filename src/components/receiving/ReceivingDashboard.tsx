import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Wrench, Clipboard, Armchair, RotateCcw, ExternalLink, PackageX } from "lucide-react";
import { RepairOrderQueueKanban } from "./RepairOrderQueueKanban";
import { InventoryReceivingForm } from "./forms/InventoryReceivingForm";
import { SuppliesReceivingForm } from "./forms/SuppliesReceivingForm";
import { FurnitureReceivingForm } from "./forms/FurnitureReceivingForm";
import { ReturnsReceivingForm } from "./forms/ReturnsReceivingForm";
import { UnifiedPackageModal } from "./UnifiedPackageModal";
import { useNavigate } from "react-router-dom";

type ReceivingCategory = 'inventory' | 'repairs' | 'supplies' | 'furniture' | 'returns' | null;

export function ReceivingDashboard() {
  const [selectedCategory, setSelectedCategory] = useState<ReceivingCategory>(null);
  const [showPackageReceiptModal, setShowPackageReceiptModal] = useState(false);
  const navigate = useNavigate();

  const categories = [
    {
      id: 'inventory' as const,
      title: 'Inventory',
      icon: Package,
      description: 'Receive inventory items and update stock levels'
    },
    {
      id: 'repairs' as const,
      title: 'Repairs',
      icon: Wrench,
      description: 'Process inbound repair orders and packages'
    },
    {
      id: 'supplies' as const,
      title: 'Supplies',
      icon: Clipboard,
      description: 'Receive office and operational supplies'
    },
    {
      id: 'furniture' as const,
      title: 'Furniture',
      icon: Armchair,
      description: 'Receive furniture and equipment with asset tracking'
    },
    {
      id: 'returns' as const,
      title: 'Product Returns',
      icon: RotateCcw,
      description: 'Process returned products and handle refunds'
    },
    {
      id: 'orphaned' as const,
      title: 'Orphaned Packages',
      icon: PackageX,
      description: 'Assign unassigned packages to companies'
    }
  ];

  const handleCategoryClick = (categoryId: string) => {
    if (categoryId === 'orphaned') {
      navigate('/receiving/orphaned-packages');
    } else {
      setSelectedCategory(categoryId as ReceivingCategory);
    }
  };

  const renderCategoryContent = () => {
    switch (selectedCategory) {
      case 'inventory':
        return <InventoryReceivingForm onBack={() => setSelectedCategory(null)} />;
      case 'repairs':
        return (
          <div>
            <Button 
              variant="outline" 
              onClick={() => setSelectedCategory(null)}
              className="mb-4"
            >
              ← Back to Categories
            </Button>
            <UnifiedPackageModal 
              open={true} 
              onOpenChange={() => setSelectedCategory(null)} 
              mode="receive"
            />
          </div>
        );
      case 'supplies':
        return <SuppliesReceivingForm onBack={() => setSelectedCategory(null)} />;
      case 'furniture':
        return <FurnitureReceivingForm onBack={() => setSelectedCategory(null)} />;
      case 'returns':
        return <ReturnsReceivingForm onBack={() => setSelectedCategory(null)} />;
      default:
        return null;
    }
  };

  if (selectedCategory) {
    return (
      <div className="space-y-6">
        {renderCategoryContent()}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Receiving Dashboard</h2>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {categories.map((category) => {
          const IconComponent = category.icon;
          return (
            <Card 
              key={category.id} 
              className="hover:shadow-lg hover:bg-muted/20 transition-all cursor-pointer max-w-xs mx-auto"
              onClick={() => handleCategoryClick(category.id)}
            >
              <CardHeader className="text-center p-4">
                <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-2 ring-2 ring-primary/20">
                  <IconComponent className="w-8 h-8 text-primary" strokeWidth={2.5} />
                </div>
                <CardTitle className="text-lg">{category.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-center p-4 pt-0">
                <p className="text-sm text-muted-foreground">{category.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <RepairOrderQueueKanban fullWidth />

      <UnifiedPackageModal 
        open={showPackageReceiptModal} 
        onOpenChange={setShowPackageReceiptModal} 
        mode="receive"
      />
    </div>
  );
}