import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import { TaxLines } from "./TaxLines";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { Calendar, DollarSign, Phone, Mail, Trash2, ChevronDown, ChevronRight, Stethoscope, Package, Printer } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { getShippingOrderRibbon, getPaymentRibbon } from "@/lib/repair-item-status-ui";
import { usePaymentTerms } from "@/hooks/usePaymentTerms";
import { findTerm, termKind } from "@/lib/credit-rules";
import { DiagnoseItemModal } from "@/components/receiving/DiagnoseItemModal";

export interface RepairItemData {
  id: string;
  item_name: string;
  serial_number?: string | null;
  mac_address?: string | null;
  problem_reported?: string | null;
  package_id?: string | null;
  diagnosis?: string | null;
  diagnosis_assessment?: string | null;
  completion_outcome?: string | null;
  estimated_cost?: number | null;
  status?: string | null;
  assigned_tray?: string | null;
  unboxing_order?: number | null;
  package_item_count?: number | null;
}

export interface OrderLineItem {
  id: string;
  item_name: string;
  item_sku?: string | null;
  item_type?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  is_taxable: boolean;
  tax_amount: number;
  repair_item_id?: string;
  repair_item_name?: string;
  repair_item_data?: RepairItemData;
}

interface GroupedRepairItem {
  repair_item_id: string;
  repair_item_name: string;
  repair_item_data?: RepairItemData;
  parts: OrderLineItem[];
}

interface KanbanCardProps {
  order: {
    id: string;
    order_number: string;
    customer_name: string;
    created_at: string;
    priority: string;
    status: string;
    total_amount?: number;
    notes?: string;
    customer_email?: string;
    customer_phone?: string;
    shipping_preference?: string;
    store_at_point_of_use?: boolean;
    order_type?: string;
    customer_po?: string;
    line_items?: OrderLineItem[];
    tax_total?: number;
    tax_lines?: unknown;
    tax_review_required?: boolean;
    shipping_cost?: number;
    payment_status?: string;
    payment_terms?: string;
    label_created_at?: string;
    preferred_shipping_carrier?: string;
  };
  type: 'production' | 'fulfillment';
  archived?: boolean;
  onAction: (orderId: string, action: string) => void;
  onDelete?: (orderId: string) => void;
  onPrintPackingSlip?: (orderId: string) => void;
}

