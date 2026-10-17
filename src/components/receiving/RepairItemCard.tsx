import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Edit, Trash2, Stethoscope, Clock, Play, Pause, Square, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useRepairTimer } from "@/hooks/useRepairTimer";
import { ComprehensiveRepairItemModal } from "./ComprehensiveRepairItemModal";
import { DiagnoseItemModal } from "./DiagnoseItemModal";
import { ItemInRepairModal } from "./ItemInRepairModal";
import { RepairItemSummary } from "./InboundPackageCard";
import { formatHoursToHrMin } from "@/lib/utils";
import { getRepairItemRibbon, shouldMuteInRepairQueue } from "@/lib/repair-item-status-ui";
interface RepairItemCardProps {
  item: RepairItemSummary;
  packageId: string;
}

const statusBadgeVariant = (status: string) => {
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

export const RepairItemCard: React.FC<RepairItemCardProps> = ({ item, packageId }) => {
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDiagnoseModal, setShowDiagnoseModal] = useState(false);
  const [showInRepairModal, setShowInRepairModal] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const { toast } = useToast();

  // Get company ID for the item
  useEffect(() => {
    const fetchCompanyId = async () => {
      try {
        const { data: packageData } = await supabase
          .from('inbound_packages')
          .select('company_id')
          .eq('id', packageId)
          .single();
        
        if (packageData) {
          setCompanyId(packageData.company_id);
        }
      } catch (error) {
        console.error('Error fetching company ID:', error);
      }
    };

    fetchCompanyId();
  }, [packageId]);

  // Get item status info for ribbon using shared helper
  const itemStatusInfo = getRepairItemRibbon(item.status);
  
  // Check if item should be muted (in shipping phase)
  const isMuted = shouldMuteInRepairQueue(item.status);

  const handleDeleteItem = async () => {
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

  const handleStatusAction = () => {
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

  const getStatusActionLabel = () => {
    switch (item.status) {
      case 'logged':
        return 'Diagnose';
      case 'diagnosed':
        return 'Start Repair';
      case 'in_repair':
        return 'Continue Repair';
      default:
        return null;
    }
  };

  const getStatusActionIcon = () => {
    switch (item.status) {
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

  const StatusActionIcon = getStatusActionIcon();
  const statusActionLabel = getStatusActionLabel();

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className={`hover:shadow-md transition-shadow overflow-hidden ${
              isMuted 
                ? 'border-2 border-dashed border-muted-foreground/30 opacity-50' 
                : 'border-2 border-gray-400 dark:border-gray-500'
            }`}>
              {/* Item Status Ribbon */}
              <div className={`w-full py-1 px-2 text-center text-xs font-medium text-white ${itemStatusInfo.bgClass} ${isMuted ? 'flex items-center justify-center gap-1' : ''}`}>
                {isMuted && <Truck className="h-3 w-3" />}
                <div className="leading-tight">{itemStatusInfo.label}</div>
              </div>

              <CardHeader className="pb-2 pt-3 px-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm text-foreground truncate">
                      {item.item_name}
                    </h4>
                    {item.serial_number && (
                      <div className="text-xs text-muted-foreground">
                        S/N: {item.serial_number}
                      </div>
                    )}
                    {item.mac_address && (
                      <div className="text-xs text-muted-foreground">
                        MAC: {item.mac_address}
                      </div>
                    )}
                  </div>
                  {!isMuted && (
                    <div className="flex items-center gap-1 ml-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 w-6 p-0 border border-gray-400 dark:border-gray-500"
                              onClick={() => setShowDiagnoseModal(true)}
                            >
                              <Stethoscope className="h-2.5 w-2.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Diagnose item</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 w-6 p-0 border border-gray-400 dark:border-gray-500"
                              onClick={() => setShowEditModal(true)}
                            >
                              <Edit className="h-2.5 w-2.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Edit item</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 w-6 p-0 border border-red-500 text-red-500 hover:bg-red-400 hover:text-white hover:border-red-400"
                              onClick={() => setShowDeleteConfirmation(true)}
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Delete item</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  )}
                </div>
              </CardHeader>

        <CardContent className="pt-0 px-3 pb-3">
          <div className="space-y-1">
            {/* Problem Reported */}
            {item.problem_reported && (
              <div className="text-xs">
                <span className="font-medium">Problem:</span>
                <p className="text-muted-foreground line-clamp-2">
                  {item.problem_reported}
                </p>
              </div>
            )}

            {/* Diagnosis */}
            {item.diagnosis && (
              <div className="text-xs">
                <span className="font-medium">Diagnosis:</span>
                <p className="text-muted-foreground line-clamp-2">
                  {item.diagnosis}
                </p>
              </div>
            )}

            {/* Repairability and Cost in same row to save space */}
            <div className="flex items-center justify-between text-xs">
              {item.diagnosis_assessment && item.diagnosis_assessment !== 'unknown' && (
                <div className="flex items-center">
                  <span className="font-medium mr-1">Diagnosis:</span>
                  <Badge 
                    variant={item.diagnosis_assessment === 'repairable' ? 'default' : 'destructive'}
                    className="text-xs h-4 px-1"
                  >
                    {item.diagnosis_assessment}
                  </Badge>
                </div>
              )}
              {item.estimated_cost && (
                <div className="text-xs">
                  <span className="font-medium">Est:</span>
                  <span className="ml-1 font-mono">
                    ${item.estimated_cost.toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            {/* Timer and Action Button Row - hide if muted */}
            {!isMuted && (
              <div className="flex items-center justify-between gap-1 pt-1">
                {item.total_hours !== undefined && item.total_hours > 0 && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatHoursToHrMin(item.total_hours)}
                  </div>
                )}
                
                {/* Action Button - Only show if there's a clear workflow action */}
                {StatusActionIcon && statusActionLabel && (
                  <Button
                    size="sm"
                    onClick={handleStatusAction}
                    className="h-6 text-xs px-2 flex-1 max-w-28"
                    variant={item.status === 'in_repair' ? 'default' : 'outline'}
                  >
                    <StatusActionIcon className="h-3 w-3 mr-1" />
                    {statusActionLabel}
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
            </Card>
          </TooltipTrigger>
          {isMuted && (
            <TooltipContent>
              <p>This item is in the Shipping Queue</p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>

      {/* Modals */}
      <ComprehensiveRepairItemModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        mode="edit"
        packageId={packageId}
        editItem={{
          id: item.id,
          item_name: item.item_name,
          serial_number: item.serial_number || undefined,
          mac_address: item.mac_address || undefined,
          problem_reported: item.problem_reported || undefined,
          status: item.status || 'received',
          package_id: packageId
        }}
      />

      <DiagnoseItemModal
        isOpen={showDiagnoseModal}
        onClose={() => setShowDiagnoseModal(false)}
        item={{
          id: item.id,
          item_name: item.item_name,
          serial_number: item.serial_number,
          mac_address: item.mac_address,
          problem_reported: item.problem_reported,
          status: item.status || 'received',
          package_id: packageId,
          diagnosis: item.diagnosis,
          repairability: item.repairability,
          estimated_cost: item.estimated_cost
        }}
        itemIndex={0}
        totalItems={1}
      />

      <ItemInRepairModal
        isOpen={showInRepairModal}
        onClose={() => setShowInRepairModal(false)}
        item={{
          id: item.id,
          item_name: item.item_name,
          status: item.status || 'received',
          package_id: packageId
        }}
        companyId={companyId || undefined}
      />

      <AlertDialog open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Repair Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{item.item_name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteItem}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};