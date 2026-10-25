import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Trash2, CalendarIcon, Copy } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { CustomerSaveResultDialog } from './CustomerSaveResultDialog';
import { usePaymentTerms } from '@/hooks/usePaymentTerms';
import { CUSTOMER_CREDIT_KEY } from '@/hooks/useCustomerCredit';
import { useQueryClient } from '@tanstack/react-query';
import { canManageCredit, parseCreditLimit, DEFAULT_CREDIT_LIMIT } from '@/lib/credit-rules';

interface ShippingAddress {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  signature_required: boolean;
}

interface PriceLevel {
  id: string;
  name: string;
  description?: string;
  discount_percentage: number;
  is_active: boolean;
}

interface Customer {
  id: string;
  name: string;
  owners_name?: string;
  email?: string;
  phone?: string;
  is_active: boolean;
  is_distributor: boolean;
  is_taxable?: boolean;
  billing_address?: string;
  shipping_addresses: ShippingAddress[];
  default_shipping_address_id?: string;
  preferred_shipping_carrier?: string;
  price_level_id?: string;
  sales_tax_license_url?: string;
  sales_tax_license_expires_at?: string;
  sales_tax_license_ocr_data?: any;
  customer_number?: number;
  start_date?: string;
  last_trans_date?: string;
}

