import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import { TaxLines } from "./TaxLines";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { Calendar, Package, Truck, AlertCircle, Pencil, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { getCustomerOrderRibbon } from "@/lib/repair-item-status-ui";

export interface CustomerOrderLineItem {
  id: string;
  item_name: string;
  item_description: string;
  item_type: string;
  quantity_ordered: number;
  unit_price: number;
  line_total: number;
}

export interface CustomerOrderSummary {
  id: string;
  order_number: string;
  order_status: string;
  payment_status: string;
  priority: string;
  shipping_preference: string;
  due_date: string | null;
  deposit_paid: boolean;
  deposit_amount: number;
  estimated_shipping: number;
  notes: string | null;
  created_at: string;
  company_name: string;
  company_id: string;
  item_count: number;
  total_item_quantity: number;
  order_total: number;
  quantity_ordered: number;
  quantity_invoiced: number;
  hasInventoryShortage: boolean;
  hasAssemblyShortage: boolean;
  line_items: CustomerOrderLineItem[];
  is_taxable: boolean;
  tax_amount: number;
  tax_lines?: unknown;
  tax_review_required?: boolean;
  customer_po: string | null;
  is_one_time_card?: boolean;
  stripe_payment_method_id?: string | null;
  stripe_customer_id?: string | null;
}

interface CustomerOrderCardProps {
  order: CustomerOrderSummary;
  onFulfill: (orderId: string) => void;
   onEdit: (orderId: string) => void;
   onDelete: (orderId: string) => void;
}

 export const CustomerOrderCard = ({ order, onFulfill, onEdit, onDelete }: CustomerOrderCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const quantityRemaining = order.quantity_ordered - order.quantity_invoiced;
  const fulfillmentProgress = order.quantity_ordered > 0 
    ? Math.round((order.quantity_invoiced / order.quantity_ordered) * 100) 
    : 0;

    const ribbonInfo = getCustomerOrderRibbon(
      order.order_status, 
      order.payment_status,
      {
        hasInventoryShortage: order.hasInventoryShortage,
        hasAssemblyShortage: order.hasAssemblyShortage,
      }
    );

  const getPriorityIndicator = (priority: string) => {
    switch (priority) {
      case 'rush':
        return <Badge variant="destructive" className="text-xs">Rush</Badge>;
      case 'high':
        return <Badge className="text-xs bg-status-progress text-status-progress-foreground">High</Badge>;
      default:
        return null;
    }
  };

  return (
     <Card className="mb-3 hover:shadow-md transition-shadow overflow-hidden border-2 border-gray-400 dark:border-gray-500">
       {/* Status Ribbon */}
       <div className={`w-full py-1 px-2 text-center text-xs font-medium text-white ${ribbonInfo.bgClass}`}>
         {ribbonInfo.label}
       </div>
       
       {/* Ship As Available Badge */}
       {order.shipping_preference === 'ship_as_available' && (
        <div className="px-3 pt-2 flex justify-center">
          <Badge variant="outline" className="text-xs border-orange-500 text-orange-600 dark:text-orange-400">
             <Truck className="w-3 h-3 mr-1" />
             Ship As Available
           </Badge>
         </div>
       )}

      <CardHeader className="pb-2 pt-3 px-3">
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm text-foreground truncate">
              {order.company_name}
            </h4>
            <p className="text-xs text-muted-foreground">{order.order_number}</p>
            {order.customer_po && (
              <p className="text-xs text-muted-foreground">PO# {order.customer_po}</p>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
             <Button
               variant="ghost"
               size="icon"
               className="h-6 w-6"
               onClick={(e) => {
                 e.stopPropagation();
                 onEdit(order.id);
               }}
             >
               <Pencil className="h-3 w-3" />
             </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-5 w-5 p-0 border border-red-500 text-red-500 hover:bg-red-400 hover:text-white hover:border-red-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(order.id);
                      }}
                    >
                      <Trash2 className="h-2 w-2" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Delete order</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            {getPriorityIndicator(order.priority)}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 px-3 pb-3">
        <div className="space-y-2">
          {/* Date */}
          <div className="flex items-center text-xs">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="w-3 h-3" />
              {format(new Date(order.created_at), 'MMM dd, yyyy')}
            </span>
          </div>

          {/* Due Date if set */}
          {order.due_date && (
            <div className="flex items-center gap-1 text-xs text-status-progress">
              <AlertCircle className="w-3 h-3" />
              Due: {format(new Date(order.due_date), 'MMM dd, yyyy')}
            </div>
          )}

          {/* SKUs and Total Items */}
          <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Package className="w-3 h-3" />
              {order.item_count} SKUs
            </span>
            <span className="flex items-center gap-1">
              <Package className="w-3 h-3" />
              {order.total_item_quantity} total items
            </span>
          </div>

          {/* Expandable Details */}
          {order.line_items && order.line_items.length > 0 && (
            <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-1 p-0 h-auto text-xs text-muted-foreground hover:text-foreground hover:bg-transparent"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <span>Details</span>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="bg-muted/50 rounded-md p-2 space-y-1.5">
                  {/* Line items */}
                  {order.line_items.map((item) => (
                    <Tooltip key={item.id}>
                      <TooltipTrigger asChild>
                        <div className="flex justify-between items-center text-xs cursor-help">
                          <span className="text-foreground truncate max-w-[140px]">
                            {item.item_name} <span className="text-muted-foreground">×{item.quantity_ordered}</span>
                          </span>
                          <span className="text-muted-foreground"><FinancialGuard kind="revenue">{formatCurrency(item.line_total)}</FinancialGuard></span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        <div className="text-xs space-y-1">
                          <div><strong>SKU:</strong> {item.item_name}</div>
                          <div><strong>Item:</strong> {item.item_description}</div>
                          <div><strong>Quantity:</strong> {item.quantity_ordered}</div>
                          <div><strong>Line Total:</strong> <FinancialGuard kind="revenue">{formatCurrency(item.line_total)}</FinancialGuard></div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                  
                  {/* Totals section */}
                  <div className="border-t border-border pt-1.5 mt-1.5 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Subtotal:</span>
                      <span className="text-foreground"><FinancialGuard kind="revenue">{formatCurrency(order.order_total)}</FinancialGuard></span>
                    </div>
                    <TaxLines lines={order.tax_lines} legacyAmount={order.tax_amount} reviewRequired={order.tax_review_required} />
                    <div className="border-t border-border pt-1 mt-1">
                      <div className="flex justify-end text-xs font-semibold">
                        <span className="text-foreground">
                          Total: <FinancialGuard kind="revenue">{formatCurrency(order.order_total + order.tax_amount)}</FinancialGuard>
                        </span>
                        <span className="font-normal text-muted-foreground ml-1">(Plus Shipping)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Total when collapsed */}
          {!isExpanded && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <FinancialGuard kind="revenue">{formatCurrency(order.order_total + order.tax_amount)}</FinancialGuard>
              <span className="text-muted-foreground">(Plus Shipping)</span>
            </div>
          )}

          {/* Notes */}
          {order.notes && (
            <p className="text-xs text-muted-foreground line-clamp-1">{order.notes}</p>
          )}

          {/* Fulfillment Progress - always directly above button */}
          {order.quantity_invoiced > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Fulfilled</span>
                <span>{order.quantity_invoiced}/{order.quantity_ordered}</span>
              </div>
              <Progress value={fulfillmentProgress} className="h-1.5" />
            </div>
          )}

          {/* Fulfill Action */}
          <Button 
            size="sm" 
            className="w-full text-xs mt-2"
            onClick={() => onFulfill(order.id)}
          >
            {quantityRemaining < order.quantity_ordered ? 'Continue Fulfilling' : 'Fulfill Order'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
