import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { CalendarIcon, Package, Camera, X, Check, ChevronsUpDown } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useCompanies } from "@/hooks/useCompanies";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { InboundPackage } from "./InboundPackageCard";

interface UnifiedPackageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'receive' | 'edit';
  package?: InboundPackage;
  onSuccess?: () => void;
}

export function UnifiedPackageModal({ open, onOpenChange, mode, package: pkg, onSuccess }: UnifiedPackageModalProps) {
  const [trackingNumber, setTrackingNumber] = useState("");
  const [dateReceived, setDateReceived] = useState<Date | undefined>(undefined);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [notes, setNotes] = useState("");
  const [returnShippingAddress, setReturnShippingAddress] = useState("");
  const [packageImages, setPackageImages] = useState<(File | string)[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [companies, setCompanies] = useState<any[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  
  
  const { toast } = useToast();

  // Fetch companies directly when modal opens
  useEffect(() => {
    if (open) {
      const fetchCompanies = async () => {
        setCompaniesLoading(true);
        
        try {
          let allCompanies: any[] = [];
          let from = 0;
          const batchSize = 1000;
          let hasMore = true;

          // Fetch in batches of 1000 until we get all companies
          while (hasMore) {
            const { data, error } = await supabase
              .from("companies")
              .select("id, name, is_distributor, is_active, is_taxable, owners_name, customer_number, start_date, last_trans_date, phone, billing_address")
              .eq("is_active", true)
              .order("name", { ascending: true })
              .range(from, from + batchSize - 1);

            if (error) {
              console.error('Error fetching companies batch:', error);
              break;
            }

            if (data && data.length > 0) {
              allCompanies = [...allCompanies, ...data];
              from += batchSize;
              hasMore = data.length === batchSize; // Continue if we got a full batch
            } else {
              hasMore = false;
            }
          }

          console.log('Total companies fetched:', allCompanies.length);
          const tidalCompanies = allCompanies.filter(c => c.name.toLowerCase().includes('tidal'));
          console.log('Tidal companies found:', tidalCompanies.length);
          tidalCompanies.forEach(c => console.log('  -', c.name));
          setCompanies(allCompanies);
        } catch (err) {
          console.error('Fetch error:', err);
        }
        
        setCompaniesLoading(false);
      };
      fetchCompanies();
    }
  }, [open]);

  // Client-side filtering for companies - searches name, owner, phone, and address (city, state, zip)
  const filteredCompanies = companies.filter(company => {
    const term = searchTerm.toLowerCase();
    return (
      company.name?.toLowerCase().includes(term) ||
      company.owners_name?.toLowerCase().includes(term) ||
      company.phone?.toLowerCase().includes(term) ||
      company.billing_address?.toLowerCase().includes(term)
    );
  });

  // Initialize form when modal opens or package changes
  useEffect(() => {
    if (open && !companiesLoading) {
      if (mode === 'edit' && pkg) {
        setTrackingNumber(pkg.tracking_number || "");
        setSelectedCustomer(pkg.company ? 
          companies.find(c => c.name === pkg.company?.name)?.id || "" : "");
        setDateReceived(pkg.received_at ? new Date(pkg.received_at) : undefined);
        setNotes(pkg.intake_notes || "");
        loadReturnShippingAddress();
        loadPackageImages();
      } else {
        // Default values for receive mode
        setDateReceived(new Date());
        setTrackingNumber("");
        setSelectedCustomer("");
        setNotes("");
        setReturnShippingAddress("");
        setPackageImages([]);
      }
    }
  }, [open, mode, pkg, companies, companiesLoading]);

  const loadReturnShippingAddress = async () => {
    if (!pkg?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('inbound_packages')
        .select('return_shipping_address')
        .eq('id', pkg.id)
        .maybeSingle();

      if (error) throw error;
      setReturnShippingAddress(data?.return_shipping_address || "");
    } catch (error) {
      console.error('Error loading return shipping address:', error);
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

  const handleSubmit = async () => {
    if (!trackingNumber.trim()) {
      toast({
        title: 'Error',
        description: 'Tracking number is required',
        variant: 'destructive',
      });
      return;
    }

    if (!dateReceived) {
      toast({
        title: 'Error',
        description: 'Date/time received is required',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedCustomer) {
      toast({
        title: 'Error',
        description: 'Customer selection is required',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === 'receive') {
        // Create new package
        const { data: packageData, error: packageError } = await supabase
          .from('inbound_packages')
          .insert({
            tracking_number: trackingNumber,
            company_id: selectedCustomer,
            status: 'received',
            initiated_via: 'repair',
            received_at: dateReceived.toISOString(),
            intake_notes: notes || null,
            return_shipping_address: returnShippingAddress || null,
            category: 'repairs'
          })
          .select()
          .single();

        if (packageError) throw packageError;

        // Upload new images if any
        if (packageImages.length > 0) {
          await Promise.all(
            packageImages.map(async (file, index) => {
              if (file instanceof File) {
                try {
                  const fileExt = file.name.split('.').pop();
                  const fileName = `${packageData.id}/${Date.now()}-${index}.${fileExt}`;

                  const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('package-images')
                    .upload(fileName, file);

                  if (uploadError) throw uploadError;

                  const { error: dbError } = await supabase
                    .from('package_images')
                    .insert({
                      package_id: packageData.id,
                      storage_path: uploadData.path,
                      original_filename: file.name,
                      content_type: file.type,
                      file_size: file.size,
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
          title: 'Success',
          description: 'Package receipt recorded successfully',
        });

        // Dispatch event to refresh UI
        const event = new CustomEvent('package-updated', { 
          detail: { packageId: packageData.id } 
        });
        window.dispatchEvent(event);
      } else {
        // Update existing package
        const updateData: any = {
          tracking_number: trackingNumber.trim(),
          company_id: selectedCustomer,
          intake_notes: notes.trim() || null,
          return_shipping_address: returnShippingAddress.trim() || null,
        };

        if (dateReceived) {
          updateData.received_at = dateReceived.toISOString();
        }

        const { error } = await supabase
          .from("inbound_packages")
          .update(updateData)
          .eq("id", pkg!.id);

        if (error) throw error;

        // Cascade customer change to related production_orders
        if (selectedCustomer !== pkg?.company?.id) {
          const selectedCompany = companies.find(c => c.id === selectedCustomer);
          if (selectedCompany) {
            const { error: poUpdateError } = await supabase
              .from('production_orders')
              .update({
                customer_company_id: selectedCustomer,
                customer_name: selectedCompany.name,
              })
              .eq('inbound_package_id', pkg!.id);

            if (poUpdateError) {
              console.error('Warning: Failed to update related production orders:', poUpdateError);
            }
          }
        }

        toast({
          title: "Success",
          description: "Package updated successfully",
        });

        // Dispatch event to refresh UI
        const event = new CustomEvent('package-updated', { 
          detail: { packageId: pkg!.id } 
        });
        window.dispatchEvent(event);
      }

      onSuccess?.();
      handleCancel();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || `Failed to ${mode === 'receive' ? 'record package receipt' : 'update package'}`,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setTrackingNumber("");
    setDateReceived(mode === 'receive' ? new Date() : undefined);
    setSelectedCustomer("");
    setNotes("");
    setReturnShippingAddress("");
    setPackageImages([]);
    onOpenChange(false);
  };

  const handleImageCapture = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (mode === 'receive' && packageImages.length < 5) {
      setPackageImages(prev => [...prev, file]);
    } else if (mode === 'edit' && pkg?.id) {
      // Upload immediately for edit mode
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

  const getTitle = () => mode === 'receive' ? 'Receive Repair Package' : 'Edit Package';
  const getButtonText = () => mode === 'receive' ? 'Record Receipt' : 'Update Package';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            {getTitle()}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Tracking Number */}
          <div className="space-y-2">
            <Label htmlFor="tracking">Tracking Number *</Label>
            <Input
              id="tracking"
              placeholder="Enter tracking number"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value.toUpperCase())}
              style={{ textTransform: 'uppercase' }}
            />
          </div>

          {/* Customer */}
          <div className="space-y-2">
            <Label>Customer *</Label>
            <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={customerOpen}
                  className="w-full justify-between"
                  disabled={companiesLoading}
                >
                  {selectedCustomer
                    ? companies.find((c) => c.id === selectedCustomer)?.name
                    : companiesLoading 
                      ? "Loading companies..." 
                      : "Select customer..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput 
                    placeholder="Search companies..." 
                    value={searchTerm}
                    onValueChange={setSearchTerm}
                  />
                  <CommandList className="max-h-[300px]">
                    <CommandEmpty>No company found.</CommandEmpty>
                    <CommandGroup>
                      {filteredCompanies.map((company) => (
                        <CommandItem
                          key={company.id}
                          value={company.name}
                          onSelect={() => {
                            setSelectedCustomer(company.id);
                            setCustomerOpen(false);
                            setSearchTerm("");
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedCustomer === company.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {company.name} <span className="text-muted-foreground ml-1">
                            {company.is_distributor ? "(Distributor)" : "(Car Wash)"}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Date/Time Received */}
          <div className="space-y-2">
            <Label>Date/Time Received *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !dateReceived && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateReceived ? format(dateReceived, "MM/dd/yyyy hh:mm a") : "Select date and time"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateReceived}
                  onSelect={(date) => date && setDateReceived(date)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Additional notes about the package"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Return Shipping Address */}
          <div className="space-y-2">
            <Label htmlFor="returnAddress">Return Shipping Address</Label>
            <Textarea
              id="returnAddress"
              placeholder="Enter return shipping address (optional)"
              value={returnShippingAddress}
              onChange={(e) => setReturnShippingAddress(e.target.value)}
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
              
              {packageImages.length < 5 && (
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
              Up to 5 photos can be uploaded ({packageImages.length}/5)
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button 
              onClick={handleSubmit} 
              className="flex-1"
              disabled={isSubmitting}
            >
              {isSubmitting ? (mode === 'receive' ? 'Recording...' : 'Updating...') : getButtonText()}
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
}