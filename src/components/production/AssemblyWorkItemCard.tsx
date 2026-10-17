import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Calendar, DollarSign, Package, Users } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface AssemblyWorkItem {
  id: string;
  work_item_number: string;
  assembly_sku: string;
  assembly_name: string;
  parent_order_number: string;
  customer_name: string;
  created_at: string;
  priority: string;
  status: string;
  work_item_position: number;
  total_work_items: number;
  unit_price?: number;
  notes?: string;
}

interface AssemblyWorkItemCardProps {
  workItem: AssemblyWorkItem;
  onAction: (workItemId: string, action: string) => void;
}

export const AssemblyWorkItemCard = ({ workItem, onAction }: AssemblyWorkItemCardProps) => {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'queued': return 'outline';
      case 'in_progress': return 'secondary';
      case 'completed': return 'default';
      default: return 'outline';
    }
  };

  return (
    <Card className="mb-3 hover:shadow-md transition-shadow border-l-4 border-l-primary">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div>
            <h4 className="font-semibold text-sm text-primary">{workItem.work_item_number}</h4>
            <p className="text-sm font-medium">{workItem.assembly_sku}</p>
            <p className="text-xs text-muted-foreground">{workItem.assembly_name}</p>
          </div>
          <div className="flex gap-1">
            <Badge variant={getPriorityColor(workItem.priority)} className="text-xs">
              {workItem.priority}
            </Badge>
            <Badge variant={getStatusColor(workItem.status)} className="text-xs">
              {workItem.status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Package className="w-3 h-3" />
            Item {workItem.work_item_position} of {workItem.total_work_items}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="w-3 h-3" />
            {workItem.parent_order_number} - {workItem.customer_name}
          </div>
          
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="w-3 h-3" />
            {format(new Date(workItem.created_at), 'MMM dd, yyyy')}
          </div>
          
          {workItem.unit_price && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <DollarSign className="w-3 h-3" />
              {formatCurrency(workItem.unit_price)}
            </div>
          )}

          {workItem.notes && (
            <p className="text-xs text-muted-foreground line-clamp-2">{workItem.notes}</p>
          )}

          <div className="flex gap-2 mt-3">
            {workItem.status === 'queued' && (
              <Button 
                size="sm" 
                variant="outline" 
                className="flex-1 text-xs"
                onClick={() => onAction(workItem.id, 'start_building')}
              >
                Start Building
              </Button>
            )}
            {workItem.status === 'in_progress' && (
              <Button 
                size="sm" 
                variant="default" 
                className="flex-1 text-xs"
                onClick={() => onAction(workItem.id, 'mark_complete')}
              >
                Mark Complete
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};