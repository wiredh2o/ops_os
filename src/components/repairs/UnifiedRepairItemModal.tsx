import React, { useCallback, useState, useEffect } from 'react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PhotoUploader, SelectedPhoto, ExistingPhoto } from './PhotoUploader';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { removeBackgroundFromFile } from '@/lib/image/backgroundRemoval';

const FormSchema = z.object({
  itemName: z.string().min(1, 'Item name is required'),
  serialNumber: z.string().optional().or(z.literal('')),
  macAddress: z.string().optional().or(z.literal('')),
  problemReported: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
  repairability: z.string().min(1, 'Repairability is required'),
});

type FormValues = z.infer<typeof FormSchema>;

interface RepairItem {
  id: string;
  item_name: string;
  serial_number?: string;
  mac_address?: string;
  problem_reported?: string;
  notes?: string;
  repairability?: string;
  status?: string;
}

interface UnifiedRepairItemModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repairOrderId: string;
  mode: 'add' | 'edit';
  editItem?: RepairItem;
  onSuccess?: () => void;
}

export const UnifiedRepairItemModal: React.FC<UnifiedRepairItemModalProps> = ({
  open, 
  onOpenChange, 
  repairOrderId, 
  mode, 
  editItem, 
  onSuccess 
}) => {
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<ExistingPhoto[]>([]);
  const [existingImageCount, setExistingImageCount] = useState<number>(0);
  const [showExistingImages, setShowExistingImages] = useState<boolean>(false);
  const [loadingExistingImages, setLoadingExistingImages] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({ 
    resolver: zodResolver(FormSchema), 
    defaultValues: { 
      itemName: '', 
      serialNumber: '', 
      macAddress: '', 
      problemReported: '', 
      notes: '', 
      repairability: 'under_review' 
    } 
  });

  // Load existing data when in edit mode
  useEffect(() => {
    if (mode === 'edit' && editItem) {
      form.reset({
        itemName: editItem.item_name || '',
        serialNumber: editItem.serial_number || '',
        macAddress: editItem.mac_address || '',
        problemReported: editItem.problem_reported || '',
        notes: editItem.notes || '',
        repairability: editItem.repairability || 'under_review',
      });
      loadExistingPhotoCount(editItem.id);
    } else {
      form.reset({
        itemName: '',
        serialNumber: '',
        macAddress: '',
        problemReported: '',
        notes: '',
        repairability: 'under_review',
      });
      setExistingPhotos([]);
      setExistingImageCount(0);
      setShowExistingImages(false);
    }
    setPhotos([]);
  }, [mode, editItem, form]);

  const loadExistingPhotoCount = async (repairItemId: string) => {
    try {
      const { count, error } = await supabase
        .from('repair_item_photos')
        .select('*', { count: 'exact', head: true })
        .eq('repair_item_id', repairItemId);

      if (error) throw error;
      setExistingImageCount(count || 0);
    } catch (error) {
      console.error('Error loading existing photo count:', error);
      setExistingImageCount(0);
    }
  };

  const loadExistingPhotos = async (repairItemId: string) => {
    if (!showExistingImages) return;
    
    try {
      setLoadingExistingImages(true);
      const { data: photoData, error } = await supabase
        .from('repair_item_photos')
        .select('file_path')
        .eq('repair_item_id', repairItemId);

      if (error) throw error;

      const photos: ExistingPhoto[] = photoData?.map((photo, index) => ({
        id: `existing-${index}`,
        file_path: photo.file_path,
        isExisting: true
      })) || [];

      setExistingPhotos(photos);
    } catch (error) {
      console.error('Error loading existing photos:', error);
    } finally {
      setLoadingExistingImages(false);
    }
  };

  // Load existing photos when user toggles to show them
  useEffect(() => {
    if (mode === 'edit' && editItem && showExistingImages) {
      loadExistingPhotos(editItem.id);
    } else if (!showExistingImages) {
      setExistingPhotos([]);
    }
  }, [showExistingImages, mode, editItem]);

  const formatMacAddress = (value: string) => {
    // Remove all non-hex characters
    const hex = value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
    // Format as XX:XX:XX
    const formatted = hex.match(/.{1,2}/g)?.join(':') || hex;
    return formatted.substring(0, 8); // Limit to XX:XX:XX format
  };

  // Watch MAC address changes and format them
  const macAddressValue = form.watch('macAddress');
  useEffect(() => {
    if (macAddressValue !== undefined) {
      const formatted = formatMacAddress(macAddressValue);
      if (formatted !== macAddressValue) {
        form.setValue('macAddress', formatted, { shouldValidate: true });
      }
    }
  }, [macAddressValue, form]);

  const uploadPhoto = useCallback(async (repairItemId: string, photo: SelectedPhoto, index: number) => {
    const shouldRemove = photo.removeBg;
    const toUpload: Blob = shouldRemove ? await removeBackgroundFromFile(photo.file) : photo.file;

    const ext = shouldRemove ? 'png' : (photo.file.name.split('.').pop()?.toLowerCase() || 'jpg');
    const path = `repair-items/${repairOrderId}/${repairItemId}/${Date.now()}-${index}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('repairs-intake')
      .upload(path, toUpload, { contentType: shouldRemove ? 'image/png' : (photo.file.type || 'image/jpeg'), upsert: false });

    if (uploadError) throw uploadError;

    const { error: insertError } = await supabase
      .from('repair_item_photos')
      .insert({ repair_item_id: repairItemId, file_path: path });

    if (insertError) throw insertError;
  }, [repairOrderId]);

  const onSubmit = useCallback(async (values: FormValues) => {
    try {
      setSubmitting(true);

      let repairItemId: string;

      if (mode === 'add') {
        // Check if adding would exceed item count
        const { data: packageData } = await supabase
          .from('inbound_packages')
          .select('item_count')
          .eq('id', repairOrderId)
          .maybeSingle();
        
        const { count: existingItemCount } = await supabase
          .from('repair_items')
          .select('*', { count: 'exact', head: true })
          .eq('package_id', repairOrderId);
        
        if (packageData?.item_count && existingItemCount !== null && existingItemCount >= packageData.item_count) {
          toast({
            title: "Cannot Add Item",
            description: `Package already has maximum items (${existingItemCount}/${packageData.item_count})`,
            variant: "destructive"
          });
          return;
        }

        // Create new repair item
        const { data: itemInsert, error: itemError } = await supabase
          .from('repair_items')
          .insert({
            package_id: repairOrderId,
            item_name: values.itemName,
            serial_number: values.serialNumber || null,
            mac_address: values.macAddress || null,
            problem_reported: values.problemReported || null,
            notes: values.notes || null,
            repairability: values.repairability,
          })
          .select('id')
          .maybeSingle();

        if (itemError || !itemInsert?.id) throw itemError || new Error('Failed to create repair item');
        repairItemId = itemInsert.id;

        // Link to package — unboxing_order assigned atomically by DB trigger
        const { error: linkError } = await supabase
          .from('inbound_package_items')
          .insert({
            package_id: repairOrderId,
            repair_item_id: repairItemId,
          } as any);

        if (linkError) {
          // Roll back the repair item if linking failed
          await supabase.from('repair_items').delete().eq('id', repairItemId);
          throw linkError;
        }

      } else {
        // Update existing repair item
        if (!editItem?.id) throw new Error('No item ID provided for update');
        
        const { error: updateError } = await supabase
          .from('repair_items')
          .update({
            item_name: values.itemName,
            serial_number: values.serialNumber || null,
            mac_address: values.macAddress || null,
            problem_reported: values.problemReported || null,
            notes: values.notes || null,
            repairability: values.repairability,
          })
          .eq('id', editItem.id);

        if (updateError) throw updateError;
        repairItemId = editItem.id;
      }

      // Upload new photos
      for (let i = 0; i < photos.length; i++) {
        await uploadPhoto(repairItemId, photos[i], i);
      }

      toast({ 
        title: mode === 'add' ? 'Repair item added' : 'Repair item updated', 
        description: `Your repair item was ${mode === 'add' ? 'saved' : 'updated'} successfully.` 
      });
      
      // Dispatch event to refresh the UI
      const event = new CustomEvent('repair-item-updated', { 
        detail: { 
          packageId: repairOrderId,
          itemId: repairItemId
        }
      });
      window.dispatchEvent(event);
      
      onOpenChange(false);
      form.reset();
      setPhotos([]);
      setExistingPhotos([]);
      onSuccess?.();
    } catch (e: any) {
      console.error(e);
      toast({ 
        title: 'Error', 
        description: e?.message || `Failed to ${mode} repair item`, 
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  }, [form, onOpenChange, onSuccess, photos, repairOrderId, uploadPhoto, mode, editItem]);

  const handlePhotoChange = (newPhotos: SelectedPhoto[]) => {
    setPhotos(newPhotos);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'add' ? 'Add Repair Item' : 'Edit Repair Item'}</DialogTitle>
          <DialogDescription>
            {mode === 'add' 
              ? 'Log a new item for this repair order and attach photos. Background removal is optional per photo.'
              : 'Update the repair item details and manage photos. Background removal is optional for new photos.'
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="itemName">Item name</Label>
              <Input id="itemName" {...form.register('itemName')} />
              {form.formState.errors.itemName && (
                <p className="text-sm text-destructive">{form.formState.errors.itemName.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="serialNumber">Serial number (optional)</Label>
              <Input id="serialNumber" {...form.register('serialNumber')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="macAddress">MAC address (optional)</Label>
              <Input 
                id="macAddress" 
                {...form.register('macAddress')} 
                placeholder="XX:XX:XX"
                maxLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="repairability">Repairability</Label>
              <Select
                value={form.watch('repairability')}
                onValueChange={(value) => form.setValue('repairability', value, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select repairability status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="under_review">Under Review</SelectItem>
                  <SelectItem value="repairable">Repairable</SelectItem>
                  <SelectItem value="not_repairable">Not Repairable</SelectItem>
                  <SelectItem value="needs_parts">Needs Parts</SelectItem>
                </SelectContent>
              </Select>
              {form.formState.errors.repairability && (
                <p className="text-sm text-destructive">{form.formState.errors.repairability.message}</p>
              )}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="problemReported">Problem reported (optional)</Label>
              <Textarea 
                id="problemReported" 
                rows={3} 
                {...form.register('problemReported')} 
                spellCheck={true}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea id="notes" rows={3} {...form.register('notes')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Photos</Label>
            <PhotoUploader 
              onChange={handlePhotoChange} 
              existingPhotos={existingPhotos}
              existingImageCount={existingImageCount}
              showExistingImages={showExistingImages}
              onToggleExistingImages={setShowExistingImages}
              loadingExistingImages={loadingExistingImages}
              isEditMode={mode === 'edit'}
              multiple 
              allowCamera 
              enableBgRemovalToggle 
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (mode === 'add' ? 'Saving…' : 'Updating…') : (mode === 'add' ? 'Save item' : 'Update item')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};