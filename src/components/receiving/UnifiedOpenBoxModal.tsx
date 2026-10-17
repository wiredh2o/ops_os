import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Camera, X, Hash, PackageCheck, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { InboundPackage } from "./InboundPackageCard";
import { INCOMPLETE_REPAIR_ITEM_STATUSES } from "@/lib/repair-queue-filter";

interface UnifiedOpenBoxModalProps {
  isOpen: boolean;
  onClose: () => void;
  package: InboundPackage;
  mode: 'unbox' | 'edit';
  onSuccess?: () => void;
}

export const UnifiedOpenBoxModal: React.FC<UnifiedOpenBoxModalProps> = ({
  isOpen,
  onClose,
  package: pkg,
  mode,
  onSuccess
}) => {
  const [itemCount, setItemCount] = useState("");
  const [selectedTray, setSelectedTray] = useState("");
  const [unboxingNotes, setUnboxingNotes] = useState("");
  const [customerPo, setCustomerPo] = useState("");
  const [packageImages, setPackageImages] = useState<(string | File)[]>([]);
  const [trayInfo, setTrayInfo] = useState<{ tray: number; customerName?: string; isOccupied: boolean }[]>([]);
  const [loadingTrays, setLoadingTrays] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingItemsCount, setExistingItemsCount] = useState(0);
  const [shippingPreference, setShippingPreference] = useState<'ship_complete' | 'ship_as_available'>('ship_complete');
  const { toast } = useToast();

  // Load data when modal opens
  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit') {
        loadUnboxData();
        loadPackageImages();
        loadExistingItemsCount();
        loadShippingPreference();
      } else {
        setItemCount("1");
        setSelectedTray("");
        setUnboxingNotes("");
        setCustomerPo("");
        setPackageImages([]);
        setExistingItemsCount(0);
        setShippingPreference(pkg?.shipping_preference === 'ship_as_available' ? 'ship_as_available' : 'ship_complete');
      }
      fetchAvailableTrays();
    }
  }, [isOpen, mode]);

  const loadExistingItemsCount = async () => {
    if (!pkg?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('repair_items')
        .select('id')
        .eq('package_id', pkg.id);

      if (error) throw error;
      
      setExistingItemsCount(data?.length || 0);
    } catch (error) {
      console.error('Error loading existing items count:', error);
      setExistingItemsCount(0);
    }
  };

  const loadUnboxData = async () => {
    if (!pkg?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('inbound_packages')
        .select('intake_notes, item_count, assigned_tray, shipping_preference, customer_po')
        .eq('id', pkg.id)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        const packageData = data as any;
        setUnboxingNotes(packageData.intake_notes || "");
        setItemCount(packageData.item_count?.toString() || "1");
        setSelectedTray(packageData.assigned_tray || "");
        setShippingPreference((packageData.shipping_preference as 'ship_complete' | 'ship_as_available') || 'ship_complete');
        setCustomerPo(packageData.customer_po || "");
      }
    } catch (error) {
      console.error('Error loading unbox data:', error);
    }
  };

  const loadShippingPreference = async () => {
    if (!pkg?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('inbound_packages')
        .select('shipping_preference')
        .eq('id', pkg.id)
        .maybeSingle();

      if (error) throw error;
      setShippingPreference((data?.shipping_preference as 'ship_complete' | 'ship_as_available') || 'ship_complete');
    } catch (error) {
      console.error('Error loading shipping preference:', error);
    }
  };

  const fetchAvailableTrays = async () => {
    setLoadingTrays(true);
    try {
      // Get trays that have packages with incomplete repair items, including company info
      const { data: occupiedPackages, error } = await supabase
        .from('inbound_packages')
        .select(`
          assigned_tray,
          company:companies(name),
          repair_items!inner(status)
        `)
        .not('assigned_tray', 'is', null);

      if (error) throw error;

      // Build a map of occupied trays with customer names
      // Use shared status constants - items occupy tray until shipped
      const incompleteStatuses: string[] = [...INCOMPLETE_REPAIR_ITEM_STATUSES];
      const occupiedTrayMap = new Map<number, string>();
      
      (occupiedPackages || []).forEach(p => {
        const hasIncompleteItems = p.repair_items.some(
          (item: { status: string }) => incompleteStatuses.includes(item.status)
        );
        if (hasIncompleteItems && p.assigned_tray) {
          const trayNum = parseInt(p.assigned_tray);
          if (!isNaN(trayNum)) {
            const customerName = p.company?.name || 'Unknown Customer';
            occupiedTrayMap.set(trayNum, customerName);
          }
        }
      });

      // If editing, the current package's tray should be selectable
      const currentTray = mode === 'edit' && pkg?.assigned_tray 
        ? parseInt(pkg.assigned_tray) 
        : null;

      // Generate all trays 1-40 with occupation info
      const allTraysInfo = Array.from({ length: 40 }, (_, i) => {
        const trayNum = i + 1;
        const isCurrentTray = trayNum === currentTray;
        const customerName = occupiedTrayMap.get(trayNum);
        const isOccupied = customerName !== undefined && !isCurrentTray;
        
        return {
          tray: trayNum,
          customerName: isOccupied ? customerName : undefined,
          isOccupied
        };
      });

      setTrayInfo(allTraysInfo);
    } catch (error) {
      console.error('Error fetching available trays:', error);
      // Fallback to all trays on error
      const allTraysInfo = Array.from({ length: 40 }, (_, i) => ({
        tray: i + 1,
        customerName: undefined,
        isOccupied: false
      }));
      setTrayInfo(allTraysInfo);
    } finally {
      setLoadingTrays(false);
    }
  };

  const loadPackageImages = async () => {
    if (!pkg?.id) return;
    
    try {
      const { data: imageRecords, error } = await supabase
        .from('package_images')
        .select('storage_path')
        .eq('package_id', pkg.id);

      if (error) throw error;

      const imageUrls = await Promise.all(
        (imageRecords || []).map(async (record) => {
          const { data } = supabase.storage
            .from('package-images')
            .getPublicUrl(record.storage_path);
          return data.publicUrl;
        })
      );

      setPackageImages(imageUrls);
    } catch (error) {
      console.error('Error loading package images:', error);
    }
  };

  const handleImageCapture = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !pkg?.id) return;

    if (mode === 'unbox') {
      // For unbox mode, just store locally until submit
      if (packageImages.length < 3) {
        setPackageImages(prev => [...prev, file]);
      }
    } else {
      // For edit mode, upload immediately
      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${pkg.id}/${Date.now()}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('package-images')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { error: dbError } = await supabase
          .from('package_images')
          .insert({
            package_id: pkg.id,
            storage_path: uploadData.path,
            original_filename: file.name,
            content_type: file.type,
            file_size: file.size,
          });

        if (dbError) throw dbError;

        const { data } = supabase.storage
          .from('package-images')
          .getPublicUrl(uploadData.path);

        setPackageImages(prev => [...prev, data.publicUrl]);

        toast({
          title: "Success",
          description: "Image uploaded successfully",
        });
      } catch (error: any) {
        toast({
          title: "Error",
          description: "Failed to upload image",
          variant: "destructive",
        });
      }
    }
  };

  const removeImage = async (index: number) => {
    const image = packageImages[index];
    
    if (mode === 'edit' && typeof image === 'string' && pkg?.id) {
      // Remove from storage and database for edit mode
      try {
        const { data: imageRecords, error: findError } = await supabase
          .from('package_images')
          .select('id, storage_path')
          .eq('package_id', pkg.id);

        if (findError) throw findError;

        const imageRecord = imageRecords?.[index];
        if (imageRecord) {
          const { error: storageError } = await supabase.storage
            .from('package-images')
            .remove([imageRecord.storage_path]);

          if (storageError) throw storageError;

          const { error: dbError } = await supabase
            .from('package_images')
            .delete()
            .eq('id', imageRecord.id);

          if (dbError) throw dbError;
        }

        toast({
          title: "Success",
          description: "Image removed successfully",
        });
      } catch (error: any) {
        toast({
          title: "Error",
          description: "Failed to remove image",
          variant: "destructive",
        });
      }
    }

    setPackageImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleItemCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const numValue = parseInt(value);
    
    // If in edit mode and there are existing items, enforce minimum
    if (mode === 'edit' && existingItemsCount > 0 && numValue < existingItemsCount) {
      toast({
        title: "Invalid Item Count",
        description: `Item count cannot be less than ${existingItemsCount} (number of already unboxed items).`,
        variant: "destructive"
      });
      return;
    }
    
    setItemCount(value);
  };

  const handleSubmit = async () => {
    // Validate item count before submission
    const itemCountNum = parseInt(itemCount);
    if (!itemCount || itemCountNum <= 0 || isNaN(itemCountNum)) {
      toast({
        title: "Invalid Item Count",
        description: "Please enter a valid item count (must be a positive number).",
        variant: "destructive"
      });
      return;
    }

    // Additional validation for edit mode
    if (mode === 'edit' && existingItemsCount > 0 && itemCountNum < existingItemsCount) {
      toast({
        title: "Invalid Item Count",
        description: `Item count cannot be less than ${existingItemsCount} (number of already unboxed items).`,
        variant: "destructive"
      });
      return;
    }

    if (!selectedTray) {
      toast({
        title: "Missing Information",
        description: "Please select a tray for the items.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === 'unbox') {
        // Update the package status with item count and tray assignment
        const { error: packageError } = await supabase
          .from('inbound_packages')
          .update({ 
            status: 'opened',
            received_at: new Date().toISOString(),
            intake_notes: unboxingNotes || null,
            item_count: itemCountNum,
            assigned_tray: selectedTray,
            shipping_preference: shippingPreference,
            customer_po: customerPo.trim() || null
          })
          .eq('id', pkg.id);

        if (packageError) throw packageError;

        // Set 5 minutes baseline for any repair items in this package
        const { error: itemsError } = await supabase
          .from('repair_items')
          .update({
            total_accumulated_hours: 0.0833 // 5 minutes in hours
          })
          .eq('package_id', pkg.id);

        if (itemsError) {
          console.error('Error updating repair items:', itemsError);
          // Don't fail the whole operation for this, just log it
        }

        // Upload any captured images
        if (packageImages.length > 0) {
          await Promise.all(
            packageImages.map(async (image, index) => {
              if (image instanceof File) {
                try {
                  const fileExt = image.name.split('.').pop();
                  const fileName = `${pkg.id}/${Date.now()}-${index}.${fileExt}`;

                  const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('package-images')
                    .upload(fileName, image);

                  if (uploadError) throw uploadError;

                  const { error: dbError } = await supabase
                    .from('package_images')
                    .insert({
                      package_id: pkg.id,
                      storage_path: uploadData.path,
                      original_filename: image.name,
                      content_type: image.type,
                      file_size: image.size,
                    });

                  if (dbError) throw dbError;
                } catch (error) {
                  console.error(`Error uploading image ${index + 1}:`, error);
                }
              }
            })
          );
        }

        toast({
          title: "Package Box Opened",
          description: `Successfully opened package box`,
        });

        // Dispatch event to refresh UI
        const event = new CustomEvent('package-updated', { 
          detail: { packageId: pkg.id } 
        });
        window.dispatchEvent(event);
      } else {
        // Update existing unboxing information including item count and tray assignment
        const { error: packageError } = await supabase
          .from('inbound_packages')
          .update({ 
            intake_notes: unboxingNotes || null,
            item_count: itemCountNum,
            assigned_tray: selectedTray,
            shipping_preference: shippingPreference,
            customer_po: customerPo.trim() || null
          })
          .eq('id', pkg.id);

        if (packageError) throw packageError;

        // Propagate customer PO to existing repair items if set
        if (customerPo.trim()) {
          const { data: packageItems } = await supabase
            .from('inbound_package_items')
            .select('repair_item_id')
            .eq('package_id', pkg.id);

          if (packageItems && packageItems.length > 0) {
            const repairItemIds = packageItems.map(pi => pi.repair_item_id);
            await supabase
              .from('repair_items')
              .update({ customer_po: customerPo.trim() } as any)
              .in('id', repairItemIds);
          }
        }

        toast({
          title: "Open Box Updated",
          description: `Successfully updated open box information`,
        });

        // Dispatch event to refresh UI
        const event = new CustomEvent('package-updated', { 
          detail: { packageId: pkg.id } 
        });
        window.dispatchEvent(event);
      }
      
      onSuccess?.();
      onClose();
    } catch (error: any) {
      console.error('Error processing open box:', error);
      toast({
        title: "Error",
        description: `Failed to ${mode === 'unbox' ? 'complete opening box' : 'update open box'}. Please try again.`,
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (mode === 'edit') {
      loadUnboxData();
      loadPackageImages();
    } else {
      setItemCount("1");
      setSelectedTray("");
      setUnboxingNotes("");
      setCustomerPo("");
      setPackageImages([]);
      setShippingPreference('ship_complete');
    }
    onClose();
  };

  const getTitle = () => mode === 'unbox' ? 'Open Box' : 'Edit Open Box';
  const getButtonText = () => mode === 'unbox' ? 'Complete Opening Box' : 'Update Open Box';
  const maxImages = mode === 'unbox' ? 3 : 5;

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hash className="h-5 w-5" />
            {getTitle()}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer PO# (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="customerPo">Customer PO# (Optional)</Label>
            <Input
              id="customerPo"
              placeholder="Enter customer purchase order number"
              value={customerPo}
              onChange={(e) => setCustomerPo(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              This PO# will be attached to all repair items for tracking purposes.
            </p>
          </div>

          {/* Assign Tray */}
          <div className="space-y-2">
            <Label htmlFor="tray">
              Assign Tray <span className="text-destructive">*</span>
            </Label>
            <Select value={selectedTray} onValueChange={setSelectedTray} disabled={loadingTrays}>
              <SelectTrigger>
                <SelectValue placeholder={loadingTrays ? "Loading trays..." : "Select tray number"} />
              </SelectTrigger>
              <SelectContent>
                {trayInfo.map((info) => (
                  <SelectItem 
                    key={info.tray} 
                    value={info.tray.toString()}
                    disabled={info.isOccupied}
                    className={info.isOccupied ? "opacity-60" : ""}
                  >
                    Tray {info.tray}
                    {info.isOccupied && info.customerName && (
                      <span className="ml-2 text-muted-foreground text-xs">
                        — {info.customerName}
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Total Item Count */}
          <div className="space-y-2">
            <Label htmlFor="itemCount">
              Total Item Count <span className="text-destructive">*</span>
            </Label>
            <Input
              id="itemCount"
              type="number"
              min={mode === 'edit' && existingItemsCount > 0 ? existingItemsCount : 1}
              value={itemCount}
              onChange={handleItemCountChange}
              placeholder="1"
            />
            {mode === 'edit' && existingItemsCount > 0 && (
              <p className="text-xs text-muted-foreground">
                Minimum: {existingItemsCount} (number of already unboxed items)
              </p>
            )}
          </div>

          {/* Shipping Preference */}
          <div className="space-y-3">
            <Label>Shipping Preference</Label>
            <RadioGroup
              value={shippingPreference}
              onValueChange={(value) => setShippingPreference(value as 'ship_complete' | 'ship_as_available')}
              className="grid grid-cols-2 gap-3"
            >
              <label
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-lg border-2 p-3 cursor-pointer transition-colors",
                  shippingPreference === 'ship_complete'
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:border-muted-foreground/50"
                )}
              >
                <RadioGroupItem value="ship_complete" className="sr-only" />
                <PackageCheck className="h-6 w-6 text-primary" />
                <div className="text-center">
                  <div className="font-medium text-sm">Ship Complete</div>
                  <div className="text-xs text-muted-foreground">Wait for all items</div>
                </div>
              </label>
              <label
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-lg border-2 p-3 cursor-pointer transition-colors",
                  shippingPreference === 'ship_as_available'
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:border-muted-foreground/50"
                )}
              >
                <RadioGroupItem value="ship_as_available" className="sr-only" />
                <Truck className="h-6 w-6 text-primary" />
                <div className="text-center">
                  <div className="font-medium text-sm">Ship As Available</div>
                  <div className="text-xs text-muted-foreground">Ship items individually</div>
                </div>
              </label>
            </RadioGroup>
          </div>

          {/* Open Box Notes */}
          <div className="space-y-2">
            <Label htmlFor="unboxingNotes">Open Box Notes</Label>
            <Textarea
              id="unboxingNotes"
              placeholder={mode === 'unbox' ? "Any observations during opening box" : "Notes about the opening box process"}
              value={unboxingNotes}
              onChange={(e) => setUnboxingNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Package Images */}
          <div className="space-y-2">
            <Label>Package Photos</Label>
            <div className="grid grid-cols-3 gap-2">
              {packageImages.map((image, index) => (
                <div key={index} className="relative">
                  <img
                    src={image instanceof File ? URL.createObjectURL(image) : image}
                    alt={`Package photo ${index + 1}`}
                    className="w-full h-20 object-cover rounded border"
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0"
                    onClick={() => removeImage(index)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              
              {packageImages.length < maxImages && (
                <label className="flex flex-col items-center justify-center h-20 border-2 border-dashed border-muted-foreground/25 rounded cursor-pointer hover:border-muted-foreground/50 transition-colors">
                  <Camera className="h-5 w-5 text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground">Add Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleImageCapture}
                  />
                </label>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Up to {maxImages} photos can be {mode === 'unbox' ? 'captured' : 'uploaded'} ({packageImages.length}/{maxImages})
            </p>
          </div>

          {mode === 'unbox' && (
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Hash className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm text-primary">Next Step</span>
              </div>
              <p className="text-sm text-muted-foreground">
                After opening box, use "Add Items" to record each item's details (description, MAC, problem) one at a time.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <Button 
              onClick={handleSubmit}
              className="flex-1"
              disabled={isSubmitting || !selectedTray}
            >
              {isSubmitting ? (mode === 'unbox' ? 'Completing...' : 'Updating...') : getButtonText()}
            </Button>
            <Button 
              variant="outline" 
              onClick={handleCancel}
              className="flex-1"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