interface CustomerFormProps {
  customer?: Customer | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function CustomerForm({ customer, onClose, onSuccess }: CustomerFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentUserRoles, setCurrentUserRoles] = useState<string[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    owners_name: '',
    email: '',
    phone: '',
    is_active: true,
    is_distributor: false,
    is_taxable: true,
    billing_address: '',
    billing_city: '',
    billing_state: '',
    billing_zip: '',
    preferred_shipping_carrier: 'FedEx',
    price_level_id: '79fefafb-c9bd-4345-94ee-3c8ab34d0f78',
    sales_tax_license_url: '',
    start_date: new Date().toISOString().split('T')[0],
    payment_terms: 'due_in_advance',
    // Third-party shipping account fields
    use_third_party_shipping: false,
    fedex_account_number: '',
    ups_account_number: '',
  });

  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const canEditCredit = canManageCredit(roles);
  const { data: allTerms = [] } = usePaymentTerms();
  const [creditLimitInput, setCreditLimitInput] = useState(DEFAULT_CREDIT_LIMIT.toFixed(2));
  // Active terms, plus the customer's current term even if it was turned off.
  const paymentTermsOptions = allTerms
    .filter((t) => t.active || t.code === formData.payment_terms)
    .map((t) => ({ value: t.code, label: t.active ? t.label : `${t.label} (inactive)` }));

  useEffect(() => {
    if (!customer?.id || !canEditCredit) { setCreditLimitInput(DEFAULT_CREDIT_LIMIT.toFixed(2)); return; }
    (supabase as any).from('customer_credit_limits').select('credit_limit').eq('company_id', customer.id).maybeSingle()
      .then(({ data }: any) => setCreditLimitInput(Number(data?.credit_limit ?? DEFAULT_CREDIT_LIMIT).toFixed(2)));
  }, [customer?.id, canEditCredit]);

  const saveCreditTerms = async (companyId: string) => {
    if (!canEditCredit) return;
    const limit = parseCreditLimit(creditLimitInput);
    if (limit === null) throw new Error('Credit limit must be $0.00 or more');
    const { error } = await (supabase as any).rpc('set_customer_credit_terms', {
      _company_id: companyId, _credit_limit: limit, _payment_terms: formData.payment_terms,
    });
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: [CUSTOMER_CREDIT_KEY] });
  };
  
  const [shippingAddresses, setShippingAddresses] = useState<ShippingAddress[]>([]);
  const [priceLevels, setPriceLevels] = useState<PriceLevel[]>([]);
  const [defaultShippingId, setDefaultShippingId] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [processingOCR, setProcessingOCR] = useState(false);
  const [licenseExpiresAt, setLicenseExpiresAt] = useState<string>('');
  const [licenseExpirationDate, setLicenseExpirationDate] = useState<Date | undefined>(undefined);
  const [ocrData, setOcrData] = useState<any>(null);
  
  // State for save result dialog
  const [showSaveResultDialog, setShowSaveResultDialog] = useState(false);
  const [saveResult, setSaveResult] = useState<{
    dbSuccess: boolean;
    dbError?: string;
    stripeSuccess: boolean;
    stripeError?: string;
    customerName: string;
  } | null>(null);

  // Shipping carrier options - Pick-Up is only available to internal users
  const shippingCarrierOptions = [
    { value: 'FedEx', label: 'FedEx', internalOnly: false },
    { value: 'UPS', label: 'UPS', internalOnly: false },
    { value: 'USPS', label: 'USPS', internalOnly: false },
    { value: 'Pick-Up', label: 'Pick-Up (In-Person)', internalOnly: true },
  ];

  // Check if user is internal (can set Pick-Up option)
  const isInternalUser = (): boolean => {
    return currentUserRoles.includes('admin') ||
           currentUserRoles.includes('sales_support') ||
           currentUserRoles.includes('accounting') ||
           currentUserRoles.includes('production');
  };

  // Get available carriers based on user role
  const getAvailableCarriers = () => {
    if (isInternalUser()) {
      return shippingCarrierOptions;
    }
    // Future customer-facing: hide Pick-Up option
    return shippingCarrierOptions.filter(c => !c.internalOnly);
  };

  const usStates = [
    { value: 'AL', label: 'AL - Alabama' },
    { value: 'AK', label: 'AK - Alaska' },
    { value: 'AZ', label: 'AZ - Arizona' },
    { value: 'AR', label: 'AR - Arkansas' },
    { value: 'CA', label: 'CA - California' },
    { value: 'CO', label: 'CO - Colorado' },
    { value: 'CT', label: 'CT - Connecticut' },
    { value: 'DE', label: 'DE - Delaware' },
    { value: 'FL', label: 'FL - Florida' },
    { value: 'GA', label: 'GA - Georgia' },
    { value: 'HI', label: 'HI - Hawaii' },
    { value: 'ID', label: 'ID - Idaho' },
    { value: 'IL', label: 'IL - Illinois' },
    { value: 'IN', label: 'IN - Indiana' },
    { value: 'IA', label: 'IA - Iowa' },
    { value: 'KS', label: 'KS - Kansas' },
    { value: 'KY', label: 'KY - Kentucky' },
    { value: 'LA', label: 'LA - Louisiana' },
    { value: 'ME', label: 'ME - Maine' },
    { value: 'MD', label: 'MD - Maryland' },
    { value: 'MA', label: 'MA - Massachusetts' },
    { value: 'MI', label: 'MI - Michigan' },
    { value: 'MN', label: 'MN - Minnesota' },
    { value: 'MS', label: 'MS - Mississippi' },
    { value: 'MO', label: 'MO - Missouri' },
    { value: 'MT', label: 'MT - Montana' },
    { value: 'NE', label: 'NE - Nebraska' },
    { value: 'NV', label: 'NV - Nevada' },
    { value: 'NH', label: 'NH - New Hampshire' },
    { value: 'NJ', label: 'NJ - New Jersey' },
    { value: 'NM', label: 'NM - New Mexico' },
    { value: 'NY', label: 'NY - New York' },
    { value: 'NC', label: 'NC - North Carolina' },
    { value: 'ND', label: 'ND - North Dakota' },
    { value: 'OH', label: 'OH - Ohio' },
    { value: 'OK', label: 'OK - Oklahoma' },
    { value: 'OR', label: 'OR - Oregon' },
    { value: 'PA', label: 'PA - Pennsylvania' },
    { value: 'RI', label: 'RI - Rhode Island' },
    { value: 'SC', label: 'SC - South Carolina' },
    { value: 'SD', label: 'SD - South Dakota' },
    { value: 'TN', label: 'TN - Tennessee' },
    { value: 'TX', label: 'TX - Texas' },
    { value: 'UT', label: 'UT - Utah' },
    { value: 'VT', label: 'VT - Vermont' },
    { value: 'VA', label: 'VA - Virginia' },
    { value: 'WA', label: 'WA - Washington' },
    { value: 'WV', label: 'WV - West Virginia' },
    { value: 'WI', label: 'WI - Wisconsin' },
    { value: 'WY', label: 'WY - Wyoming' }
  ];

  useEffect(() => {
    loadCurrentUserData();
    loadPriceLevels();
    if (customer) {
      // Parse billing address if it exists (it's stored as a combined string)
      let billingParts = ['', '', '', ''];
      if (customer.billing_address) {
        const parts = customer.billing_address.split(', ');
        // Expected format: "Company Name, Street Address, City, State, ZIP"
        if (parts.length >= 5) {
          billingParts = [parts[1] || '', parts[2] || '', parts[3] || '', parts[4] || ''];
        } else if (parts.length === 4) {
          // In case company name is missing from stored format
          billingParts = [parts[0] || '', parts[1] || '', parts[2] || '', parts[3] || ''];
        } else if (parts.length === 1) {
          // If it's just a single field, put it in the address field
          billingParts = [parts[0] || '', '', '', ''];
        }
      }

      setFormData({
        name: customer.name || '',
        owners_name: customer.owners_name || '',
        email: customer.email || '',
        phone: customer.phone || '',
        is_active: customer.is_active,
        is_distributor: customer.is_distributor,
        is_taxable: customer.is_taxable ?? true,
        billing_address: billingParts[0],
        billing_city: billingParts[1],
        billing_state: billingParts[2],
        billing_zip: billingParts[3],
        preferred_shipping_carrier: customer.preferred_shipping_carrier || 'FedEx',
        price_level_id: customer.price_level_id || '79fefafb-c9bd-4345-94ee-3c8ab34d0f78',
        sales_tax_license_url: customer.sales_tax_license_url || '',
        start_date: customer.start_date || new Date().toISOString().split('T')[0],
        payment_terms: (customer as any).payment_terms || 'due_in_advance',
        // Third-party shipping account fields
        use_third_party_shipping: (customer as any).use_third_party_shipping || false,
        fedex_account_number: (customer as any).fedex_account_number || '',
        ups_account_number: (customer as any).ups_account_number || '',
      });
      setShippingAddresses((customer.shipping_addresses || []).map(addr => ({
        ...addr,
        signature_required: addr.signature_required ?? true
      })));
      setDefaultShippingId(customer.default_shipping_address_id || '');
      const expiresAt = customer.sales_tax_license_expires_at;
      setLicenseExpiresAt(expiresAt || '');
      setLicenseExpirationDate(expiresAt ? new Date(expiresAt) : undefined);
      setOcrData(customer.sales_tax_license_ocr_data || null);
    }
  }, [customer]);

  const loadCurrentUserData = async () => {
    if (!user) return;

    try {
      // Load user roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (rolesError) throw rolesError;
      setCurrentUserRoles(rolesData.map(r => r.role));

      // Load user profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;
      setCurrentUserProfile(profileData);
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const loadPriceLevels = async () => {
    try {
      const { data, error } = await supabase
        .from('price_levels')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;
      setPriceLevels(data || []);
    } catch (error) {
      console.error('Error loading price levels:', error);
    }
  };

  const canModifyActiveStatus = (): boolean => {
    // Car wash admins cannot make their associated customer inactive
    if (currentUserRoles.includes('car_wash_admin') && customer) {
      return customer.id !== currentUserProfile?.company_id;
    }
    return true;
  };

  const canManageSalesTaxLicense = (): boolean => {
    return currentUserRoles.includes('admin') ||
           currentUserRoles.includes('car_wash_admin') ||
           currentUserRoles.includes('sales_support') ||
           currentUserRoles.includes('accounting');
  };

  const addShippingAddress = () => {
    const newAddress: ShippingAddress = {
      id: crypto.randomUUID(),
      name: '',
      address: '',
      city: '',
      state: '',
      zip: '',
      country: 'US',
      signature_required: true,
    };
    setShippingAddresses([...shippingAddresses, newAddress]);
  };

  const updateShippingAddress = (id: string, field: keyof ShippingAddress, value: string | boolean) => {
    setShippingAddresses(addresses =>
      addresses.map(addr => addr.id === id ? { ...addr, [field]: value } : addr)
    );
  };

  const removeShippingAddress = (id: string) => {
    setShippingAddresses(addresses => addresses.filter(addr => addr.id !== id));
    if (defaultShippingId === id) {
      setDefaultShippingId('');
    }
  };

  const checkForDuplicateShippingAddress = (): ShippingAddress | null => {
    const billingNormalized = {
      address: formData.billing_address.trim().toLowerCase(),
      city: formData.billing_city.trim().toLowerCase(),
      state: formData.billing_state.trim().toLowerCase(),
      zip: formData.billing_zip.trim().toLowerCase()
    };

    return shippingAddresses.find(addr => 
      addr.address.trim().toLowerCase() === billingNormalized.address &&
      addr.city.trim().toLowerCase() === billingNormalized.city &&
      addr.state.trim().toLowerCase() === billingNormalized.state &&
      addr.zip.trim().toLowerCase() === billingNormalized.zip
    ) || null;
  };

  const copyBillingToShipping = () => {
    // Check if all billing fields are filled
    if (!formData.billing_address.trim() || !formData.billing_city.trim() || 
        !formData.billing_state.trim() || !formData.billing_zip.trim()) {
      toast({
        title: 'Error',
        description: 'Please fill in all billing address fields first',
        variant: 'destructive',
      });
      return;
    }

    // Check for duplicate
    const existingAddress = checkForDuplicateShippingAddress();
    
    if (existingAddress) {
      // Set existing address as default
      setDefaultShippingId(existingAddress.id);
      toast({
        title: 'Address Found',
        description: `Address already exists as '${existingAddress.name}' and set as default`,
      });
    } else {
      // Create new shipping address
      const newAddress: ShippingAddress = {
        id: crypto.randomUUID(),
        name: 'Billing Address',
        address: formData.billing_address.trim(),
        city: formData.billing_city.trim(),
        state: formData.billing_state.trim(),
        zip: formData.billing_zip.trim(),
        country: 'US',
        signature_required: true,
      };
      
      setShippingAddresses([...shippingAddresses, newAddress]);
      setDefaultShippingId(newAddress.id);
      
      toast({
        title: 'Success',
        description: 'Billing address copied to shipping and set as default',
      });
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Check permissions
    if (!canManageSalesTaxLicense()) {
      toast({
        title: 'Error',
        description: 'You do not have permission to upload sales tax licenses',
        variant: 'destructive',
      });
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      toast({
        title: 'Error',
        description: 'Please select an image file or PDF document',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'Error',
        description: 'File size must be less than 5MB',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('sales-tax-licenses')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // For private buckets, store the file path instead of public URL
      setFormData({ ...formData, sales_tax_license_url: filePath });

      toast({
        title: 'Success',
        description: 'Sales tax license uploaded successfully',
      });

      // Process OCR immediately after upload (for both new and existing customers)
      // Use a temporary ID for new customers
      const tempCompanyId = customer?.id || `temp-${user.id}-${Date.now()}`;
      await processOCR(tempCompanyId, filePath);
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({
        title: 'Error',
        description: 'Failed to upload sales tax license',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const processOCR = async (companyId: string, imageUrl: string) => {
    setProcessingOCR(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-license-ocr', {
        body: { companyId, imageUrl }
      });

      if (error) throw error;

      if (data.success && data.data.expiration_date) {
        const expirationDate = data.data.expiration_date;
        setLicenseExpiresAt(expirationDate);
        setLicenseExpirationDate(new Date(expirationDate));
        setOcrData(data.data);
        
        toast({
          title: 'License Processed',
          description: `License expires: ${new Date(data.data.expiration_date).toLocaleDateString()}`,
        });
      } else {
        // OCR failed silently - don't show error, just let user enter date manually
        setOcrData(data.data || null);
      }
    } catch (error) {
      console.error('OCR processing error:', error);
      // Fail silently - don't show error toast, let user enter date manually
    } finally {
      setProcessingOCR(false);
    }
  };

  const handleViewLicense = async () => {
    if (!formData.sales_tax_license_url) return;

    // Check permissions
    if (!canManageSalesTaxLicense()) {
      toast({
        title: 'Error',
        description: 'You do not have permission to view sales tax licenses',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { data, error } = await supabase.storage
        .from('sales-tax-licenses')
        .createSignedUrl(formData.sales_tax_license_url, 300); // 5 minutes

      if (error) throw error;

      window.open(data.signedUrl, '_blank');
    } catch (error) {
      console.error('Error creating signed URL:', error);
      toast({
        title: 'Error',
        description: 'Failed to view sales tax license',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async () => {
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to perform this action',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.name.trim()) {
      toast({
        title: 'Error',
        description: 'Company name is required',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.owners_name.trim()) {
      toast({
        title: 'Error',
        description: 'Owner is required',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.email.trim()) {
      toast({
        title: 'Error',
        description: 'Email is required',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.phone.trim()) {
      toast({
        title: 'Error',
        description: 'Phone is required',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.billing_address.trim() || 
        !formData.billing_city.trim() || !formData.billing_state.trim() || !formData.billing_zip.trim()) {
      toast({
        title: 'Error',
        description: 'All billing address fields are required',
        variant: 'destructive',
      });
      return;
    }

    // Shipping addresses and preferred carrier are optional - validated when creating orders

    if (!formData.price_level_id) {
      toast({
        title: 'Error',
        description: 'Price level is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Combine billing address fields for storage with company name
      const combinedBillingAddress = [
        formData.name,
        formData.billing_address,
        formData.billing_city,
        formData.billing_state,
        formData.billing_zip
      ].filter(Boolean).join(', ');

      const updateData = {
        name: formData.name,
        owners_name: formData.owners_name || null,
        email: formData.email || null,
        phone: formData.phone || null,
        is_active: formData.is_active,
        is_distributor: formData.is_distributor,
        is_taxable: formData.is_taxable,
        billing_address: combinedBillingAddress || null,
        shipping_addresses: JSON.stringify(shippingAddresses),
        default_shipping_address_id: defaultShippingId || null,
        preferred_shipping_carrier: formData.preferred_shipping_carrier || null,
        price_level_id: formData.price_level_id,
        sales_tax_license_url: formData.sales_tax_license_url || null,
        sales_tax_license_expires_at: licenseExpirationDate ? licenseExpirationDate.toISOString().split('T')[0] : null,
        sales_tax_license_ocr_data: ocrData,
        start_date: formData.start_date,
        // Terms and credit limit are saved separately (admin/accounting only).
        // Third-party shipping account fields
        use_third_party_shipping: formData.use_third_party_shipping,
        fedex_account_number: formData.fedex_account_number || null,
        ups_account_number: formData.ups_account_number || null,
      };

      if (customer) {
        // Editing existing customer
        const { error } = await supabase
          .from('companies')
          .update(updateData)
          .eq('id', customer.id);

        if (error) throw error;
        await saveCreditTerms(customer.id);

        // Sync to Stripe if customer has a Stripe ID
        if ((customer as any).stripe_customer_id) {
          try {
            const { error: stripeError } = await supabase.functions.invoke('update-stripe-customer', {
              body: {
                stripe_customer_id: (customer as any).stripe_customer_id,
                name: formData.name,
                email: formData.email,
                phone: formData.phone,
                billing_address: combinedBillingAddress,
              }
            });
            
            if (stripeError) {
              console.error('Failed to sync to Stripe:', stripeError);
              // Don't block the update, just log the error
            }
          } catch (err) {
            console.error('Error syncing to Stripe:', err);
          }
        }

        toast({
          title: 'Success',
          description: 'Customer updated successfully',
        });
        onSuccess();
      } else {
        // Creating new customer - also create in Stripe
        const { data: insertedData, error: insertError } = await supabase
          .from('companies')
          .insert(updateData as any)
          .select('id, customer_number')
          .single();

        if (insertError) {
          // Database insert failed
          setSaveResult({
            dbSuccess: false,
            dbError: insertError.message,
            stripeSuccess: false,
            customerName: formData.name,
          });
          setShowSaveResultDialog(true);
          return;
        }

        try {
          await saveCreditTerms(insertedData.id);
        } catch (creditErr: any) {
          toast({ title: 'Customer saved, but terms were not', description: creditErr.message, variant: 'destructive' });
        }

        // Database insert succeeded, now create in Stripe
        let stripeSuccess = false;
        let stripeError: string | undefined;

        try {
          const { data: stripeResult, error: stripeCallError } = await supabase.functions.invoke('create-stripe-customer', {
            body: {
              company_id: insertedData.id,
              name: formData.name,
              email: formData.email,
              phone: formData.phone,
              billing_address: combinedBillingAddress,
              customer_number: insertedData.customer_number,
              owners_name: formData.owners_name,
            }
          });

          if (stripeCallError) {
            stripeError = stripeCallError.message;
          } else if (stripeResult?.error) {
            stripeError = stripeResult.error;
          } else {
            stripeSuccess = true;
          }
        } catch (err: any) {
          stripeError = err.message || 'Unknown error creating Stripe customer';
        }

        // Show result dialog
        setSaveResult({
          dbSuccess: true,
          stripeSuccess,
          stripeError,
          customerName: formData.name,
        });
        setShowSaveResultDialog(true);
      }
    } catch (error: any) {
      console.error('Error saving customer:', error);
      toast({
        title: 'Error',
        description: 'Failed to save customer',
        variant: 'destructive',
      });
    }
  };

  const handleSaveResultDialogClose = () => {
    setShowSaveResultDialog(false);
    if (saveResult?.dbSuccess) {
      onSuccess();
    }
  };

  return (
    <>
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{customer ? 'Edit Customer' : 'Add New Customer'}</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="shipping">Shipping</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
          </TabsList>
          
          <TabsContent value="basic" className="space-y-4">
            <div>
              <Label htmlFor="name">Company Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter company name"
              />
            </div>

            <div>
              <Label htmlFor="owners_name">Owner *</Label>
              <Input
                id="owners_name"
                value={formData.owners_name}
                onChange={(e) => setFormData({ ...formData, owners_name: e.target.value })}
                placeholder="Enter owner name"
              />
            </div>

            {customer && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="customer_number">Customer Number</Label>
                  <Input
                    id="customer_number"
                    value={customer.customer_number || 'Auto-assigned'}
                    disabled
                    className="bg-muted"
                  />
                </div>
                <div>
                  <Label htmlFor="start_date">Start Date *</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="last_trans_date">Last Transaction Date</Label>
                  <Input
                    id="last_trans_date"
                    type="date"
                    value={customer?.last_trans_date || ''}
                    disabled
                    className="bg-muted cursor-not-allowed"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Automatically updated when orders are shipped/completed
                  </p>
                </div>
              </div>
            )}

            {!customer && (
              <div>
                <Label htmlFor="start_date">Start Date *</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="Enter email address"
                />
              </div>

              <div>
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Enter phone number"
                />
              </div>
            </div>

            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  disabled={!canModifyActiveStatus()}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="is_active">Active Customer</Label>
                {!canModifyActiveStatus() && (
                  <span className="text-xs text-muted-foreground">(Cannot modify your own customer status)</span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="is_distributor"
                  checked={formData.is_distributor}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_distributor: checked })}
                />
                <Label htmlFor="is_distributor">Distributor</Label>
              </div>
            </div>

            {formData.is_distributor && canManageSalesTaxLicense() && (
              <div className="border rounded-lg p-4 bg-muted/20">
                <h4 className="font-medium mb-3">Distributor Information</h4>
                <div>
                  <Label htmlFor="sales_tax_license">Sales Tax License</Label>
                  <div className="mt-2">
                    {formData.sales_tax_license_url ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-2 border rounded bg-background">
                          <span className="text-sm text-muted-foreground">License uploaded</span>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleViewLicense}
                            >
                              View
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setFormData({ ...formData, sales_tax_license_url: '' })}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <Input
                          id="sales_tax_license"
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={handleFileUpload}
                          disabled={isUploading}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Upload an image or PDF of your sales tax license (max 5MB)
                        </p>
                        {(isUploading || processingOCR) && (
                          <p className="text-xs text-blue-600 mt-1">
                            {isUploading ? 'Uploading...' : 'Processing license with OCR...'}
                          </p>
                        )}
                      </div>
                    )}
                    
                    {/* OCR Status and Expiration Date Display */}
                    {formData.sales_tax_license_url && (
                      <div className="mt-4 space-y-2">
                        {processingOCR && (
                          <div className="p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
                            Processing license image to extract expiration date...
                          </div>
                        )}
                        

                        {formData.sales_tax_license_url && !processingOCR && (
                          <div className="space-y-2">
                            <Label htmlFor="license_expiration">License Expiration Date *</Label>
                            <Input
                              id="license_expiration"
                              type="date"
                              value={licenseExpiresAt}
                              onChange={(e) => {
                                const dateValue = e.target.value;
                                setLicenseExpiresAt(dateValue);
                                
                                // Only validate if the input is completely filled (no partial dates)
                                if (dateValue && dateValue.length >= 8 && !dateValue.includes('_') && !dateValue.includes('/')) {
                                  // For date inputs, check if it's a complete valid date
                                  const date = new Date(dateValue);
                                  if (!isNaN(date.getTime()) && dateValue.includes('-')) {
                                    setLicenseExpirationDate(date);
                                  }
                                } else {
                                  setLicenseExpirationDate(undefined);
                                }
                              }}
                              placeholder="YYYY-MM-DD"
                            />
                            <p className="text-xs text-muted-foreground">
                              Please enter the expiration date from your license document
                            </p>
                            
                            {/* Show validation only when licenseExpirationDate is set */}
                            {licenseExpirationDate && (
                              <div className="mt-4">
                                <div className={`p-2 border rounded text-sm ${
                                  licenseExpirationDate <= new Date()
                                    ? 'bg-red-50 border-red-200 text-red-700'
                                    : licenseExpirationDate <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                                    ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
                                    : 'bg-green-50 border-green-200 text-green-700'
                                }`}>
                                  <strong>License Expires:</strong> {licenseExpirationDate.toLocaleDateString()}
                                  {licenseExpirationDate <= new Date() && (
                                    <div className="mt-1 font-medium">
                                      ⚠️ EXPIRED - Sales tax will be applied to Colorado orders
                                    </div>
                                  )}
                                  {licenseExpirationDate > new Date() && 
                                   licenseExpirationDate <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) && (
                                    <div className="mt-1 font-medium">
                                      ⚠️ Expires within 30 days
                                    </div>
                                  )}
                                </div>
                                {/* Only show change date button if license is expired */}
                                {licenseExpirationDate <= new Date() && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setLicenseExpirationDate(undefined);
                                      setLicenseExpiresAt('');
                                    }}
                                    className="mt-2"
                                  >
                                    Enter Different Date
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {ocrData && ocrData.confidence_score && (
                          <div className="text-xs text-muted-foreground">
                            OCR Confidence: {Math.round(ocrData.confidence_score * 100)}%
                            {ocrData.license_number && ` • License #: ${ocrData.license_number}`}
                            {ocrData.state && ` • State: ${ocrData.state}`}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="billing" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-medium">Billing Address</CardTitle>
              </CardHeader>
               <CardContent className="space-y-3">
                 <div>
                   <Label>Street Address *</Label>
                   <Input
                     value={formData.billing_address}
                     onChange={(e) => setFormData({ ...formData, billing_address: e.target.value })}
                     placeholder="Enter street address"
                   />
                 </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label>City *</Label>
                    <Input
                      value={formData.billing_city || ''}
                      onChange={(e) => setFormData({ ...formData, billing_city: e.target.value })}
                      placeholder="City"
                    />
                  </div>
                   <div>
                     <Label>State *</Label>
                     <Select
                       value={formData.billing_state || ''}
                       onValueChange={(value) => setFormData({ ...formData, billing_state: value })}
                     >
                       <SelectTrigger>
                         <SelectValue placeholder="Select state" />
                       </SelectTrigger>
                       <SelectContent>
                         {usStates.map((state) => (
                           <SelectItem key={state.value} value={state.value}>
                             {state.label}
                           </SelectItem>
                         ))}
                       </SelectContent>
                     </Select>
                   </div>
                  <div>
                    <Label>ZIP Code *</Label>
                    <Input
                      value={formData.billing_zip || ''}
                      onChange={(e) => setFormData({ ...formData, billing_zip: e.target.value })}
                      placeholder="ZIP"
                    />
                  </div>
                </div>
                
                {/* Copy to Shipping Button */}
                <div className="pt-3 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={copyBillingToShipping}
                    disabled={!formData.billing_address.trim() || !formData.billing_city.trim() || 
                             !formData.billing_state.trim() || !formData.billing_zip.trim()}
                    className="w-full"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy to Shipping
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="text-sm text-muted-foreground">
                <p><strong>Sales Tax Policy:</strong> Sales tax is only applied to non-distributor orders shipped to Colorado addresses.</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="shipping" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Shipping Addresses</h3>
              <Button onClick={addShippingAddress} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Address
              </Button>
            </div>

            {shippingAddresses.map((address) => (
              <Card key={address.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Shipping Address</CardTitle>
                  <div className="flex items-center space-x-2">
                    <div className="flex items-center space-x-1">
                      <input
                        type="radio"
                        id={`default-${address.id}`}
                        name="defaultShipping"
                        checked={defaultShippingId === address.id}
                        onChange={() => setDefaultShippingId(address.id)}
                      />
                      <Label htmlFor={`default-${address.id}`} className="text-xs">Default</Label>
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeShippingAddress(address.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Remove shipping address</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label>Address Name *</Label>
                    <Input
                      value={address.name}
                      onChange={(e) => updateShippingAddress(address.id, 'name', e.target.value)}
                      placeholder="e.g., Main Office, Warehouse"
                    />
                  </div>
                  <div>
                    <Label>Street Address *</Label>
                    <Input
                      value={address.address}
                      onChange={(e) => updateShippingAddress(address.id, 'address', e.target.value)}
                      placeholder="Enter street address"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label>City *</Label>
                      <Input
                        value={address.city}
                        onChange={(e) => updateShippingAddress(address.id, 'city', e.target.value)}
                        placeholder="City"
                      />
                    </div>
                     <div>
                       <Label>State *</Label>
                       <Select
                         value={address.state}
                         onValueChange={(value) => updateShippingAddress(address.id, 'state', value)}
                       >
                         <SelectTrigger>
                           <SelectValue placeholder="Select state" />
                         </SelectTrigger>
                         <SelectContent>
                           {usStates.map((state) => (
                             <SelectItem key={state.value} value={state.value}>
                               {state.label}
                             </SelectItem>
                           ))}
                         </SelectContent>
                       </Select>
                     </div>
                    <div>
                      <Label>ZIP Code *</Label>
                      <Input
                        value={address.zip}
                        onChange={(e) => updateShippingAddress(address.id, 'zip', e.target.value)}
                        placeholder="ZIP"
                      />
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 mt-3">
                    <Switch
                      id={`signature-${address.id}`}
                      checked={address.signature_required}
                      onCheckedChange={(checked) => updateShippingAddress(address.id, 'signature_required', checked)}
                    />
                    <Label htmlFor={`signature-${address.id}`}>Signature Required for Delivery</Label>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Third-Party Shipping Accounts - Only show for distributors */}
            {formData.is_distributor && (
              <Card className="mt-4">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Third-Party Shipping Accounts</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Bill shipments directly to the distributor's carrier account (uses billing ZIP for carrier verification)
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="use_third_party_shipping">Use Customer's Carrier Account</Label>
                      <p className="text-sm text-muted-foreground">
                        When enabled, shipping charges will be billed to the distributor's account
                      </p>
                    </div>
                    <Switch
                      id="use_third_party_shipping"
                      checked={formData.use_third_party_shipping}
                      onCheckedChange={(checked) => setFormData({ ...formData, use_third_party_shipping: checked })}
                    />
                  </div>

                  {formData.use_third_party_shipping && (
                    <div className="space-y-4 pt-2">
                      <p className="text-xs text-muted-foreground">
                        The customer's billing ZIP code ({formData.billing_zip || 'not set'}) will be used for carrier account verification.
                      </p>
                      
                      {/* FedEx Account */}
                      <div className="border rounded-lg p-4">
                        <Label htmlFor="fedex_account_number">FedEx Account Number</Label>
                        <Input
                          id="fedex_account_number"
                          value={formData.fedex_account_number}
                          onChange={(e) => setFormData({ ...formData, fedex_account_number: e.target.value })}
                          placeholder="e.g., 123456789"
                          className="mt-1"
                        />
                      </div>

                      {/* UPS Account */}
                      <div className="border rounded-lg p-4">
                        <Label htmlFor="ups_account_number">UPS Account Number</Label>
                        <Input
                          id="ups_account_number"
                          value={formData.ups_account_number}
                          onChange={(e) => setFormData({ ...formData, ups_account_number: e.target.value })}
                          placeholder="e.g., A1B2C3"
                          className="mt-1"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="preferences" className="space-y-4">
            <div>
              <Label htmlFor="preferred_shipping_carrier">Preferred Shipping Carrier *</Label>
              <Select
                value={formData.preferred_shipping_carrier}
                onValueChange={(value) => setFormData({ ...formData, preferred_shipping_carrier: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select carrier" />
                </SelectTrigger>
                <SelectContent>
                  {getAvailableCarriers().map((carrier) => (
                    <SelectItem key={carrier.value} value={carrier.value}>
                      {carrier.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="price_level_id">Price Level *</Label>
              <Select
                value={formData.price_level_id}
                onValueChange={(value) => setFormData({ ...formData, price_level_id: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select price level" />
                </SelectTrigger>
                <SelectContent>
                  {priceLevels
                    .sort((a, b) => b.discount_percentage - a.discount_percentage)
                    .map((level) => (
                      <SelectItem key={level.id} value={level.id}>
                        {level.discount_percentage}% - {level.name}
                        {level.description && ` (${level.description})`}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {canEditCredit && (<>
            <div>
              <Label htmlFor="credit_limit">Credit Limit</Label>
              <Input
                id="credit_limit"
                inputMode="decimal"
                value={creditLimitInput}
                onChange={(e) => setCreditLimitInput(e.target.value)}
                onBlur={() => { const n = parseCreditLimit(creditLimitInput); if (n !== null) setCreditLimitInput(n.toFixed(2)); }}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Orders on credit terms beyond this amount go on Credit Hold and can't ship
              </p>
            </div>
            <div>
              <Label htmlFor="payment_terms">Payment Terms *</Label>
              <Select
                value={formData.payment_terms}
                onValueChange={(value) => setFormData({ ...formData, payment_terms: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment terms" />
                </SelectTrigger>
                <SelectContent>
                  {paymentTermsOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Determines when payment is required for orders
              </p>
            </div>
            </>)}

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="is_taxable">Taxable</Label>
                <p className="text-sm text-muted-foreground">Charge sales tax on orders</p>
              </div>
              <Switch
                id="is_taxable"
                checked={formData.is_taxable}
                onCheckedChange={(checked) => setFormData({ ...formData, is_taxable: checked })}
              />
            </div>

          </TabsContent>
        </Tabs>

        <div className="flex gap-2 pt-4">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleSubmit} className="flex-1">
            {customer ? 'Update' : 'Create'} Customer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    
    {saveResult && (
      <CustomerSaveResultDialog
        open={showSaveResultDialog}
        onClose={handleSaveResultDialogClose}
        dbSuccess={saveResult.dbSuccess}
        dbError={saveResult.dbError}
        stripeSuccess={saveResult.stripeSuccess}
        stripeError={saveResult.stripeError}
        customerName={saveResult.customerName}
      />
    )}
    </>
  );
}