export const KanbanCard = ({ order, type, onAction, onDelete, onPrintPackingSlip, archived = false }: KanbanCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedRepairItem, setSelectedRepairItem] = useState<RepairItemData | null>(null);
  const [showDiagnosisModal, setShowDiagnosisModal] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'outline';
      case 'approved': return 'default';
      case 'in_progress': return 'secondary';
      case 'completed': return 'default';
      default: return 'outline';
    }
  };

  const workflowRibbon = type === 'fulfillment' ? getShippingOrderRibbon(order.status) : null;
  const { data: termsList = [] } = usePaymentTerms();
  const cardTerm = findTerm(termsList, order.payment_terms);
  const paymentRibbon = type === 'fulfillment'
    ? getPaymentRibbon(order.payment_status, termKind(cardTerm) === 'prepay' ? 'due_in_advance' : order.payment_terms, order.label_created_at, termKind(cardTerm) === 'net' ? cardTerm?.net_days : 0)
    : null;
  
  const lineItems = order.line_items || [];
  const hasLineItems = lineItems.length > 0;
  const subtotal = lineItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
  const taxTotal = order.tax_total ?? lineItems.reduce((sum, item) => sum + (item.tax_amount || 0), 0);
  const hasLabel = order.status === 'label_created' || order.status === 'shipped';
  const shippingCost = order.shipping_cost || 0;

  // Group line items by repair item
  const groupedByRepairItem: GroupedRepairItem[] = [];
  const ungroupedItems: OrderLineItem[] = [];

  lineItems.forEach((item) => {
    if (item.repair_item_id && item.repair_item_name) {
      const existingGroup = groupedByRepairItem.find(g => g.repair_item_id === item.repair_item_id);
      if (existingGroup) {
        existingGroup.parts.push(item);
      } else {
        groupedByRepairItem.push({
          repair_item_id: item.repair_item_id,
          repair_item_name: item.repair_item_name,
          repair_item_data: item.repair_item_data,
          parts: [item],
        });
      }
    } else {
      ungroupedItems.push(item);
    }
  });

  const hasGroupedItems = groupedByRepairItem.length > 0;
  const grandTotal = hasLabel ? subtotal + taxTotal + shippingCost : subtotal + taxTotal;

  // Calculate SKU count and total item quantity for fulfillment display
  const skuCount = lineItems.length;
  const totalItemQuantity = lineItems.reduce((sum, item) => sum + (item.quantity || 0), 0);

  return (
    <Card className="mb-3 hover:shadow-md transition-shadow overflow-hidden border-2 border-gray-400 dark:border-gray-500">
      {/* Two-column Status Ribbon for fulfillment orders */}
      {type === 'fulfillment' && workflowRibbon && paymentRibbon && (
        <div className="flex w-full">
          {/* Workflow Status - Left */}
          <div className={`flex-1 py-1 px-2 text-center text-xs font-medium text-white ${workflowRibbon.bgClass}`}>
            {workflowRibbon.label}
          </div>
          {/* Payment Status - Right */}
          <div className={`flex-1 py-1 px-2 text-center text-xs font-medium text-white ${paymentRibbon.bgClass}`}>
            {paymentRibbon.label}
          </div>
        </div>
      )}
      <CardHeader className="pb-2 pt-3 px-3">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h4 className="font-semibold text-sm text-foreground">
              {order.customer_name}
            </h4>
            {order.customer_po && (
              <p className="text-xs text-muted-foreground">PO# {order.customer_po}</p>
            )}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{order.order_number}</p>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {format(new Date(order.created_at), 'MMM dd, yyyy')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {type === 'fulfillment' && !archived && onPrintPackingSlip && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Print packing slip"
                      onClick={(event) => { event.stopPropagation(); onPrintPackingSlip(order.id); }}>
                      <Printer className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Print packing slip</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {/* Only show status badge for production type */}
            {type === 'production' && (
              <Badge variant={getStatusColor(order.status)} className="text-xs">
                {order.status}
              </Badge>
            )}
            {onDelete && (
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
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 px-3 pb-3">
        <div className="space-y-2">
          
          {order.total_amount && !hasLineItems && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <DollarSign className="w-3 h-3" />
              <FinancialGuard kind="revenue">{formatCurrency(order.total_amount)}</FinancialGuard>
            </div>
          )}

          {/* SKUs and Total Items - only for fulfillment with line items */}
          {type === 'fulfillment' && hasLineItems && (
            <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Package className="w-3 h-3" />
                {skuCount} SKUs
              </span>
              <span className="flex items-center gap-1">
                <Package className="w-3 h-3" />
                {totalItemQuantity} total items
              </span>
            </div>
          )}

          {type === 'fulfillment' && order.shipping_preference === 'ship_as_available' && (
            <div className="text-xs">
              <Badge variant="outline" className="text-xs border-orange-500 text-orange-600">
                Ship As Available
              </Badge>
            </div>
          )}

          {/* Pick-Up indicator - shows when customer prefers in-person pickup */}
          {type === 'fulfillment' && order.preferred_shipping_carrier === 'Pick-Up' && (
            <div className="text-xs">
              <Badge variant="outline" className="text-xs border-teal-500 text-teal-600 bg-teal-50 dark:bg-teal-950">
                🏪 Pick-Up Order
              </Badge>
            </div>
          )}

          {type === 'production' && order.store_at_point_of_use && (
            <div className="text-xs">
              <Badge variant="secondary" className="text-xs">Store at Point of Use</Badge>
            </div>
          )}

          {type === 'fulfillment' && (order.customer_email || order.customer_phone) && (
            <div className="space-y-1">
              {order.customer_email && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Mail className="w-3 h-3" />
                  {order.customer_email}
                </div>
              )}
              {order.customer_phone && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Phone className="w-3 h-3" />
                  {order.customer_phone}
                </div>
              )}
            </div>
          )}

          {order.notes && (
            <p className="text-xs text-muted-foreground line-clamp-2">{order.notes}</p>
          )}

          {/* Expandable Details Section for fulfillment orders */}
          {type === 'fulfillment' && hasLineItems && (
            <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-1 p-0 h-auto text-xs text-muted-foreground hover:text-foreground hover:bg-transparent"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span>Details ({hasGroupedItems ? `${groupedByRepairItem.length} repaired` : `${lineItems.length} items`})</span>
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-2">
                <TooltipProvider>
                  <div className="bg-muted/50 rounded-md p-2 space-y-2">
                    {/* Grouped repair items */}
                    {groupedByRepairItem.map((group) => (
                      <div key={group.repair_item_id} className="space-y-1">
                        <div className="text-xs font-medium text-foreground border-b border-border/50 pb-1 flex justify-between items-center">
                          <span>{group.repair_item_name}</span>
                  {group.repair_item_data && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-5 w-5 p-0 border border-gray-400 dark:border-gray-500 hover:bg-orange-500 hover:border-orange-500 group/diagbtn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRepairItem(group.repair_item_data!);
                            setShowDiagnosisModal(true);
                          }}
                        >
                          <Stethoscope className="h-3 w-3 group-hover/diagbtn:text-white" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>View Diagnosis</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                        </div>
                        {group.parts.map((item) => (
                          <Tooltip key={item.id}>
                            <TooltipTrigger asChild>
                              <div className="flex justify-between items-center text-xs pl-2 cursor-help">
                                <span className="text-muted-foreground truncate max-w-[130px]">
                                  {item.item_sku || item.item_name} <span className="text-muted-foreground/70">×{item.quantity}</span>
                                </span>
                                <span className="text-muted-foreground">
                                  <FinancialGuard kind="revenue">{formatCurrency(item.total_price)}</FinancialGuard>
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="left">
                              <div className="text-xs space-y-1">
                                {item.item_sku && <div><strong>SKU:</strong> {item.item_sku}</div>}
                                <div><strong>Item:</strong> {item.item_name}</div>
                                <div><strong>Quantity:</strong> {item.quantity}</div>
                                <div><strong>Line Total:</strong> <FinancialGuard kind="revenue">{formatCurrency(item.total_price)}</FinancialGuard></div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                    ))}

                    {/* Ungrouped items (no repair item associated) */}
                    {ungroupedItems.length > 0 && (
                      <div className="space-y-1">
                        {hasGroupedItems && (
                          <div className="text-xs font-medium text-foreground border-b border-border/50 pb-1">
                            Other Items
                          </div>
                        )}
                        {ungroupedItems.map((item) => (
                          <Tooltip key={item.id}>
                            <TooltipTrigger asChild>
                              <div className="flex justify-between items-center text-xs cursor-help">
                                <span className="text-foreground truncate max-w-[150px]">
                                  {item.item_sku || item.item_name} <span className="text-muted-foreground">×{item.quantity}</span>
                                </span>
                                <span className="text-muted-foreground">
                                  <FinancialGuard kind="revenue">{formatCurrency(item.total_price)}</FinancialGuard>
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="left">
                              <div className="text-xs space-y-1">
                                {item.item_sku && <div><strong>SKU:</strong> {item.item_sku}</div>}
                                <div><strong>Item:</strong> {item.item_name}</div>
                                <div><strong>Quantity:</strong> {item.quantity}</div>
                                <div><strong>Line Total:</strong> <FinancialGuard kind="revenue">{formatCurrency(item.total_price)}</FinancialGuard></div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                    )}
                    
                    <div className="border-t border-border pt-1.5 mt-1.5 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Subtotal:</span>
                        <span className="text-foreground"><FinancialGuard kind="revenue">{formatCurrency(subtotal)}</FinancialGuard></span>
                      </div>
                      <TaxLines lines={order.tax_lines} legacyAmount={taxTotal} reviewRequired={order.tax_review_required} />
                      {hasLabel && shippingCost > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Shipping:</span>
                          <span className="text-foreground"><FinancialGuard kind="revenue">{formatCurrency(shippingCost)}</FinancialGuard></span>
                        </div>
                      )}
                      <div className="border-t border-border pt-1 mt-1">
                        <div className="flex justify-end text-xs font-semibold">
                          <span className="text-foreground">
                            Total: <FinancialGuard kind="revenue">{formatCurrency(grandTotal)}</FinancialGuard>
                          </span>
                          {!hasLabel && <span className="font-normal text-muted-foreground ml-1">(Plus Shipping)</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                </TooltipProvider>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Show total with plus shipping note when collapsed for fulfillment */}
          {type === 'fulfillment' && hasLineItems && !isExpanded && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <FinancialGuard kind="revenue">{formatCurrency(grandTotal)}</FinancialGuard>
              {!hasLabel && <span className="text-muted-foreground">(Plus Shipping)</span>}
            </div>
          )}

          <div className="flex gap-2 mt-3">
            {type === 'production' && (
              <>
                {order.status === 'pending' && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="flex-1 text-xs"
                    onClick={() => onAction(order.id, 'start_building')}
                  >
                    Start Building
                  </Button>
                )}
                {order.status === 'in_progress' && (
                  <Button 
                    size="sm" 
                    variant="default" 
                    className="flex-1 text-xs"
                    onClick={() => onAction(order.id, 'mark_complete')}
                  >
                    Mark Complete
                  </Button>
                )}
              </>
            )}
            
            {type === 'fulfillment' && !archived && (
              <Button 
                size="sm" 
                variant="default" 
                className="flex-1 text-xs"
                onClick={() => onAction(order.id, 'ship_order')}
              >
                Ship Order
              </Button>
            )}
          </div>
        </div>
      </CardContent>

      {/* Read-only Diagnosis Modal */}
      {selectedRepairItem && (
        <DiagnoseItemModal
          isOpen={showDiagnosisModal}
          onClose={() => {
            setShowDiagnosisModal(false);
            setSelectedRepairItem(null);
          }}
          item={{
            id: selectedRepairItem.id,
            item_name: selectedRepairItem.item_name,
            serial_number: selectedRepairItem.serial_number,
            mac_address: selectedRepairItem.mac_address,
            problem_reported: selectedRepairItem.problem_reported,
            package_id: selectedRepairItem.package_id || undefined,
            diagnosis: selectedRepairItem.diagnosis,
            diagnosis_assessment: selectedRepairItem.diagnosis_assessment,
            completion_outcome: selectedRepairItem.completion_outcome,
            estimated_cost: selectedRepairItem.estimated_cost,
            status: selectedRepairItem.status,
          }}
          itemIndex={selectedRepairItem?.unboxing_order || 1}
          totalItems={selectedRepairItem?.package_item_count || 1}
          trayNumber={selectedRepairItem?.assigned_tray || undefined}
          readOnly={true}
        />
      )}
    </Card>
  );
};
