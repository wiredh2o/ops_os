import React, { useState, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Edit, Trash2, Stethoscope, Clock, Play, Pause, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ComprehensiveRepairItemModal } from "./ComprehensiveRepairItemModal";
import { DiagnoseItemModal } from "./DiagnoseItemModal";
import { ItemInRepairModal } from "./ItemInRepairModal";
import { CreateRepairShipmentModal } from "./CreateRepairShipmentModal";
import { RepairItemSummary } from "./InboundPackageCard";
import { formatHoursToHrMin } from "@/lib/utils";
import { getRepairItemStatusLabel, shouldMuteInRepairQueue } from "@/lib/repair-item-status-ui";
interface RepairItemTableProps {
  items: RepairItemSummary[];
  packageId: string;
}

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case "received":
      return "secondary" as const;
    case "diagnosed":
      return "outline" as const;
    case "in_repair":
      return "destructive" as const;
    case "repaired":
      return "default" as const;
    default:
      return "outline" as const;
  }
};

const getStatusLabel = (item: RepairItemSummary) => {
  return getRepairItemStatusLabel(item.status);
};

const truncateText = (text: string | null | undefined, maxLength: number) => {
  if (!text) return '';
  return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
};

export const RepairItemTable: React.FC<RepairItemTableProps> = ({ items, packageId }) => {
  const [selectedItem, setSelectedItem] = useState<RepairItemSummary | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDiagnoseModal, setShowDiagnoseModal] = useState(false);
  const [showInRepairModal, setShowInRepairModal] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [showShipmentModal, setShowShipmentModal] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [trackingNumber, setTrackingNumber] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('Unknown Company');
  const { toast } = useToast();

  // Count completed items ready to ship
  const completedItems = useMemo(() => {
    return items.filter(item => item.status === 'completed');
  }, [items]);
  // Get package data for shipment modal
  useEffect(() => {
    const fetchPackageData = async () => {
      try {
        const { data: packageData } = await supabase
          .from('inbound_packages')
          .select(`
            company_id,
            tracking_number,
            companies:company_id (name)
          `)
          .eq('id', packageId)
          .single();
        
        if (packageData) {
          setCompanyId(packageData.company_id);
          setTrackingNumber(packageData.tracking_number);
          setCompanyName((packageData.companies as any)?.name || 'Unknown Company');
        }
      } catch (error) {
        console.error('Error fetching package data:', error);
      }
    };

    fetchPackageData();
  }, [packageId]);

  const handleDeleteItem = async (item: RepairItemSummary) => {
    try {
      // Delete from database - both the repair item and its link to the package
      const { error: deleteItemLinkError } = await supabase
        .from('inbound_package_items')
        .delete()
        .eq('repair_item_id', item.id);

      if (deleteItemLinkError) throw deleteItemLinkError;

      const { error: deleteRepairError } = await supabase
        .from('repair_items')
        .delete()
        .eq('id', item.id);

      if (deleteRepairError) throw deleteRepairError;

      toast({
        title: "Item Deleted",
        description: "Repair item has been successfully deleted.",
      });

      // Dispatch custom event to refresh the data
      const event = new CustomEvent('repair-item-deleted', { 
        detail: { 
          packageId: packageId,
          itemId: item.id
        } 
      });
      window.dispatchEvent(event);
    } catch (error) {
      console.error('Error deleting repair item:', error);
      toast({
        title: "Error",
        description: "Failed to delete repair item. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleStatusAction = (item: RepairItemSummary) => {
    setSelectedItem(item);
    switch (item.status) {
      case 'logged':
        setShowDiagnoseModal(true);
        break;
      case 'diagnosed':
      case 'in_repair':
      case 'completed':
        setShowInRepairModal(true);
        break;
      default:
        setShowDiagnoseModal(true);
    }
  };

  const getStatusActionLabel = (status: string) => {
    switch (status) {
      case 'logged':
        return 'Diagnose';
      case 'diagnosed':
        return 'Start';
      case 'in_repair':
        return 'Continue';
      default:
        return null;
    }
  };

  const getStatusActionIcon = (status: string) => {
    switch (status) {
      case 'logged':
        return Stethoscope;
      case 'diagnosed':
        return Play;
      case 'in_repair':
        return Pause;
      default:
        return null;
    }
  };

  const openEditModal = (item: RepairItemSummary) => {
    setSelectedItem(item);
    setShowEditModal(true);
  };

  const openDiagnoseModal = (item: RepairItemSummary) => {
    setSelectedItem(item);
    setShowDiagnoseModal(true);
  };

  const openDeleteConfirmation = (item: RepairItemSummary) => {
    setSelectedItem(item);
    setShowDeleteConfirmation(true);
  };

  return (
    <>
      {/* Ready to Ship Banner */}
      {completedItems.length > 0 && (
        <div className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-950/30 border-b border-green-200 dark:border-green-800">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium text-green-700 dark:text-green-300">
              {completedItems.length} item{completedItems.length !== 1 ? 's' : ''} ready to ship
            </span>
          </div>
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white"
            onClick={() => setShowShipmentModal(true)}
          >
            <Truck className="h-3 w-3 mr-1" />
            Create Shipment Order
          </Button>
        </div>
      )}

      <ScrollArea className="h-full">
        <Table>
          <TableHeader>
            <TableRow className="border-orange-200 dark:border-orange-800">
              <TableHead className="text-orange-800 dark:text-orange-200 font-semibold w-24">Status</TableHead>
              <TableHead className="text-orange-800 dark:text-orange-200 font-semibold min-w-32">Item</TableHead>
              <TableHead className="text-orange-800 dark:text-orange-200 font-semibold w-20">S/N</TableHead>
              <TableHead className="text-orange-800 dark:text-orange-200 font-semibold w-24">MAC</TableHead>
              <TableHead className="text-orange-800 dark:text-orange-200 font-semibold min-w-32">Problem</TableHead>
              <TableHead className="text-orange-800 dark:text-orange-200 font-semibold min-w-32">Diagnosis</TableHead>
              <TableHead className="text-orange-800 dark:text-orange-200 font-semibold w-20">Repair</TableHead>
              <TableHead className="text-orange-800 dark:text-orange-200 font-semibold w-16 text-right">Cost</TableHead>
              <TableHead className="text-orange-800 dark:text-orange-200 font-semibold w-16">Time</TableHead>
              <TableHead className="text-orange-800 dark:text-orange-200 font-semibold w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const StatusActionIcon = getStatusActionIcon(item.status || '');
              const statusActionLabel = getStatusActionLabel(item.status || '');
              const isMuted = shouldMuteInRepairQueue(item.status);
              
              return (
                <TooltipProvider key={item.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <TableRow className={`border-orange-100 dark:border-orange-900 ${
                        isMuted 
                          ? 'opacity-50 bg-muted/30' 
                          : 'hover:bg-orange-50/50 dark:hover:bg-orange-950/20'
                      }`}>
                  <TableCell className="p-2">
                    <Badge 
                      variant={getStatusBadgeVariant(item.status || '')}
                      className="text-xs h-5 px-1.5 whitespace-nowrap"
                    >
                      {getStatusLabel(item)}
                    </Badge>
                  </TableCell>
                  
                  <TableCell className="p-2">
                    <div className="font-medium text-sm">{item.item_name}</div>
                  </TableCell>
                  
                  <TableCell className="p-2 text-xs text-muted-foreground">
                    {truncateText(item.serial_number, 12)}
                  </TableCell>
                  
                  <TableCell className="p-2 text-xs text-muted-foreground font-mono">
                    {truncateText(item.mac_address, 12)}
                  </TableCell>
                  
                  <TableCell className="p-2">
                    {item.problem_reported && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="text-xs cursor-help">
                              {truncateText(item.problem_reported, 30)}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">{item.problem_reported}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </TableCell>
                  
                  <TableCell className="p-2">
                    {item.diagnosis && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="text-xs cursor-help">
                              {truncateText(item.diagnosis, 30)}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">{item.diagnosis}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </TableCell>
                  
                  <TableCell className="p-2">
                    {item.diagnosis_assessment && item.diagnosis_assessment !== 'unknown' && (
                      <Badge 
                        variant={item.diagnosis_assessment === 'repairable' ? 'default' : 'destructive'}
                        className="text-xs h-4 px-1"
                      >
                        {item.diagnosis_assessment === 'repairable' ? 'Yes' : 'No'}
                      </Badge>
                    )}
                  </TableCell>
                  
                  <TableCell className="p-2 text-right">
                    {item.estimated_cost && (
                      <span className="text-xs font-mono">
                        ${item.estimated_cost.toFixed(0)}
                      </span>
                    )}
                  </TableCell>
                  
                  <TableCell className="p-2">
                    {item.total_hours !== undefined && item.total_hours > 0 && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatHoursToHrMin(item.total_hours)}
                      </div>
                    )}
                  </TableCell>
                  
                  <TableCell className="p-2">
                    {isMuted ? (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Truck className="h-3 w-3" />
                        <span>In Shipping</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        {StatusActionIcon && statusActionLabel && (
                          <Button
                            size="sm"
                            onClick={() => handleStatusAction(item)}
                            className="h-6 text-xs px-2"
                            variant={item.status === 'in_repair' ? 'default' : 'outline'}
                          >
                            <StatusActionIcon className="h-3 w-3 mr-1" />
                            {statusActionLabel}
                          </Button>
                        )}
                        
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0"
                                onClick={() => openDiagnoseModal(item)}
                              >
                                <Stethoscope className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Diagnose</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0"
                                onClick={() => openEditModal(item)}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Edit</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-red-500 hover:bg-red-50 hover:text-red-600"
                                onClick={() => openDeleteConfirmation(item)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Delete</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    )}
                  </TableCell>
                      </TableRow>
                    </TooltipTrigger>
                    {isMuted && (
                      <TooltipContent>
                        <p>This item is in the Shipping Queue</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>

      {/* Modals */}
      {selectedItem && (
        <>
          <ComprehensiveRepairItemModal
            isOpen={showEditModal}
            onClose={() => {
              setShowEditModal(false);
              setSelectedItem(null);
            }}
            mode="edit"
            packageId={packageId}
            editItem={{
              id: selectedItem.id,
              item_name: selectedItem.item_name,
              serial_number: selectedItem.serial_number || undefined,
              mac_address: selectedItem.mac_address || undefined,
              problem_reported: selectedItem.problem_reported || undefined,
              status: selectedItem.status || 'received',
              package_id: packageId
            }}
          />

          <DiagnoseItemModal
            isOpen={showDiagnoseModal}
            onClose={() => {
              setShowDiagnoseModal(false);
              setSelectedItem(null);
            }}
            item={{
              id: selectedItem.id,
              item_name: selectedItem.item_name,
              serial_number: selectedItem.serial_number,
              mac_address: selectedItem.mac_address,
              problem_reported: selectedItem.problem_reported,
              status: selectedItem.status || 'received',
              package_id: packageId,
              diagnosis: selectedItem.diagnosis,
              repairability: selectedItem.repairability,
              estimated_cost: selectedItem.estimated_cost
            }}
            itemIndex={0}
            totalItems={1}
          />

          <ItemInRepairModal
            isOpen={showInRepairModal}
            onClose={() => {
              setShowInRepairModal(false);
              setSelectedItem(null);
            }}
            item={{
              id: selectedItem.id,
              item_name: selectedItem.item_name,
              status: selectedItem.status || 'received',
              package_id: packageId
            }}
            companyId={companyId || undefined}
          />

          <AlertDialog 
            open={showDeleteConfirmation} 
            onOpenChange={(open) => {
              setShowDeleteConfirmation(open);
              if (!open) setSelectedItem(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Repair Item</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{selectedItem.item_name}"? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    handleDeleteItem(selectedItem);
                    setShowDeleteConfirmation(false);
                    setSelectedItem(null);
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </>
      )}

      {/* Create Shipment Modal */}
      <CreateRepairShipmentModal
        isOpen={showShipmentModal}
        onClose={() => setShowShipmentModal(false)}
        packageId={packageId}
        companyId={companyId}
        companyName={companyName}
        trackingNumber={trackingNumber}
      />
    </>
  );
};