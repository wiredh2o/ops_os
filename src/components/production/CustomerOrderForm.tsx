import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import { CarrierRateErrors } from "@/components/shipping/CarrierRateErrors";
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Trash2,
  Plus,
  MapPin,
  Check,
  Star,
  Package,
  Truck,
  Pencil,
  CreditCard,
  Loader2,
  RefreshCw,
  Circle,
  ArrowLeft,
  ArrowRight,
  Zap,
  Clock,
  FlaskConical,
  ChevronRight,
  ChevronDown,
  Boxes,
  DollarSign,
  Mail,
  CheckCircle2,
  Copy,
  Send,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, cn } from "@/lib/utils";
import { format } from "date-fns";
import { AddAddressForm } from "@/components/shipping/AddAddressForm";
import { EditAddressForm } from "@/components/shipping/EditAddressForm";
import { US_STATES } from "@/lib/us-states";
import { useShipFromAddress } from "@/hooks/useCompanySettings";
import { calculateJurisdictionTax, getTaxModel, type TaxModel } from "@/lib/tax-utils";
import { TaxLines } from "./TaxLines";
import { usePaymentStatus } from "@/hooks/usePaymentStatus";
import { PaymentStatusAlert } from "@/components/production/PaymentStatusAlert";
import { ManageCardsModal } from "@/components/production/ManageCardsModal";
import { StripeCustomerLink } from "@/components/customers/StripeCustomerLink";
import { PaymentSelector } from "@/components/shipping/PaymentSelector";
import { PackingStepContent, type PackingConfig } from "@/components/shipping/PackingStepContent";
import type { PackingResult } from "@/lib/box-packing-utils";
import { DropShipAddressPanel } from "@/components/shipping/DropShipAddressPanel";
import { carrierAllowedForDropShip, isDropShipSnapshot, toDropShipSnapshot, type DropShipAddress } from "@/lib/drop-ship";

// Build the serializable packing payload (used by all save paths).
// Returns a plain JS array — Supabase handles jsonb serialization automatically.
function buildPackingPayload(packages: PackingResult[] | undefined): any[] | null {
  if (!packages) return null;
  return packages.map(p => ({
    box: p.box ? {
      id: p.box.id, name: p.box.name,
      dimension_l: p.box.dimension_l, dimension_w: p.box.dimension_w, dimension_h: p.box.dimension_h,
      cost_per_box: p.box.cost_per_box, weight_oz: p.box.weight_oz, max_weight_oz: p.box.max_weight_oz,
    } : null,
    packedItems: p.packedItems || [],
    itemVolume: p.itemVolume,
    boxVolume: p.boxVolume,
    voidVolume: p.voidVolume,
    fillPercentage: p.fillPercentage,
    paperFillInches: p.paperFillInches,
    paperFillFeet: p.paperFillFeet,
    paperWeightOz: p.paperWeightOz,
    totalItemWeightOz: p.totalItemWeightOz,
    boxWeightOz: p.boxWeightOz,
    totalPackageWeightOz: p.totalPackageWeightOz,
    boxCost: p.boxCost,
    paperCost: p.paperCost,
    totalMaterialCost: p.totalMaterialCost,
    allItemsFit: p.allItemsFit,
    weightOk: p.weightOk,
    isSelfPackaged: p.isSelfPackaged,
    selfPackagedDimensions: p.selfPackagedDimensions,
  }));
}

// Normalize legacy packing_packages_json values.
// Handles: proper array, JSON string, array-of-one-string (double-encoded).
function normalizePackingJson(raw: any): any[] | null {
  if (!raw) { console.log('[PackingNorm] null/undefined input'); return null; }
  try {
    let parsed: any;
    if (typeof raw === 'string') {
      console.log('[PackingNorm] parsing string payload');
      parsed = JSON.parse(raw);
    } else if (Array.isArray(raw)) {
      if (raw.length === 1 && typeof raw[0] === 'string') {
        console.log('[PackingNorm] unwrapping double-encoded array-of-string');
        parsed = JSON.parse(raw[0]);
      } else {
        parsed = raw;
      }
    } else {
      console.warn('[PackingNorm] unexpected type:', typeof raw);
      return null;
    }
    // Ensure result is an array
    if (!Array.isArray(parsed)) {
      console.warn('[PackingNorm] parsed result is not an array');
      return null;
    }
    // Sanity check: validate each entry has expected shape
    const valid = parsed.every((p: any) =>
      p && typeof p === 'object' && ('box' in p || 'isSelfPackaged' in p)
    );
    if (!valid) {
      console.warn('[PackingNorm] entries missing expected shape (box or isSelfPackaged)');
      return null;
    }
    // Sanity check: unreasonable package count (> 50 is suspicious)
    if (parsed.length > 50) {
      console.warn(`[PackingNorm] suspicious package count: ${parsed.length}, discarding`);
      return null;
    }
    console.log(`[PackingNorm] valid payload with ${parsed.length} packages`);
    return parsed;
  } catch (e) {
    console.error('[PackingNorm] parse failed:', e);
    return null;
  }
}

interface Company {
  id: string;
  name: string;
  shipping_addresses: any;
  default_shipping_address_id: string | null;
  preferred_shipping_carrier: string | null;
  signature_required: boolean;
  billing_address: string | null;
  is_taxable?: boolean;
  is_distributor?: boolean;
  customer_number?: number;
  owners_name?: string | null;
  stripe_customer_id?: string | null;
  email?: string | null;
  phone?: string | null;
  payment_terms?: string | null;
}

interface ShippingAddress {
  is_taxable?: boolean;
  id: string;
  name?: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
  signature_required?: boolean;
}

interface BillingAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
}

interface CombinedItem {
  id: string;
  sku: string;
  name: string;
  price: number;
  type: "inventory_item" | "assembly" | "labor";
  sales_description?: string | null;
  serial_tracking_type?: string | null;
  quantity_ats?: number | null;
  is_taxable?: boolean;
}

interface SalesUom {
  id: string;
  quantity: number;
  unit_price: number;
  description: string | null;
  is_default: boolean;
}

interface OrderItem {
  id: string;
  item_type: "inventory_item" | "assembly" | "labor";
  inventory_item_id?: string;
  assembly_id?: string;
  labor_item_id?: string;
  item_name: string;
  item_sku: string;
  quantity_ordered: number;
  is_taxable?: boolean;
  quantity_invoiced: number;
  unit_price: number;
  notes?: string;
  uom_label?: string;
  inventory_sales_uom_id?: string;
  assembly_sales_uom_id?: string;
  sales_uom_quantity?: number;
  requested_serial?: string;
  serial_tracking_type?: string | null;
}

// Enhanced shipping option with full rate data
interface EnhancedShippingOption {
  carrier: "fedex" | "ups" | "usps";
  service_type: string;
  service_name: string;
  transit_days: number;
  transit_hours: number;
  estimated_delivery?: string;
  delivery_time_display?: string;
  customer_value_hours?: number;
  total_charge: number;
  account_charge?: number;
  cost_per_value_hour?: number;
  marginal_cost_per_hour?: number;
  hours_saved?: number;
  price_diff?: number;
  isMock: boolean;
}

interface CustomerOrderFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
   orderId?: string;
}

type Step = "customer_order" | "packing" | "shipping" | "payment" | "confirmation";
type SortOption = "value" | "speed" | "carrier" | "price";

// RateInput component - uses "format on blur" pattern to prevent cursor jumping
interface RateInputProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}

const RateInput: React.FC<RateInputProps> = ({ value, onChange, className }) => {
  const [localValue, setLocalValue] = useState<string>("");
  const [isFocused, setIsFocused] = useState(false);

  const formatRateDisplay = useCallback((num: number): string => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  }, []);

  // Sync from prop when not focused
  useEffect(() => {
    if (!isFocused) {
      setLocalValue(formatRateDisplay(value));
    }
  }, [value, isFocused, formatRateDisplay]);

  const handleFocus = () => {
    setIsFocused(true);
    // Show raw number for easier editing
    setLocalValue(value === 0 ? "" : value.toString());
  };

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseFloat(localValue.replace(/,/g, "")) || 0;
    onChange(parsed);
    setLocalValue(formatRateDisplay(parsed));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow digits, decimal point, and commas
    const cleaned = e.target.value.replace(/[^0-9.,]/g, "");
    setLocalValue(cleaned);
  };

  return (
    <Input
      type="text"
      className={className}
      value={localValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
};

// Logo mappings - same as MultiCarrierRateComparison
const CARRIER_LOGOS: Record<string, string> = {
  fedex: "/carrier-logos/fedex-logo.png",
  ups: "/carrier-logos/ups-logo-new.png",
  usps: "/carrier-logos/usps-logo-new.png",
};

const CARRIER_BADGES: Record<string, string> = {
  fedex: "/carrier-logos/fedex-logo.png",
  ups: "/carrier-logos/ups-logo-new.png",
  usps: "/carrier-logos/usps-logo-new.png",
};

const SERVICE_LOGOS: Record<string, string> = {
  // FedEx Express services
  FIRST_OVERNIGHT: "/carrier-logos/fedex-express.png",
  FEDEX_FIRST_OVERNIGHT: "/carrier-logos/fedex-express.png",
  PRIORITY_OVERNIGHT: "/carrier-logos/fedex-express.png",
  FEDEX_PRIORITY_OVERNIGHT: "/carrier-logos/fedex-express.png",
  STANDARD_OVERNIGHT: "/carrier-logos/fedex-express.png",
  FEDEX_STANDARD_OVERNIGHT: "/carrier-logos/fedex-express.png",
  FEDEX_EXPRESS_SAVER: "/carrier-logos/fedex-express.png",
  FEDEX_2_DAY: "/carrier-logos/fedex-express.png",
  FEDEX_2_DAY_AM: "/carrier-logos/fedex-express.png",
  // FedEx Ground services
  FEDEX_GROUND: "/carrier-logos/fedex-ground.png",
  GROUND_HOME_DELIVERY: "/carrier-logos/fedex-ground.png",
  FEDEX_HOME_DELIVERY: "/carrier-logos/fedex-ground.png",
  FEDEX_GROUND_ECONOMY: "/carrier-logos/fedex-ground.png",
  SMART_POST: "/carrier-logos/fedex-ground.png",
  // UPS services
  "01": "/carrier-logos/ups-logo-new.png",
  "13": "/carrier-logos/ups-logo-new.png",
  "14": "/carrier-logos/ups-logo-new.png",
  "02": "/carrier-logos/ups-logo-new.png",
  "59": "/carrier-logos/ups-logo-new.png",
  "03": "/carrier-logos/ups-logo-new.png",
  "12": "/carrier-logos/ups-logo-new.png",
  // USPS services
  PRIORITY_MAIL_EXPRESS: "/carrier-logos/usps-logo-new.png",
  PRIORITY_MAIL: "/carrier-logos/usps-logo-new.png",
  USPS_GROUND_ADVANTAGE: "/carrier-logos/usps-logo-new.png",
  FLAT_RATE_SMALL_FLAT_RATE_BOX: "/carrier-logos/usps-logo-new.png",
  FLAT_RATE_MEDIUM_FLAT_RATE_BOX_TOP: "/carrier-logos/usps-logo-new.png",
  FLAT_RATE_MEDIUM_FLAT_RATE_BOX_SIDE: "/carrier-logos/usps-logo-new.png",
  FLAT_RATE_LARGE_FLAT_RATE_BOX: "/carrier-logos/usps-logo-new.png",
  FLAT_RATE_FLAT_RATE_ENVELOPE: "/carrier-logos/usps-logo-new.png",
};

// Calculate value scores ranked by cost per value hour, with marginal upgrade cost
function calculateValueScores(options: EnhancedShippingOption[]): EnhancedShippingOption[] {
  if (options.length === 0) return options;

  // Find baseline: lowest total_charge (cheapest option)
  const baseline = options.reduce((cheapest, opt) =>
    opt.total_charge < cheapest.total_charge ? opt : cheapest,
    options[0]
  );

  return options.map((option) => {
    const isBaseline = option.carrier === baseline.carrier && option.service_type === baseline.service_type;

    let marginal_cost_per_hour: number | undefined;
    let hours_saved: number | undefined;
    let price_diff: number | undefined;
    if (!isBaseline) {
      price_diff = option.total_charge - baseline.total_charge;
      let hoursSaved = (baseline.customer_value_hours ?? baseline.transit_hours)
                     - (option.customer_value_hours ?? option.transit_hours);
      if (hoursSaved <= 0) {
        hoursSaved = (baseline.transit_hours ?? baseline.transit_days * 24)
                   - (option.transit_hours ?? option.transit_days * 24);
      }
      marginal_cost_per_hour = hoursSaved > 0 ? price_diff / hoursSaved : 0;
      hours_saved = hoursSaved > 0 ? hoursSaved : 0;
    }

    return { ...option, marginal_cost_per_hour, hours_saved, price_diff };
  });
}

// Format delivery date
function formatDeliveryDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "";
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
  } catch {
    return "";
  }
}

 export const CustomerOrderForm: React.FC<CustomerOrderFormProps> = ({ open, onClose, onSuccess, orderId }) => {
  // Step management - now just 2 steps
  const [step, setStep] = useState<Step>("customer_order");
  const [hasVisitedPacking, setHasVisitedPacking] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      scrollContainerRef.current?.scrollTo({ top: 0, left: 0 });
    });
    return () => cancelAnimationFrame(frame);
  }, [step]);

  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [combinedItems, setCombinedItems] = useState<CombinedItem[]>([]);
  const [inventorySalesUoms, setInventorySalesUoms] = useState<Record<string, SalesUom[]>>({});
  const [assemblySalesUoms, setAssemblySalesUoms] = useState<Record<string, SalesUom[]>>({});
  const [taxModel, setTaxModel] = useState<TaxModel>({ jurisdictions: [], zips: [], assignments: [] });
  const [taxLoading, setTaxLoading] = useState(false);
  const [taxError, setTaxError] = useState("");

  const [formData, setFormData] = useState({
    customer_company_id: "",
    shipping_address_id: "",
    drop_ship_address_id: "",
    carrier_preference: "",
    shipping_method_preference: "",
    signature_option: "indirect",
    shipping_preference: "ship_complete",
    priority: "normal",
    due_date: "",
    order_date: format(new Date(), "yyyy-MM-dd"),
    source: "phone",
    estimated_shipping: 0,
    deposit_amount: 0,
    deposit_paid: false,
    notes: "",
    internal_notes: "",
    customer_po: "",
  });

  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [packingConfig, setPackingConfig] = useState<PackingConfig | null>(null);
  const [shippingAddresses, setShippingAddresses] = useState<ShippingAddress[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<ShippingAddress | null>(null);
  // Distributor-owned drop-ship address (not linked to any car-wash account)
  const [dropShipAddress, setDropShipAddress] = useState<DropShipAddress | null>(null);
  const shippingAddressesRef = useRef(shippingAddresses);
  shippingAddressesRef.current = shippingAddresses;

  // Auto-save state and refs
  const [savedOrderId, setSavedOrderId] = useState<string | null>(null);
  const [savedOrderNumber, setSavedOrderNumber] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailPreviewHtml, setEmailPreviewHtml] = useState<string | null>(null);
  const [emailPreviewLoading, setEmailPreviewLoading] = useState(false);
  const lastSavedDataRef = useRef<string | null>(null);
  const isSavingRef = useRef(false);
  const saveErrorRef = useRef<string | null>(null);
  const orderItemsLoadedRef = useRef(false);

  // Refs to store latest values and avoid stale closures
  const formDataRef = useRef(formData);
  const orderItemsRef = useRef(orderItems);
  const savedOrderIdRef = useRef(savedOrderId);
  const userIdRef = useRef<string | undefined>(undefined);
  const packingConfigRef = useRef<PackingConfig | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  useEffect(() => {
    orderItemsRef.current = orderItems;
  }, [orderItems]);

  useEffect(() => {
    packingConfigRef.current = packingConfig;
  }, [packingConfig]);

  // Build a stable fingerprint of order content that matters for packing
  const orderItemsFingerprint = useMemo(() => {
    return JSON.stringify(
      orderItems.map(item => ({
        item_type: item.item_type,
        inventory_item_id: item.inventory_item_id,
        assembly_id: item.assembly_id,
        quantity_ordered: item.quantity_ordered,
      }))
    );
  }, [orderItems]);

  // Invalidate packing config only when actual content changes after initial load
  useEffect(() => {
    if (!orderItemsLoadedRef.current) {
      if (orderItems.length > 0) {
        orderItemsLoadedRef.current = true;
      }
      return;
    }
    setPackingConfig(null);
  }, [orderItemsFingerprint]);

  useEffect(() => {
    savedOrderIdRef.current = savedOrderId;
  }, [savedOrderId]);

  // Address management state
  const [showAddAddressForm, setShowAddAddressForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<ShippingAddress | null>(null);

  // Billing address state
  const [billingAddress, setBillingAddress] = useState<BillingAddress | null>(null);
  const [showEditBillingForm, setShowEditBillingForm] = useState(false);
  const [savingBilling, setSavingBilling] = useState(false);
  const [billingFormData, setBillingFormData] = useState<BillingAddress>({
    street: "",
    city: "",
    state: "",
    zip: "",
  });

  // Enhanced shipping options state
  const [loadingShippingOptions, setLoadingShippingOptions] = useState(false);
  const [availableShippingOptions, setAvailableShippingOptions] = useState<EnhancedShippingOption[]>([]);
  const [shippingOptionsLoaded, setShippingOptionsLoaded] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("value");
  const [carrierFilters, setCarrierFilters] = useState<Set<string>>(new Set(["fedex", "ups", "usps"]));
  const [carrierStatuses, setCarrierStatuses] = useState<Record<string, { available: boolean; isMock: boolean; error?: string }>>({});

  const { toast } = useToast();
  const { user } = useAuth();
  const shipFromAddress = useShipFromAddress();

  // Payment status tracking
  const {
    paymentStatus,
    soonestExpiringCard,
    daysUntilExpiry,
    checkPaymentStatus,
    resetPaymentStatus,
    validCardCount,
  } = usePaymentStatus();

  // Modal states for payment management
  const [showStripeCustomerModal, setShowStripeCustomerModal] = useState(false);
  const [showManageCardsModal, setShowManageCardsModal] = useState(false);

  // Payment step state
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(null);
  const [selectedPaymentType, setSelectedPaymentType] = useState<string | null>(null);
  const [selectedCardBrand, setSelectedCardBrand] = useState<string | null>(null);
  const [selectedCardLast4, setSelectedCardLast4] = useState<string | null>(null);

  // Keep user ID ref in sync (must be after useAuth hook)
  useEffect(() => {
    userIdRef.current = user?.id;
  }, [user?.id]);

  // Track previous address ID to distinguish initial load from user-initiated change
  const prevAddressIdRef = useRef<string | null>(null);

  // Clear shipping options only when the address actually changes (not on initial population)
  useEffect(() => {
    const currentId = selectedAddress?.id || null;
    if (prevAddressIdRef.current !== null && prevAddressIdRef.current !== currentId) {
      // User changed the address — clear shipping options and preferences
      setAvailableShippingOptions([]);
      setShippingOptionsLoaded(false);
      setCarrierStatuses({});
      setFormData((prev) => ({
        ...prev,
        carrier_preference: "",
        shipping_method_preference: "",
      }));
    }
    prevAddressIdRef.current = currentId;
  }, [selectedAddress?.id]);

  // Auto-load shipping options when entering the shipping step
  useEffect(() => {
    if (
      step === "shipping" &&
      selectedAddress &&
      shipFromAddress &&
      !shippingOptionsLoaded &&
      !loadingShippingOptions
    ) {
      loadShippingOptions();
    }
  }, [step, selectedAddress, shipFromAddress, shippingOptionsLoaded, loadingShippingOptions]);

  // Load email preview when confirmation step is reached
  useEffect(() => {
    if (step === "confirmation" && !emailPreviewHtml && !emailPreviewLoading) {
      loadEmailPreview();
    }
  }, [step]);

  // Reset step when modal opens and fetch tax rate
  useEffect(() => {
    if (open) {
      // Reset all form state when opening a new order
      resetForm();
      fetchCompanies();
      fetchInventoryData();

       
       // If editing an existing order, load its data
       if (orderId) {
         loadExistingOrder(orderId);
       }
    }
   }, [open, orderId]);

  // Filter and sort shipping options
  const filteredOptions = useMemo(() => {
    const filtered = availableShippingOptions.filter((opt) => carrierFilters.has(opt.carrier) && carrierAllowedForDropShip(opt.carrier, dropShipAddress));
    return calculateValueScores(filtered);
  }, [availableShippingOptions, carrierFilters, dropShipAddress]);

  const sortedOptions = useMemo(() => {
    const sorted = [...filteredOptions];

    switch (sortBy) {
      case "value":
        sorted.sort((a, b) => {
          if (a.marginal_cost_per_hour === undefined && b.marginal_cost_per_hour !== undefined) return -1;
          if (a.marginal_cost_per_hour !== undefined && b.marginal_cost_per_hour === undefined) return 1;
          if (a.marginal_cost_per_hour === undefined && b.marginal_cost_per_hour === undefined) return 0;
          return (a.marginal_cost_per_hour ?? 0) - (b.marginal_cost_per_hour ?? 0);
        });
        break;
      case "speed":
        sorted.sort(
          (a, b) => (a.customer_value_hours ?? a.transit_hours) - (b.customer_value_hours ?? b.transit_hours),
        );
        break;
      case "carrier":
        sorted.sort((a, b) => {
          if (a.carrier !== b.carrier) return a.carrier.localeCompare(b.carrier);
          return (a.transit_hours ?? 0) - (b.transit_hours ?? 0);
        });
        break;
      case "price":
        sorted.sort((a, b) => (a.total_charge ?? 0) - (b.total_charge ?? 0));
        break;
    }

    return sorted;
  }, [filteredOptions, sortBy]);

  // Customer combobox state
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");

  // Per-line-item search state (for each order item row)
  const [itemSearches, setItemSearches] = useState<Record<string, string>>({});
  const [itemOpenStates, setItemOpenStates] = useState<Record<string, boolean>>({});

  // Customer filtering logic
  const filteredCompanies = useMemo(() => {
    if (!customerSearch) return companies;
    const search = customerSearch.toLowerCase();
    return companies.filter(
      (company) =>
        company.name.toLowerCase().includes(search) ||
        company.customer_number?.toString().includes(search) ||
        company.owners_name?.toLowerCase().includes(search),
    );
  }, [companies, customerSearch]);

  // Item filtering logic
  const getFilteredItems = (itemId: string) => {
    const search = (itemSearches[itemId] || "").toLowerCase();
    if (!search) return combinedItems;
    return combinedItems.filter(
      (item) => item.sku.toLowerCase().includes(search) || item.sales_description?.toLowerCase().includes(search),
    );
  };

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from("companies")
        .select(
          "id, name, shipping_addresses, default_shipping_address_id, preferred_shipping_carrier, signature_required, billing_address, is_taxable, is_distributor, customer_number, owners_name, stripe_customer_id, email, phone, payment_terms",
        )
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error("Error fetching companies:", error);
    }
  };

   // Load existing order for edit mode
   const loadExistingOrder = async (orderIdToLoad: string) => {
     try {
       // Fetch order with company data
       const { data: orderData, error: orderError } = await supabase
         .from("customer_orders")
         .select(`
           *,
           company:companies(id, name, shipping_addresses, default_shipping_address_id, preferred_shipping_carrier, signature_required, billing_address, is_taxable, is_distributor, customer_number, owners_name)
         `)
         .eq("id", orderIdToLoad)
         .single();

       if (orderError) throw orderError;
       if (!orderData) throw new Error("Order not found");

       // Fetch order items
       const { data: itemsData, error: itemsError } = await supabase
         .from("customer_order_items")
         .select("*")
         .eq("customer_order_id", orderIdToLoad);

       if (itemsError) throw itemsError;

       // Set saved order state immediately (this is an existing order)
       setSavedOrderId(orderData.id);
       setSavedOrderNumber(orderData.order_number);
       savedOrderIdRef.current = orderData.id;

       // Populate form data
       setFormData({
         customer_company_id: orderData.customer_company_id,
         shipping_address_id: orderData.shipping_address_id || "",
         drop_ship_address_id: (orderData as any).drop_ship_address_id || "",
         carrier_preference: orderData.carrier_preference || "",
         shipping_method_preference: orderData.shipping_method_preference || "",
         signature_option: orderData.signature_option || "indirect",
         shipping_preference: orderData.shipping_preference || "ship_complete",
         priority: orderData.priority || "normal",
         due_date: orderData.due_date || "",
         order_date: orderData.order_date || format(new Date(), "yyyy-MM-dd"),
         source: orderData.source || "phone",
         estimated_shipping: orderData.estimated_shipping || 0,
         deposit_amount: orderData.deposit_amount || 0,
         deposit_paid: orderData.deposit_paid || false,
         notes: orderData.notes || "",
         internal_notes: orderData.internal_notes || "",
         customer_po: orderData.customer_po || "",
       });

       // Restore selected payment method
       if (orderData.stripe_payment_method_id) {
         setSelectedPaymentMethodId(orderData.stripe_payment_method_id);
       }

       const company = orderData.company as Company | null;
       if (company) {
         const addresses = parseShippingAddresses(company);
         setShippingAddresses(addresses);
         
         // Set selected address
         const selectedAddr = addresses.find(a => a.id === orderData.shipping_address_id);
         const savedDropShip = (orderData as any).drop_ship_snapshot;
         if (isDropShipSnapshot(savedDropShip)) {
           setDropShipAddress(savedDropShip);
           setSelectedAddress(savedDropShip as unknown as ShippingAddress);
         } else if (selectedAddr) {
           setDropShipAddress(null);
           setSelectedAddress(selectedAddr);
         }

          // Parse billing address using the same helper as handleCustomerChange
          const parsedBilling = parseBillingAddress(company.billing_address);
          setBillingAddress(parsedBilling);
          if (parsedBilling) {
            setBillingFormData(parsedBilling);
          }
        }

        // Restore packing config if saved
        let restoredPackingConfig: PackingConfig | null = null;
        if (orderData.packing_packages_json) {
          // Full package data available -- restore with sanity checks
          const raw = orderData.packing_packages_json;
          const savedPackages = normalizePackingJson(raw);
          if (savedPackages && savedPackages.length > 0) {
            console.log('[Restore] Valid packing payload with', savedPackages.length, 'packages');
            restoredPackingConfig = {
              mode: (orderData.packing_mode as "auto" | "manual") || "auto",
              packages: savedPackages,
              ...(orderData.packing_mode === "manual" ? {
                manualBoxId: orderData.selected_box_id || undefined,
                manualWeightOz: orderData.package_weight_oz || 0,
              } : {}),
            };
            setPackingConfig(restoredPackingConfig);
          } else {
            console.warn('[Restore] Corrupted/invalid packing payload — will regenerate on packing step');
            // Don't set packingConfig — algorithm will run fresh
          }
        } else if (orderData.packing_mode && orderData.package_length) {
          // Legacy fallback -- reconstruct stubs
          const restoredBox = orderData.selected_box_id ? {
            id: orderData.selected_box_id,
            name: '',
            dimension_l: orderData.package_length,
            dimension_w: orderData.package_width,
            dimension_h: orderData.package_height,
            cost_per_box: 0,
            weight_oz: 0,
            max_weight_oz: null,
            shipping_cost_multiplier: 1,
            is_active: true,
            created_at: '',
            created_by: '',
            updated_at: '',
            image_url: null,
            lead_time_days: null,
            minimum_order_quantity: null,
            supplier: null,
          } : null;

          if (restoredBox) {
            const restoredResult = {
              box: restoredBox,
              packedItems: [],
              itemVolume: 0,
              boxVolume: (orderData.package_length || 0) * (orderData.package_width || 0) * (orderData.package_height || 0),
              voidVolume: 0,
              fillPercentage: 0,
              paperFillInches: 0,
              paperFillFeet: 0,
              paperWeightOz: 0,
              totalItemWeightOz: orderData.package_weight_oz || 0,
              boxWeightOz: 0,
              totalPackageWeightOz: orderData.package_weight_oz || 0,
              boxCost: 0,
              paperCost: 0,
              totalMaterialCost: 0,
              allItemsFit: true,
              weightOk: true,
              noBoxAvailable: false,
              minimumRequiredDimensions: null,
            };

            setPackingConfig({
              mode: orderData.packing_mode as "auto" | "manual",
              packages: Array.from({ length: orderData.num_packages || 1 }, () => ({
                ...restoredResult,
                box: restoredResult.box ? { ...restoredResult.box } : null,
                packedItems: [],
              })),
              ...(orderData.packing_mode === "manual" ? {
                manualBoxId: orderData.selected_box_id || undefined,
                manualWeightOz: orderData.package_weight_oz || 0,
              } : {}),
            });
          }
        }

       // Map order items to the OrderItem interface
       const mappedItems: OrderItem[] = await Promise.all(
         (itemsData || []).map(async (item) => {
           let itemName = "";
           let itemSku = "";
           let serialTrackingType: string | null = null;

           // Get item details based on type
           if (item.item_type === "inventory_item" && item.inventory_item_id) {
             const { data } = await supabase
               .from("inventory_items")
               .select("sku, purchase_description, serial_tracking_type")
               .eq("id", item.inventory_item_id)
               .single();
             if (data) {
               itemSku = data.sku;
               itemName = data.purchase_description || data.sku;
               serialTrackingType = data.serial_tracking_type;
             }
           } else if (item.item_type === "assembly" && item.assembly_id) {
             const { data } = await supabase
               .from("assemblies")
               .select("sku, sales_description, serial_tracking_type")
               .eq("id", item.assembly_id)
               .single();
             if (data) {
               itemSku = data.sku;
               itemName = data.sales_description || data.sku;
               serialTrackingType = data.serial_tracking_type;
             }
           } else if (item.item_type === "labor" && item.labor_item_id) {
             const { data } = await supabase
               .from("labor_items")
               .select("item_number, name")
               .eq("id", item.labor_item_id)
               .single();
             if (data) {
               itemSku = data.item_number;
               itemName = data.name;
             }
           }

           return {
             id: item.id,
             item_type: item.item_type as "inventory_item" | "assembly" | "labor",
             inventory_item_id: item.inventory_item_id || undefined,
             assembly_id: item.assembly_id || undefined,
             labor_item_id: item.labor_item_id || undefined,
             item_name: itemName,
             item_sku: itemSku,
             is_taxable: item.is_taxable,
             quantity_ordered: item.quantity_ordered,
             quantity_invoiced: item.quantity_invoiced || 0,
             unit_price: item.unit_price,
             notes: item.notes || undefined,
             inventory_sales_uom_id: item.inventory_sales_uom_id || undefined,
             assembly_sales_uom_id: item.assembly_sales_uom_id || undefined,
             requested_serial: item.requested_serial || undefined,
             serial_tracking_type: serialTrackingType,
           };
         })
       );

       setOrderItems(mappedItems);

       // Update the fingerprint to avoid triggering auto-save immediately
       const fingerprint = JSON.stringify({
         formData: {
           customer_company_id: orderData.customer_company_id,
           shipping_address_id: orderData.shipping_address_id || "",
            signature_option: orderData.signature_option || "indirect",
            shipping_preference: orderData.shipping_preference || "ship_complete",
            priority: orderData.priority || "normal",
            due_date: orderData.due_date || "",
            order_date: orderData.order_date || format(new Date(), "yyyy-MM-dd"),
            source: orderData.source || "phone",
            estimated_shipping: orderData.estimated_shipping || 0,
            deposit_amount: orderData.deposit_amount || 0,
            deposit_paid: orderData.deposit_paid || false,
            notes: orderData.notes || "",
            internal_notes: orderData.internal_notes || "",
            customer_po: orderData.customer_po || "",
          },
         orderItems: mappedItems.map(item => ({
           item_type: item.item_type,
           inventory_item_id: item.inventory_item_id,
           assembly_id: item.assembly_id,
           labor_item_id: item.labor_item_id,
           quantity_ordered: item.quantity_ordered,
           unit_price: item.unit_price,
           notes: item.notes,
           requested_serial: item.requested_serial,
           inventory_sales_uom_id: item.inventory_sales_uom_id,
           assembly_sales_uom_id: item.assembly_sales_uom_id,
          })),
          packing: restoredPackingConfig ? {
            mode: restoredPackingConfig.mode,
            numPackages: restoredPackingConfig.packages?.length,
            boxes: restoredPackingConfig.packages?.map(p => p.box?.id),
            positionsHash: JSON.stringify(restoredPackingConfig.packages?.map(p =>
              p.packedItems?.map(i => [i.x, i.y, i.z, i.rotationIndex])
            )),
          } : null,
        });
        lastSavedDataRef.current = fingerprint;

       console.log('[EditMode] Order loaded successfully:', orderData.order_number);
     } catch (error) {
       console.error("Error loading existing order:", error);
       toast({
         title: "Error",
         description: "Failed to load order for editing",
         variant: "destructive",
       });
     }
   };

   // Helper to parse shipping addresses from company
   const parseShippingAddresses = (company: Company): ShippingAddress[] => {
     if (!company.shipping_addresses) return [];
     try {
       const parsed = typeof company.shipping_addresses === 'string' 
         ? JSON.parse(company.shipping_addresses) 
         : company.shipping_addresses;
       return Array.isArray(parsed) ? parsed : [];
     } catch {
       return [];
     }
   };

  const fetchInventoryData = async () => {
    try {
      const [itemsResponse, assembliesResponse, laborResponse, invUomsResponse, asmUomsResponse] = await Promise.all([
        supabase
          .from("inventory_items")
          .select("id, sku, unit_price, sales_description, serial_tracking_type, quantity_ats, is_taxable")
          .eq("is_active", true)
          .eq("visible_for_sale", true)
          .order("sku"),
        supabase
          .from("assemblies")
          .select("id, sku, selling_price, sales_description, serial_tracking_type, quantity_ats, taxable")
          .eq("active", true)
          .eq("visible_for_sale", true)
          .order("sku"),
        supabase.from("labor_items").select("id, item_number, name, hourly_rate, description").order("item_number"),
        supabase
          .from("inventory_sales_uoms")
          .select("id, inventory_item_id, quantity, unit_price, description, is_default")
          .order("sort_order"),
        supabase
          .from("assembly_sales_uoms")
          .select("id, assembly_id, quantity, unit_price, description, is_default")
          .order("sort_order"),
      ]);

      if (itemsResponse.error) throw itemsResponse.error;
      if (assembliesResponse.error) throw assembliesResponse.error;
      if (laborResponse.error) throw laborResponse.error;

      // Group sales UOMs by item ID
      const invUomMap: Record<string, SalesUom[]> = {};
      (invUomsResponse.data || []).forEach((uom) => {
        const itemId = (uom as any).inventory_item_id;
        if (!invUomMap[itemId]) invUomMap[itemId] = [];
        invUomMap[itemId].push({
          id: uom.id,
          quantity: uom.quantity,
          unit_price: Number(uom.unit_price),
          description: uom.description,
          is_default: uom.is_default,
        });
      });
      setInventorySalesUoms(invUomMap);

      const asmUomMap: Record<string, SalesUom[]> = {};
      (asmUomsResponse.data || []).forEach((uom) => {
        const asmId = (uom as any).assembly_id;
        if (!asmUomMap[asmId]) asmUomMap[asmId] = [];
        asmUomMap[asmId].push({
          id: uom.id,
          quantity: uom.quantity,
          unit_price: Number(uom.unit_price),
          description: uom.description,
          is_default: uom.is_default,
        });
      });
      setAssemblySalesUoms(asmUomMap);

      const combined: CombinedItem[] = [
        ...(itemsResponse.data || []).map((item) => ({
          id: item.id,
          sku: item.sku,
          name: `${item.sku} (Inventory)`,
          price: item.unit_price,
          type: "inventory_item" as const,
          sales_description: item.sales_description,
          serial_tracking_type: item.serial_tracking_type,
          quantity_ats: item.quantity_ats,
          is_taxable: item.is_taxable,
        })),
        ...(assembliesResponse.data || []).map((assembly) => ({
          id: assembly.id,
          sku: assembly.sku,
          name: `${assembly.sku} (Assembly)`,
          price: assembly.selling_price,
          type: "assembly" as const,
          sales_description: assembly.sales_description,
          serial_tracking_type: assembly.serial_tracking_type,
          quantity_ats: assembly.quantity_ats,
          is_taxable: assembly.taxable,
        })),
        ...(laborResponse.data || []).map((labor) => ({
          id: labor.id,
          sku: labor.item_number,
          name: `${labor.item_number} - ${labor.name} (Labor)`,
          price: labor.hourly_rate,
          type: "labor" as const,
          sales_description: labor.description,
          serial_tracking_type: null,
          quantity_ats: null,
          is_taxable: false,
        })),
      ];

      setCombinedItems(combined);
    } catch (error) {
      console.error("Error fetching inventory data:", error);
    }
  };

  // Load shipping options via rate check with enhanced data
  const loadShippingOptions = async () => {
    if (!selectedAddress || !shipFromAddress) {
      toast({
        title: "Cannot load shipping options",
        description: "Please select a shipping address first",
        variant: "destructive",
      });
      return;
    }

    setLoadingShippingOptions(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-all-carrier-rates", {
        body: {
          ship_from: {
            street: shipFromAddress.street1,
            city: shipFromAddress.city,
            state: shipFromAddress.state,
            postal_code: shipFromAddress.zip,
            country: "US",
          },
          ship_to: {
            street: selectedAddress.address,
            city: selectedAddress.city,
            state: selectedAddress.state,
            postal_code: selectedAddress.zip,
            country: "US",
            residential: false,
          },
          packages: packingConfig && packingConfig.packages.length > 0
            ? packingConfig.packages.map(pkg => ({
                weight_lbs: pkg.totalPackageWeightOz / 16,
                dimensions: {
                  length: pkg.box?.dimension_l || 6,
                  width: pkg.box?.dimension_w || 4,
                  height: pkg.box?.dimension_h || 4,
                },
              }))
            : [{ weight_lbs: 1, dimensions: { length: 6, width: 4, height: 4 } }],
        },
      });

      if (error) throw error;
      setCarrierStatuses(data?.carriers || {});

      if (data?.rates && data.rates.length > 0) {
        // Map full rate data including delivery times
        const options: EnhancedShippingOption[] = data.rates.map((rate: any) => {
          const valueHours = rate.customer_value_hours || rate.transit_hours || (rate.transit_days * 24);
          return {
            carrier: rate.carrier,
            service_type: rate.service_type,
            service_name: rate.service_name,
            transit_days: rate.transit_days,
            transit_hours: rate.transit_hours || rate.transit_days * 24,
            estimated_delivery: rate.estimated_delivery,
            delivery_time_display: rate.delivery_time_display,
            customer_value_hours: rate.customer_value_hours,
            total_charge: rate.total_charge,
            account_charge: rate.account_charge,
            cost_per_value_hour: valueHours > 0 ? rate.total_charge / valueHours : 0,
            isMock: rate.isMock || false,
          };
        });

        // Calculate value scores to determine Best Value
        const scored = calculateValueScores(options);
        setAvailableShippingOptions(scored);
        setCarrierStatuses(data.carriers || {});
        setShippingOptionsLoaded(true);

        // Check if the order already has a saved carrier+method (edit mode)
        const savedCarrier = formData.carrier_preference;
        const savedMethod = formData.shipping_method_preference;

        if (savedCarrier && savedMethod) {
          // Try to find the saved method in the current rates
          const savedOption = scored.find(
            (opt) => opt.carrier === savedCarrier && opt.service_type === savedMethod
          );

          if (savedOption) {
            // Saved method still available — update only the cost (may have changed)
            setFormData((prev) => ({
              ...prev,
              estimated_shipping: savedOption.total_charge,
            }));
          } else {
            // Saved method no longer available — fall back to Best Value
            toast({
              title: "Shipping method unavailable",
              description: `Previously selected method is no longer available. Best Value has been selected instead.`,
            });
            const bestValue = scored.reduce((best, opt) =>
              (opt.cost_per_value_hour ?? Infinity) < (best.cost_per_value_hour ?? Infinity) ? opt : best,
              scored[0]
            );
            setFormData((prev) => ({
              ...prev,
              carrier_preference: bestValue.carrier,
              shipping_method_preference: bestValue.service_type,
              estimated_shipping: bestValue.total_charge,
              signature_option:
                bestValue.carrier === "usps" && prev.signature_option === "indirect" ? "none" : prev.signature_option,
            }));
          }
        } else if (scored.length > 0) {
          // New order — auto-select Best Value (lowest cost_per_value_hour)
          const bestValue = scored.reduce((best, opt) =>
            (opt.cost_per_value_hour ?? Infinity) < (best.cost_per_value_hour ?? Infinity) ? opt : best,
            scored[0]
          );
          setFormData((prev) => ({
            ...prev,
            carrier_preference: bestValue.carrier,
            shipping_method_preference: bestValue.service_type,
            estimated_shipping: bestValue.total_charge,
            signature_option:
              bestValue.carrier === "usps" && prev.signature_option === "indirect" ? "none" : prev.signature_option,
          }));
        }
      } else {
        toast({
          title: "No shipping options available",
          description: "No carriers returned rates for this address",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Error loading shipping options:", error);
      toast({
        title: "Error loading shipping options",
        description: error.message || "Failed to fetch carrier rates",
        variant: "destructive",
      });
    } finally {
      setLoadingShippingOptions(false);
    }
  };

  const handleShippingOptionSelect = (option: EnhancedShippingOption) => {
    const previousCarrier = formData.carrier_preference;
    const newCarrier = option.carrier;

    // Determine new signature option based on carrier change
    let newSignatureOption = formData.signature_option;

    if (newCarrier === "usps" && formData.signature_option === "indirect") {
      // USPS doesn't support indirect - switch to none
      newSignatureOption = "none";
    } else if (previousCarrier === "usps" && newCarrier !== "usps" && formData.signature_option === "direct") {
      // Switching away from USPS - restore indirect if we auto-changed it
      newSignatureOption = "indirect";
    }

    setFormData((prev) => ({
      ...prev,
      carrier_preference: option.carrier,
      shipping_method_preference: option.service_type,
      estimated_shipping: option.total_charge,
      signature_option: newSignatureOption,
    }));
  };

  const toggleCarrierFilter = (carrier: string) => {
    setCarrierFilters((prev) => {
      const next = new Set(prev);
      if (next.has(carrier)) {
        if (next.size > 1) next.delete(carrier);
      } else {
        next.add(carrier);
      }
      return next;
    });
  };

  // Parse billing address from comma-separated string
  const parseBillingAddress = (billingStr: string | null): BillingAddress | null => {
    if (!billingStr) return null;
    const parts = billingStr.split(", ");
    if (parts.length >= 5) {
      return { street: parts[1], city: parts[2], state: parts[3], zip: parts[4] };
    } else if (parts.length === 4) {
      return { street: parts[0], city: parts[1], state: parts[2], zip: parts[3] };
    }
    return null;
  };

  const handleCustomerChange = (companyId: string) => {
    const company = companies.find((c) => c.id === companyId);
    if (company) {
      const addresses =
        typeof company.shipping_addresses === "string"
          ? JSON.parse(company.shipping_addresses || "[]")
          : company.shipping_addresses || [];

      setShippingAddresses(addresses);

      const parsedBilling = parseBillingAddress(company.billing_address);
      setBillingAddress(parsedBilling);
      if (parsedBilling) {
        setBillingFormData(parsedBilling);
      }

      setShowAddAddressForm(false);
      setEditingAddress(null);
      setShowEditBillingForm(false);
      setDropShipAddress(null);
      setFormData((prev) => ({ ...prev, drop_ship_address_id: "" }));

      const defaultAddr =
        addresses.find((a: ShippingAddress) => a.id === company.default_shipping_address_id) || addresses[0];
      if (defaultAddr) {
        setSelectedAddress(defaultAddr);
        setFormData((prev) => ({
          ...prev,
          customer_company_id: companyId,
          shipping_address_id: defaultAddr.id,
          carrier_preference: "",
          shipping_method_preference: "",
          signature_option: "indirect",
        }));
      } else {
        setSelectedAddress(null);
        setFormData((prev) => ({
          ...prev,
          customer_company_id: companyId,
          shipping_address_id: "",
          carrier_preference: "",
          shipping_method_preference: "",
        }));
      }

      // Check payment status for the selected customer
      checkPaymentStatus(company.stripe_customer_id || null);
    }
  };

  const handleAddressSelect = (address: ShippingAddress) => {
    setSelectedAddress(address);
    setDropShipAddress(null);
    setFormData((prev) => ({ ...prev, shipping_address_id: address.id, drop_ship_address_id: "" }));
    setEditingAddress(null);
  };

  const handleDropShipSelect = (address: DropShipAddress) => {
    setDropShipAddress(address);
    setSelectedAddress(toDropShipSnapshot(address) as unknown as ShippingAddress);
    setFormData((prev) => ({
      ...prev,
      shipping_address_id: "",
      drop_ship_address_id: address.id,
      // USPS is not allowed until the drop-ship address is flagged USPS eligible
      ...(prev.carrier_preference === "usps" && !address.usps_eligible ? { carrier_preference: "", shipping_method_preference: "" } : {}),
    }));
    setEditingAddress(null);
    setShowAddAddressForm(false);
  };

  const handleSaveNewAddress = async (
    address: {
      name: string;
      address: string;
      city: string;
      state: string;
      zip: string;
      country: string;
      signature_required: boolean;
    },
    setAsDefault: boolean,
  ) => {
    const newAddress: ShippingAddress = {
      ...address,
      id: crypto.randomUUID(),
    };
    const updatedAddresses = [...shippingAddresses, newAddress];

    try {
      const updateData: any = { shipping_addresses: updatedAddresses };
      if (setAsDefault) {
        updateData.default_shipping_address_id = newAddress.id;
      }

      const { error } = await supabase.from("companies").update(updateData).eq("id", formData.customer_company_id);

      if (error) throw error;

      setShippingAddresses(updatedAddresses);
      setSelectedAddress(newAddress);
      setFormData((prev) => ({ ...prev, shipping_address_id: newAddress.id }));
      setShowAddAddressForm(false);

      setCompanies((prev) =>
        prev.map((c) =>
          c.id === formData.customer_company_id
            ? {
                ...c,
                shipping_addresses: updatedAddresses,
                ...(setAsDefault ? { default_shipping_address_id: newAddress.id } : {}),
              }
            : c,
        ),
      );

      toast({ title: "Address saved successfully" });
    } catch (error: any) {
      console.error("Error saving address:", error);
      toast({ title: "Error", description: "Failed to save address", variant: "destructive" });
    }
  };

  const handleUpdateAddress = async (updatedAddr: ShippingAddress, setAsDefault: boolean) => {
    const updatedAddresses = shippingAddresses.map((a) => (a.id === updatedAddr.id ? updatedAddr : a));

    try {
      const updateData: any = { shipping_addresses: updatedAddresses };
      if (setAsDefault) {
        updateData.default_shipping_address_id = updatedAddr.id;
      }

      const { error } = await supabase.from("companies").update(updateData).eq("id", formData.customer_company_id);

      if (error) throw error;

      setShippingAddresses(updatedAddresses);
      if (selectedAddress?.id === updatedAddr.id) {
        setSelectedAddress(updatedAddr);
      }
      setEditingAddress(null);

      setCompanies((prev) =>
        prev.map((c) =>
          c.id === formData.customer_company_id
            ? {
                ...c,
                shipping_addresses: updatedAddresses,
                ...(setAsDefault ? { default_shipping_address_id: updatedAddr.id } : {}),
              }
            : c,
        ),
      );

      toast({ title: "Address updated successfully" });
    } catch (error: any) {
      console.error("Error updating address:", error);
      toast({ title: "Error", description: "Failed to update address", variant: "destructive" });
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    const updatedAddresses = shippingAddresses.filter((a) => a.id !== addressId);

    try {
      const selectedCompany = companies.find((c) => c.id === formData.customer_company_id);
      const updateData: any = { shipping_addresses: updatedAddresses };

      if (selectedCompany?.default_shipping_address_id === addressId) {
        updateData.default_shipping_address_id = updatedAddresses[0]?.id || null;
      }

      const { error } = await supabase.from("companies").update(updateData).eq("id", formData.customer_company_id);

      if (error) throw error;

      setShippingAddresses(updatedAddresses);

      if (selectedAddress?.id === addressId) {
        const newSelected = updatedAddresses[0] || null;
        setSelectedAddress(newSelected);
        setFormData((prev) => ({ ...prev, shipping_address_id: newSelected?.id || "" }));
      }

      setEditingAddress(null);

      toast({ title: "Address deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting address:", error);
      toast({ title: "Error", description: "Failed to delete address", variant: "destructive" });
    }
  };

  const handleUpdateBillingAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBilling(true);

    try {
      const selectedCompany = companies.find((c) => c.id === formData.customer_company_id);
      const companyName = selectedCompany?.name || "";
      const combinedAddress = [
        companyName,
        billingFormData.street,
        billingFormData.city,
        billingFormData.state,
        billingFormData.zip,
      ]
        .filter(Boolean)
        .join(", ");

      const { error } = await supabase
        .from("companies")
        .update({ billing_address: combinedAddress })
        .eq("id", formData.customer_company_id);

      if (error) throw error;

      setBillingAddress(billingFormData);
      setShowEditBillingForm(false);

      setCompanies((prev) =>
        prev.map((c) => (c.id === formData.customer_company_id ? { ...c, billing_address: combinedAddress } : c)),
      );

      toast({ title: "Billing address updated successfully" });
    } catch (error: any) {
      console.error("Error updating billing address:", error);
      toast({ title: "Error", description: "Failed to update billing address", variant: "destructive" });
    } finally {
      setSavingBilling(false);
    }
  };

  const generateOrderNumber = async (): Promise<string> => {
    const today = format(new Date(), "yyyyMMdd");
    const prefix = `CO-${today}-`;

    const { count } = await supabase
      .from("customer_orders")
      .select("*", { count: "exact", head: true })
      .like("order_number", `${prefix}%`);

    const sequence = ((count || 0) + 1).toString().padStart(3, "0");
    return `${prefix}${sequence}`;
  };

  // Auto-save function
  const performAutoSave = useCallback(async () => {
    console.log('[AutoSave] performAutoSave called');
    
    // Concurrency guard - prevent multiple simultaneous saves
    if (isSavingRef.current) {
      console.log('[AutoSave] Already saving, skipping');
      return;
    }

    // Read from refs to get latest values (avoid stale closures)
    const currentFormData = formDataRef.current;
    const currentOrderItems = orderItemsRef.current;
    const currentSavedOrderId = savedOrderIdRef.current;
    const currentUserId = userIdRef.current;
    const currentPackingConfig = packingConfigRef.current;

    // Don't save if no customer selected
    if (!currentFormData.customer_company_id) {
      console.log('[AutoSave] No customer selected, skipping');
      return;
    }

    console.log('[AutoSave] Customer selected:', currentFormData.customer_company_id);

    // Create a fingerprint of current data to detect changes
    const currentDataFingerprint = JSON.stringify({
      formData: {
        customer_company_id: currentFormData.customer_company_id,
        shipping_address_id: currentFormData.shipping_address_id,
        drop_ship_address_id: currentFormData.drop_ship_address_id,
        signature_option: currentFormData.signature_option,
        shipping_preference: currentFormData.shipping_preference,
        priority: currentFormData.priority,
        due_date: currentFormData.due_date,
        order_date: currentFormData.order_date,
        source: currentFormData.source,
        estimated_shipping: currentFormData.estimated_shipping,
        deposit_amount: currentFormData.deposit_amount,
        deposit_paid: currentFormData.deposit_paid,
        notes: currentFormData.notes,
        internal_notes: currentFormData.internal_notes,
      },
      orderItems: currentOrderItems.map(item => ({
        item_type: item.item_type,
        inventory_item_id: item.inventory_item_id,
        assembly_id: item.assembly_id,
        labor_item_id: item.labor_item_id,
        quantity_ordered: item.quantity_ordered,
        unit_price: item.unit_price,
        notes: item.notes,
        requested_serial: item.requested_serial,
        inventory_sales_uom_id: item.inventory_sales_uom_id,
        assembly_sales_uom_id: item.assembly_sales_uom_id,
      })),
      packing: currentPackingConfig ? {
        mode: currentPackingConfig.mode,
        numPackages: currentPackingConfig.packages?.length,
        boxes: currentPackingConfig.packages?.map(p => p.box?.id),
        positionsHash: JSON.stringify(currentPackingConfig.packages?.map(p =>
          p.packedItems?.map(i => [i.x, i.y, i.z, i.rotationIndex])
        )),
      } : null,
    });

    // Skip if nothing changed since last save
    const fingerprintChanged = currentDataFingerprint !== lastSavedDataRef.current;
    console.log('[AutoSave] Fingerprint changed:', fingerprintChanged);
    
    if (!fingerprintChanged) {
      console.log('[AutoSave] No changes detected, skipping save');
      return;
    }

    // Set concurrency guard
    isSavingRef.current = true;
    setSaveStatus('saving');
    saveErrorRef.current = null;

    try {
      if (currentSavedOrderId) {
        console.log('[AutoSave] Mode: UPDATE (order:', currentSavedOrderId, ')');
        
        // UPDATE existing order
        const { error: updateError } = await supabase
          .from("customer_orders")
           .update({
            customer_company_id: currentFormData.customer_company_id,
            shipping_address_id: currentFormData.drop_ship_address_id ? null : currentFormData.shipping_address_id || null,
            drop_ship_address_id: currentFormData.drop_ship_address_id || null,
            tax_destination: shippingAddressesRef.current.find(a => a.id === currentFormData.shipping_address_id) as any || null,
            signature_option: currentFormData.signature_option,
            shipping_preference: currentFormData.shipping_preference,
            priority: currentFormData.priority,
            due_date: currentFormData.due_date || null,
            order_date: currentFormData.order_date || null,
            source: currentFormData.source,
            estimated_shipping: currentFormData.estimated_shipping,
            deposit_amount: currentFormData.deposit_amount,
            deposit_paid: currentFormData.deposit_paid,
            notes: currentFormData.notes || null,
            internal_notes: currentFormData.internal_notes || null,
            customer_po: currentFormData.customer_po || null,
            packing_mode: currentPackingConfig?.mode || null,
            selected_box_id: currentPackingConfig?.packages?.[0]?.box?.id || null,
            package_weight_oz: currentPackingConfig?.packages?.[0]?.totalPackageWeightOz || null,
            package_length: currentPackingConfig?.packages?.[0]?.box?.dimension_l || null,
            package_width: currentPackingConfig?.packages?.[0]?.box?.dimension_w || null,
            package_height: currentPackingConfig?.packages?.[0]?.box?.dimension_h || null,
            num_packages: currentPackingConfig?.packages?.length || 1,
            packing_packages_json: buildPackingPayload(currentPackingConfig?.packages),
          })
          .eq("id", currentSavedOrderId);

        if (updateError) {
          console.error('[AutoSave] Update error:', updateError);
          throw updateError;
        }

        console.log('[AutoSave] Order updated successfully');

        // Delete existing items and re-insert
        const { error: deleteError } = await supabase.from("customer_order_items").delete().eq("customer_order_id", currentSavedOrderId);
        if (deleteError) {
          console.error('[AutoSave] Delete items error:', deleteError);
          throw deleteError;
        }

        if (currentOrderItems.length > 0) {
          const itemsToInsert = currentOrderItems
            .filter(item => item.item_sku) // Only save items with a selected product
            .map((item) => ({
              customer_order_id: currentSavedOrderId,
              item_type: item.item_type,
              inventory_item_id: item.inventory_item_id || null,
              assembly_id: item.assembly_id || null,
              labor_item_id: item.labor_item_id || null,
              is_taxable: item.item_type !== "labor" && item.is_taxable !== false,
              quantity_ordered: item.quantity_ordered,
              unit_price: item.unit_price,
              notes: item.notes || null,
              requested_serial: item.requested_serial || null,
              inventory_sales_uom_id: item.inventory_sales_uom_id || null,
              assembly_sales_uom_id: item.assembly_sales_uom_id || null,
              quantity_invoiced: item.quantity_invoiced || 0,
            }));

          if (itemsToInsert.length > 0) {
            const { error: insertItemsError } = await supabase.from("customer_order_items").insert(itemsToInsert);
            if (insertItemsError) {
              console.error('[AutoSave] Insert items error:', insertItemsError);
              throw insertItemsError;
            }
            console.log('[AutoSave] Inserted', itemsToInsert.length, 'items');
          }
        }
      } else {
        console.log('[AutoSave] Mode: INSERT (new order)');
        
        // INSERT new order
        const orderNumber = await generateOrderNumber();
        console.log('[AutoSave] Generated order number:', orderNumber);
        
        const { data: orderData, error: orderError } = await supabase
          .from("customer_orders")
           .insert({
            order_number: orderNumber,
            customer_company_id: currentFormData.customer_company_id,
            shipping_address_id: currentFormData.drop_ship_address_id ? null : currentFormData.shipping_address_id || null,
            drop_ship_address_id: currentFormData.drop_ship_address_id || null,
            tax_destination: shippingAddressesRef.current.find(a => a.id === currentFormData.shipping_address_id) as any || null,
            signature_option: currentFormData.signature_option,
            shipping_preference: currentFormData.shipping_preference,
            priority: currentFormData.priority,
            due_date: currentFormData.due_date || null,
            order_date: currentFormData.order_date || null,
            source: currentFormData.source,
            estimated_shipping: currentFormData.estimated_shipping,
            deposit_amount: currentFormData.deposit_amount,
            deposit_paid: currentFormData.deposit_paid,
            notes: currentFormData.notes || null,
            internal_notes: currentFormData.internal_notes || null,
            customer_po: currentFormData.customer_po || null,
            order_status: "pending",
            payment_status: "pending",
            created_by: currentUserId,
            packing_mode: currentPackingConfig?.mode || null,
            selected_box_id: currentPackingConfig?.packages?.[0]?.box?.id || null,
            package_weight_oz: currentPackingConfig?.packages?.[0]?.totalPackageWeightOz || null,
            package_length: currentPackingConfig?.packages?.[0]?.box?.dimension_l || null,
            package_width: currentPackingConfig?.packages?.[0]?.box?.dimension_w || null,
            package_height: currentPackingConfig?.packages?.[0]?.box?.dimension_h || null,
            num_packages: currentPackingConfig?.packages?.length || 1,
            packing_packages_json: buildPackingPayload(currentPackingConfig?.packages),
          })
           .select()
           .single();

        if (orderError) {
          console.error('[AutoSave] Insert order error:', orderError);
          throw orderError;
        }

        if (!orderData) {
          console.error('[AutoSave] Insert succeeded but no data returned');
          throw new Error('Insert succeeded but no data returned');
        }

        console.log('[AutoSave] Order created successfully:', orderNumber, 'ID:', orderData.id);

        if (currentOrderItems.length > 0) {
          const itemsToInsert = currentOrderItems
            .filter(item => item.item_sku)
            .map((item) => ({
              customer_order_id: orderData.id,
              item_type: item.item_type,
              inventory_item_id: item.inventory_item_id || null,
              assembly_id: item.assembly_id || null,
              labor_item_id: item.labor_item_id || null,
              is_taxable: item.item_type !== "labor" && item.is_taxable !== false,
              quantity_ordered: item.quantity_ordered,
              unit_price: item.unit_price,
              notes: item.notes || null,
              requested_serial: item.requested_serial || null,
              inventory_sales_uom_id: item.inventory_sales_uom_id || null,
              assembly_sales_uom_id: item.assembly_sales_uom_id || null,
              quantity_invoiced: item.quantity_invoiced || 0,
            }));

          if (itemsToInsert.length > 0) {
            const { error: insertItemsError } = await supabase.from("customer_order_items").insert(itemsToInsert);
            if (insertItemsError) {
              console.error('[AutoSave] Insert items error:', insertItemsError);
              throw insertItemsError;
            }
            console.log('[AutoSave] Inserted', itemsToInsert.length, 'items');
          }
        }

        setSavedOrderId(orderData.id);
        setSavedOrderNumber(orderNumber);
        savedOrderIdRef.current = orderData.id;
      }

      lastSavedDataRef.current = currentDataFingerprint;
      setSaveStatus('saved');
      console.log('[AutoSave] Save completed successfully');

      // Reset status after 2 seconds
      setTimeout(() => setSaveStatus('idle'), 2000);

    } catch (error: any) {
      console.error('[AutoSave] Error:', error);
      console.error('[AutoSave] Error details:', JSON.stringify(error, null, 2));
      saveErrorRef.current = error?.message || 'Unknown error';
      setSaveStatus('error');
      // Reset status after 3 seconds
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      isSavingRef.current = false;
    }
  }, []); // Empty dependency array - we read from refs instead

  // Debounced auto-save effect
  useEffect(() => {
    // Only auto-save if customer is selected
    if (!formData.customer_company_id) return;

    const timeoutId = setTimeout(() => {
      performAutoSave();
    }, 3000);

    return () => clearTimeout(timeoutId);
  }, [formData, orderItems, packingConfig, performAutoSave]);

  const addOrderItem = () => {
    setOrderItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        item_type: "inventory_item",
        item_name: "",
        item_sku: "",
        quantity_ordered: 1,
        quantity_invoiced: 0,
        unit_price: 0,
        uom_label: "ea",
      },
    ]);
  };

  const removeOrderItem = (id: string) => {
    setOrderItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Get available UOMs for an order item
  const getAvailableUomsForItem = (orderItem: OrderItem): SalesUom[] => {
    if (orderItem.item_type === "inventory_item" && orderItem.inventory_item_id) {
      return inventorySalesUoms[orderItem.inventory_item_id] || [];
    }
    if (orderItem.item_type === "assembly" && orderItem.assembly_id) {
      return assemblySalesUoms[orderItem.assembly_id] || [];
    }
    return [];
  };

  const updateOrderItem = (id: string, field: string, value: any) => {
    setOrderItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;

        const updated = { ...item };

        if (field === "selectedItemId") {
          const combinedItem = combinedItems.find((ci) => ci.id === value);
          if (combinedItem) {
            updated.is_taxable = combinedItem.type !== "labor" && combinedItem.is_taxable === true;
            updated.item_type = combinedItem.type;
            updated.item_name = combinedItem.name.replace(/ \((Inventory|Assembly|Labor)\)/, "");
            updated.item_sku = combinedItem.sku;
            updated.inventory_item_id = undefined;
            updated.assembly_id = undefined;
            updated.labor_item_id = undefined;
            updated.inventory_sales_uom_id = undefined;
            updated.assembly_sales_uom_id = undefined;
            updated.sales_uom_quantity = undefined;
            updated.serial_tracking_type = combinedItem.serial_tracking_type;
            updated.requested_serial = undefined; // Reset serial when item changes

            if (combinedItem.type === "inventory_item") {
              updated.inventory_item_id = combinedItem.id;
              // Check for default UOM
              const uoms = inventorySalesUoms[combinedItem.id] || [];
              const defaultUom = uoms.find((u) => u.is_default) || uoms[0];
              if (defaultUom) {
                updated.inventory_sales_uom_id = defaultUom.id;
                updated.unit_price = defaultUom.unit_price;
                updated.sales_uom_quantity = defaultUom.quantity;
                updated.uom_label = defaultUom.description || `${defaultUom.quantity}pc Lot`;
              } else {
                updated.unit_price = combinedItem.price;
                updated.uom_label = "ea";
              }
            } else if (combinedItem.type === "assembly") {
              updated.assembly_id = combinedItem.id;
              // Check for default UOM
              const uoms = assemblySalesUoms[combinedItem.id] || [];
              const defaultUom = uoms.find((u) => u.is_default) || uoms[0];
              if (defaultUom) {
                updated.assembly_sales_uom_id = defaultUom.id;
                updated.unit_price = defaultUom.unit_price;
                updated.sales_uom_quantity = defaultUom.quantity;
                updated.uom_label = defaultUom.description || `${defaultUom.quantity}pc Lot`;
              } else {
                updated.unit_price = combinedItem.price;
                updated.uom_label = "ea";
              }
            } else if (combinedItem.type === "labor") {
              updated.labor_item_id = combinedItem.id;
              updated.unit_price = combinedItem.price;
              updated.uom_label = "hr";
            }
          }
        } else if (field === "selectedUomId") {
          // Handle UOM selection change
          const uoms = getAvailableUomsForItem(item);
          const selectedUom = uoms.find((u) => u.id === value);
          if (selectedUom) {
            updated.unit_price = selectedUom.unit_price;
            updated.sales_uom_quantity = selectedUom.quantity;
            updated.uom_label = selectedUom.description || `${selectedUom.quantity}pc Lot`;
            if (item.item_type === "inventory_item") {
              updated.inventory_sales_uom_id = selectedUom.id;
              updated.assembly_sales_uom_id = undefined;
            } else if (item.item_type === "assembly") {
              updated.assembly_sales_uom_id = selectedUom.id;
              updated.inventory_sales_uom_id = undefined;
            }
          }
        } else {
          (updated as any)[field] = value;
        }

        return updated;
      }),
    );
  };

  const getSelectedItemId = (item: OrderItem) => {
    return item.inventory_item_id || item.assembly_id || item.labor_item_id;
  };

  // Helper function to get item sales description
  const getItemSalesDescription = (orderItem: OrderItem): string | null => {
    const foundItem = combinedItems.find((ci) => {
      if (orderItem.item_type === "inventory_item" && ci.type === "inventory_item") {
        return ci.id === orderItem.inventory_item_id;
      }
      if (orderItem.item_type === "assembly" && ci.type === "assembly") {
        return ci.id === orderItem.assembly_id;
      }
      if (orderItem.item_type === "labor" && ci.type === "labor") {
        return ci.id === orderItem.labor_item_id;
      }
      return false;
    });
    return foundItem?.sales_description || null;
  };

  // Number formatting helpers for comma separators
  const formatNumberWithCommas = (value: number): string => {
    return new Intl.NumberFormat("en-US").format(value);
  };

  const formatRateWithDecimals = (value: number): string => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const parseFormattedNumber = (value: string): number => {
    return parseFloat(value.replace(/,/g, "")) || 0;
  };

  const calculateSubtotal = () => {
    return orderItems.reduce((total, item) => total + item.quantity_ordered * item.unit_price, 0);
  };

  const taxQuote = calculateJurisdictionTax(taxModel, {
    customerIsTaxable: companies.find(c => c.id === formData.customer_company_id)?.is_taxable === true,
    distributor: companies.find(c => c.id === formData.customer_company_id)?.is_distributor,
    destination: selectedAddress,
    items: orderItems.map(item => ({ amount: item.quantity_ordered * item.unit_price, item_type: item.item_type,
      is_taxable: item.is_taxable !== false && combinedItems.find(i => i.id === (item.inventory_item_id || item.assembly_id || item.labor_item_id))?.is_taxable === true })),
    shipping: formData.estimated_shipping,
    shipments: companies.find(c => c.id === formData.customer_company_id)?.preferred_shipping_carrier === 'Pick-Up' ? 0 : 1,
  });
  const calculateTax = () => taxQuote.taxAmount;
  useEffect(() => {
    if (!selectedAddress?.state) return;
    let cancelled = false;
    setTaxLoading(true); setTaxError('');
    getTaxModel(selectedAddress.state, selectedAddress.zip).then(model => { if (!cancelled) setTaxModel(model); })
      .catch(e => { if (!cancelled) setTaxError(e.message); }).finally(() => { if (!cancelled) setTaxLoading(false); });
    return () => { cancelled = true; };
  }, [selectedAddress?.state, selectedAddress?.zip]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (taxLoading || taxError || taxQuote.reviewRequired) {
      toast({ title: "Tax review required", description: taxError || "Admin or Accounting must configure the destination tax rules before confirmation.", variant: "destructive" }); return;
    }

    if (!savedOrderId) {
      toast({ title: "Error", description: "Order not saved yet. Please wait and try again.", variant: "destructive" });
      return;
    }

    if (!formData.shipping_address_id && !formData.drop_ship_address_id) {
      toast({ title: "Error", description: "Please select a shipping address", variant: "destructive" });
      return;
    }

    if (formData.carrier_preference && !carrierAllowedForDropShip(formData.carrier_preference, dropShipAddress)) {
      toast({ title: "Error", description: "USPS cannot be used until this drop-ship address is flagged USPS eligible", variant: "destructive" });
      return;
    }

    if (orderItems.length === 0) {
      toast({ title: "Error", description: "Please add at least one item to the order", variant: "destructive" });
      return;
    }

    const invalidItem = orderItems.find((item) => !item.item_sku || item.quantity_ordered <= 0);
    if (invalidItem) {
      toast({
        title: "Error",
        description: "All items must have a valid product and quantity greater than 0",
        variant: "destructive",
      });
      return;
    }

    if (
      formData.signature_option === "indirect" &&
      formData.carrier_preference &&
      formData.carrier_preference !== "fedex"
    ) {
      toast({ title: "Error", description: "Indirect signature is only available with FedEx", variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      // Update existing order with shipping preferences
      const { error } = await supabase
        .from("customer_orders")
        .update({
          carrier_preference: formData.carrier_preference || null,
          shipping_method_preference: formData.shipping_method_preference || null,
          customer_company_id: formData.customer_company_id,
          shipping_address_id: formData.drop_ship_address_id ? null : formData.shipping_address_id,
          drop_ship_address_id: formData.drop_ship_address_id || null,
          signature_option: formData.signature_option,
          shipping_preference: formData.shipping_preference,
          priority: formData.priority,
          due_date: formData.due_date || null,
          order_date: formData.order_date || null,
          source: formData.source,
          estimated_shipping: formData.estimated_shipping,
          deposit_amount: formData.deposit_amount,
          deposit_paid: formData.deposit_paid,
          notes: formData.notes || null,
          internal_notes: formData.internal_notes || null,
          customer_po: formData.customer_po || null,
          tax_destination: selectedAddress as any,
          packing_mode: packingConfig?.mode || null,
          selected_box_id: packingConfig?.packages?.[0]?.box?.id || null,
          package_weight_oz: packingConfig?.packages?.[0]?.totalPackageWeightOz || null,
          package_length: packingConfig?.packages?.[0]?.box?.dimension_l || null,
          package_width: packingConfig?.packages?.[0]?.box?.dimension_w || null,
          package_height: packingConfig?.packages?.[0]?.box?.dimension_h || null,
          num_packages: packingConfig?.packages?.length || 1,
          packing_packages_json: buildPackingPayload(packingConfig?.packages),
          stripe_payment_method_id: selectedPaymentMethodId || null,
          is_one_time_card: selectedPaymentType === 'manual_entry',
        })
        .eq("id", savedOrderId);

      if (error) throw error;

      // Update items
      await supabase.from("customer_order_items").delete().eq("customer_order_id", savedOrderId);

      const orderItemsToInsert = orderItems.map((item) => ({
        customer_order_id: savedOrderId,
        item_type: item.item_type,
        inventory_item_id: item.inventory_item_id || null,
        assembly_id: item.assembly_id || null,
        labor_item_id: item.labor_item_id || null,
        quantity_ordered: item.quantity_ordered,
        is_taxable: item.item_type !== "labor" && item.is_taxable !== false,
        unit_price: item.unit_price,
        notes: item.notes || null,
        requested_serial: item.requested_serial || null,
        inventory_sales_uom_id: item.inventory_sales_uom_id || null,
        assembly_sales_uom_id: item.assembly_sales_uom_id || null,
        quantity_invoiced: item.quantity_invoiced || 0,
      }));

      const { error: itemsError } = await supabase.from("customer_order_items").insert(orderItemsToInsert);
      if (itemsError) throw itemsError;

      // Payment link flow: suppress order toast, send link, block on failure
      if (selectedPaymentType === 'link') {
        let linkSuccess = false;
        try {
          const subtotal = calculateSubtotal();
          const tax = calculateTax();
          const shipping = formData.estimated_shipping || 0;
          const total = subtotal + tax + shipping;

          const { data: linkData, error: linkError } = await supabase.functions.invoke('send-payment-link', {
            body: {
              order_id: savedOrderId,
              order_number: savedOrderNumber,
              customer_email: selectedCompany?.email || null,
              customer_phone: selectedCompany?.phone || null,
              customer_name: selectedCompany?.name || '',
              amount: total,
            },
          });

          if (linkError) throw linkError;
          if (linkData?.success) {
            linkSuccess = true;
            setEmailSent(true);
            toast({ title: "Payment Link Sent", description: `Payment link emailed to ${selectedCompany?.email || selectedCompany?.phone}` });
          } else {
            toast({ title: "Payment Link Failed", description: linkData?.error || "Failed to send payment link.", variant: "destructive" });
          }
        } catch (linkErr: any) {
          toast({ title: "Payment Link Failed", description: linkErr.message || "Failed to send payment link.", variant: "destructive" });
        }

        if (linkSuccess) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          setStep("confirmation");
        }
        // If failed, stay on current step — user can retry
      } else {
        toast({ title: "Success", description: `Customer order ${savedOrderNumber} updated successfully` });
        setStep("confirmation");
      }
    } catch (error: any) {
      console.error("Error updating customer order:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update customer order",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Reset form helper
  const resetForm = () => {
    setFormData({
      customer_company_id: "",
      shipping_address_id: "",
      drop_ship_address_id: "",
      carrier_preference: "",
      shipping_method_preference: "",
      signature_option: "indirect",
      shipping_preference: "ship_complete",
      priority: "normal",
      due_date: "",
      order_date: format(new Date(), "yyyy-MM-dd"),
      source: "phone",
      estimated_shipping: 0,
      deposit_amount: 0,
      deposit_paid: false,
      notes: "",
      internal_notes: "",
      customer_po: "",
    });
    setOrderItems([]);
    setPackingConfig(null);
    setShippingAddresses([]);
    setSelectedAddress(null);
    setDropShipAddress(null);
    setBillingAddress(null);
    setShowAddAddressForm(false);
    setEditingAddress(null);
    setShowEditBillingForm(false);
    setAvailableShippingOptions([]);
    setShippingOptionsLoaded(false);
    setSavedOrderId(null);
    setSavedOrderNumber(null);
    setSaveStatus('idle');
    setEmailSending(false);
    setEmailSent(false);
    setEmailPreviewHtml(null);
    setEmailPreviewLoading(false);
    lastSavedDataRef.current = null;
    orderItemsLoadedRef.current = false;
    prevAddressIdRef.current = null;
    setStep("customer_order");
    setHasVisitedPacking(false);
    resetPaymentStatus();
    setSelectedPaymentMethodId(null);
    setSelectedPaymentType(null);
    setSelectedCardBrand(null);
    setSelectedCardLast4(null);
  };

  const selectedCompany = companies.find((c) => c.id === formData.customer_company_id);
  const canProceedToShipping = !!selectedAddress && orderItems.length > 0;
  const canSubmit = shippingOptionsLoaded && !!formData.shipping_method_preference;

  // Save status indicator component
  const SaveStatusIndicator = () => {
    if (saveStatus === 'idle' && !savedOrderNumber) return null;

    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {saveStatus === 'saving' && (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Saving...</span>
          </>
        )}
        {saveStatus === 'saved' && (
          <>
            <Check className="h-3 w-3 text-green-600" />
            <span className="text-green-600">Saved</span>
          </>
        )}
        {saveStatus === 'error' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-destructive cursor-help underline decoration-dotted">
                Save failed
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p className="text-xs">
                {saveErrorRef.current || 'Unknown error'}. Check browser console for details.
              </p>
            </TooltipContent>
          </Tooltip>
        )}
        {saveStatus === 'idle' && savedOrderNumber && (
          <span className="text-muted-foreground">Auto-saved</span>
        )}
      </div>
    );
  };

  // Step indicator component - now 4 steps
  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-2 py-3 border-b bg-muted/30">
      <div
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
          step === "customer_order" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        <Package className="h-4 w-4" />
        <span>1. Order</span>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
      <div
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
          step === "packing" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        <Boxes className="h-4 w-4" />
        <span>2. Packing</span>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
      <div
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
          step === "shipping" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        <Truck className="h-4 w-4" />
        <span>3. Shipping</span>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
      <div
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
          step === "payment" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        <CreditCard className="h-4 w-4" />
        <span>4. Payment</span>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
      <div
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
          step === "confirmation" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        <CheckCircle2 className="h-4 w-4" />
        <span>5. Confirm</span>
      </div>
    </div>
  );

  // Combined Step 1: Customer & Order - QuickBooks Invoice Style
  const renderCustomerOrderStep = () => (
    <div className="space-y-4">
      {/* Invoice Header */}
      <div className="flex items-start justify-between pb-4 border-b">
        <div>
          <h2 className="text-xl font-bold text-foreground">WashGear</h2>
          <p className="text-sm text-muted-foreground">Customer Order</p>
        </div>
        <div className="text-right flex flex-col items-end gap-1">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">ORDER</p>
            <p className="font-mono text-sm text-muted-foreground">
              {savedOrderNumber || "(Auto-saved on edit)"}
            </p>
          </div>
          <SaveStatusIndicator />
        </div>
      </div>

      {/* Customer Selection + Order Details Row - All on same line */}
      <div className="flex gap-4 flex-wrap py-3 border-b items-end">
        {/* Customer - fills remaining space */}
        <div className="flex-1 min-w-[200px] space-y-1">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customer</Label>
          <Popover modal open={customerOpen} onOpenChange={setCustomerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={customerOpen}
                className="h-9 w-full justify-between font-normal"
              >
                {selectedCompany?.name || "Select a customer..."}
                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Search by name, customer #, or owner..."
                  value={customerSearch}
                  onValueChange={setCustomerSearch}
                />
                <CommandList className="max-h-[300px]">
                  <CommandEmpty>No customer found.</CommandEmpty>
                  <CommandGroup>
                    {filteredCompanies.map((company) => (
                      <CommandItem
                        key={company.id}
                        value={company.id}
                        onSelect={() => {
                          handleCustomerChange(company.id);
                          setCustomerOpen(false);
                          setCustomerSearch("");
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            formData.customer_company_id === company.id ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <div className="flex flex-col">
                          <span>{company.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {company.customer_number && `#${company.customer_number}`}
                            {company.customer_number && company.owners_name && " • "}
                            {company.owners_name}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* PO# - fixed narrow width */}
        <div className="w-[120px] space-y-1">
          <Label className="text-xs text-muted-foreground">PO#</Label>
          <Input
            type="text"
            className="h-9 text-sm"
            placeholder="Optional"
            value={formData.customer_po}
            onChange={(e) => setFormData((prev) => ({ ...prev, customer_po: e.target.value }))}
          />
        </div>

        {/* Order Date - compact fixed width */}
        <div className="w-[150px] space-y-1">
          <Label className="text-xs text-muted-foreground">Order Date</Label>
          <Input
            type="date"
            className="h-9 text-sm"
            value={formData.order_date}
            onChange={(e) => setFormData((prev) => ({ ...prev, order_date: e.target.value }))}
          />
        </div>

        {/* Due Date - compact fixed width */}
        <div className="w-[150px] space-y-1">
          <Label className="text-xs text-muted-foreground">Due Date</Label>
          <Input
            type="date"
            className="h-9 text-sm"
            value={formData.due_date}
            onChange={(e) => setFormData((prev) => ({ ...prev, due_date: e.target.value }))}
          />
        </div>
      </div>

      {/* Payment Status Alert - shows after customer is selected */}
      {formData.customer_company_id && (
        <PaymentStatusAlert
          status={paymentStatus}
          validCardCount={validCardCount}
          soonestExpiringCard={soonestExpiringCard}
          daysUntilExpiry={daysUntilExpiry}
          onManageCards={() => setShowManageCardsModal(true)}
          onLinkStripe={() => setShowStripeCustomerModal(true)}
        />
      )}

      {/* Bill To / Ship To Grid - Addresses aligned */}
      <div className="grid grid-cols-2 gap-6 py-4 border-b">
        {/* BILL TO Column */}
        <div className="space-y-3">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bill To</Label>

          {/* Billing Address Display */}
          {formData.customer_company_id ? (
            <div className="space-y-2">
              {showEditBillingForm ? (
                <div className="p-3 border rounded-md bg-muted/30">
                  <form onSubmit={handleUpdateBillingAddress} className="space-y-2">
                    <Input
                      value={billingFormData.street}
                      onChange={(e) => setBillingFormData((prev) => ({ ...prev, street: e.target.value }))}
                      placeholder="Street Address"
                      className="h-8 text-sm"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <Input
                        value={billingFormData.city}
                        onChange={(e) => setBillingFormData((prev) => ({ ...prev, city: e.target.value }))}
                        placeholder="City"
                        className="h-8 text-sm"
                      />
                      <Select
                        value={billingFormData.state}
                        onValueChange={(value) => setBillingFormData((prev) => ({ ...prev, state: value }))}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="State" />
                        </SelectTrigger>
                        <SelectContent>
                          {US_STATES.map((state) => (
                            <SelectItem key={state.value} value={state.value}>
                              {state.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={billingFormData.zip}
                        onChange={(e) => setBillingFormData((prev) => ({ ...prev, zip: e.target.value }))}
                        placeholder="ZIP"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowEditBillingForm(false)}
                        disabled={savingBilling}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" size="sm" disabled={savingBilling}>
                        {savingBilling ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                      </Button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="p-3 border rounded-md bg-muted/30 group relative min-h-[25px]">
                  {billingAddress ? (
                    <>
                      <p className="text-sm font-semibold">{selectedCompany?.name}</p>
                      <p className="text-sm text-foreground">{billingAddress.street}</p>
                      <p className="text-sm text-foreground">
                        {billingAddress.city}, {billingAddress.state} {billingAddress.zip}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No billing address</p>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setShowEditBillingForm(true)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">Select a customer first</p>
          )}
        </div>

        {/* SHIP TO Column */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ship To</Label>
            {formData.customer_company_id && !showAddAddressForm && !editingAddress && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setShowAddAddressForm(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add New
              </Button>
            )}
          </div>

          {!formData.customer_company_id && (
            <p className="text-sm text-muted-foreground italic">Select a customer first</p>
          )}

          {formData.customer_company_id && showAddAddressForm && (
            <AddAddressForm
              onSave={handleSaveNewAddress}
              onCancel={() => setShowAddAddressForm(false)}
              defaultSignatureRequired={selectedCompany?.signature_required}
            />
          )}

          {formData.customer_company_id && editingAddress && (
            <EditAddressForm
              address={{
                id: editingAddress.id,
                name: editingAddress.name || "",
                address: editingAddress.address,
                city: editingAddress.city,
                state: editingAddress.state,
                zip: editingAddress.zip,
                country: editingAddress.country || "US",
                signature_required: editingAddress.signature_required || false,
              }}
              isDefault={editingAddress.id === selectedCompany?.default_shipping_address_id}
              canDelete={shippingAddresses.length > 1}
              onSave={handleUpdateAddress}
              onDelete={handleDeleteAddress}
              onCancel={() => setEditingAddress(null)}
            />
          )}

          {formData.customer_company_id && !showAddAddressForm && !editingAddress && (
            <>
              {shippingAddresses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No shipping addresses configured.</p>
              ) : (
                <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                  {shippingAddresses.map((address) => {
                    const isDefault = address.id === selectedCompany?.default_shipping_address_id;
                    const isSelected = selectedAddress?.id === address.id;

                    return (
                      <div
                        key={address.id}
                        className={cn(
                          "p-2 border rounded-md cursor-pointer transition-colors group relative min-h-[88px]",
                          isSelected ? "border-primary bg-primary/5" : "hover:border-muted-foreground",
                        )}
                        onClick={() => handleAddressSelect(address)}
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          {address.name && <span className="text-sm font-semibold">{address.name}</span>}
                          {isDefault && (
                            <Badge variant="secondary" className="text-[10px] px-1 py-0">
                              Default
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-foreground">{address.address}</p>
                        <p className="text-sm text-foreground">
                          {address.city}, {address.state} {address.zip}
                        </p>
                        <div className="absolute top-1 right-1 flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingAddress(address);
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          {isSelected && <Check className="h-4 w-4 text-primary" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {formData.customer_company_id && selectedCompany?.is_distributor && !showAddAddressForm && !editingAddress && (
            <div className="pt-2 border-t space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Or drop-ship to</Label>
              <DropShipAddressPanel
                ownerCompanyId={formData.customer_company_id}
                selectedId={formData.drop_ship_address_id || null}
                onSelect={handleDropShipSelect}
              />
            </div>
          )}
        </div>
      </div>

      {/* Shipping Options Row */}
      <div className="grid grid-cols-2 gap-4 py-3 border-y">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Signature Requirement</Label>
          <Select
            value={formData.signature_option}
            onValueChange={(value) => setFormData((prev) => ({ ...prev, signature_option: value }))}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50">
              <SelectItem value="none">No Signature Required</SelectItem>
              <SelectItem value="indirect">Indirect Signature (FedEx only)</SelectItem>
              <SelectItem value="direct">Direct Signature Required</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Shipping Preference</Label>
          <RadioGroup
            value={formData.shipping_preference}
            onValueChange={(value) => setFormData((prev) => ({ ...prev, shipping_preference: value }))}
            className="flex gap-4 h-9 items-center"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="ship_complete" id="ship_complete_order" />
              <Label htmlFor="ship_complete_order" className="font-normal cursor-pointer text-sm">
                Ship Complete
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="ship_as_available" id="ship_as_available_order" />
              <Label htmlFor="ship_as_available_order" className="font-normal cursor-pointer text-sm">
                Ship As Available
              </Label>
            </div>
          </RadioGroup>
        </div>
      </div>

      {/* Line Items Table */}
      {/* Shared grid template: both header and rows MUST use identical text-sm base so ch units compute to the same pixel widths */}
      <div className="overflow-x-auto">
        {/* Table Header - text-sm on container for consistent ch sizing; styling on cells */}
        <div className="grid grid-cols-[minmax(14ch,18ch)_40ch_9ch_8ch_10ch_3rem_11ch_32px] gap-1 py-1 border-b text-sm min-w-[700px]">
          <div className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">SKU</div>
          <div className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</div>
          <div className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">LOT</div>
          <div className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Qty</div>
          <div className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rate</div>
          <div></div>
          <div className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</div>
          <div></div>
        </div>

        {/* Line Item Rows - text-sm to match header grid for ch consistency */}
        {orderItems.map((item) => (
          <div key={item.id} className="contents">
            <div
              className="grid grid-cols-[minmax(14ch,18ch)_40ch_9ch_8ch_10ch_3rem_11ch_32px] gap-1 py-1 border-b items-center text-sm min-w-[700px]"
            >
              {/* SKU */}
              <div>
                <Popover
                  modal
                  open={itemOpenStates[item.id] || false}
                  onOpenChange={(open) => setItemOpenStates((prev) => ({ ...prev, [item.id]: open }))}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="h-8 w-full justify-between font-normal text-sm font-mono"
                    >
                      <span className="truncate">{item.item_sku || "SKU..."}</span>
                      <ChevronDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[350px] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search by SKU or description..."
                        value={itemSearches[item.id] || ""}
                        onValueChange={(value) => setItemSearches((prev) => ({ ...prev, [item.id]: value }))}
                      />
                      <CommandList className="max-h-[250px]">
                        <CommandEmpty>No product found.</CommandEmpty>
                        <CommandGroup>
                          {getFilteredItems(item.id).map((ci) => (
                            <CommandItem
                              key={ci.id}
                              value={ci.id}
                              onSelect={() => {
                                updateOrderItem(item.id, "selectedItemId", ci.id);
                                setItemOpenStates((prev) => ({ ...prev, [item.id]: false }));
                                setItemSearches((prev) => ({ ...prev, [item.id]: "" }));
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4 flex-shrink-0",
                                  getSelectedItemId(item) === ci.id ? "opacity-100" : "opacity-0",
                                )}
                              />
                              <div className="flex flex-col min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{ci.sku}</span>
                                  {ci.type !== "labor" && (
                                    <span className={cn(
                                      "text-xs px-1.5 py-0.5 rounded",
                                      (ci.quantity_ats ?? 0) > 0 
                                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" 
                                        : "bg-destructive/15 text-destructive"
                                    )}>
                                      {ci.quantity_ats ?? 0} Available
                                    </span>
                                  )}
                                </div>
                                {ci.sales_description && (
                                  <span className="text-xs text-muted-foreground truncate">{ci.sales_description}</span>
                                )}
                              </div>
                              <Badge variant="secondary" className="ml-auto text-xs">
                                {ci.type === "inventory_item" ? "Inv" : ci.type === "assembly" ? "Asm" : "Labor"}
                              </Badge>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Description */}
              <div>
                <span className="text-sm text-muted-foreground break-words">
                  {item.notes || getItemSalesDescription(item) || "—"}
                </span>
              </div>

              {/* UOM */}
              <div className="flex justify-center">
                {(() => {
                  const availableUoms = getAvailableUomsForItem(item);
                  const currentUomId = item.inventory_sales_uom_id || item.assembly_sales_uom_id;

                  // Labor items always show 'hr', non-selectable
                  if (item.item_type === "labor") {
                    return <span className="w-[9ch] px-2 text-center text-sm text-muted-foreground">hr</span>;
                  }

                  // If no UOMs available, show nothing
                  if (availableUoms.length === 0) {
                    return null;
                  }

                  // Show dropdown for items with available UOMs
                  return (
                    <Select
                      value={currentUomId || ""}
                      onValueChange={(value) => updateOrderItem(item.id, "selectedUomId", value)}
                    >
                      <SelectTrigger className="h-8 w-[9ch] px-2 text-sm relative focus:ring-0 focus:ring-offset-0 focus:border-primary focus:border-2">
                        <span className="w-full text-center truncate">
                          {item.uom_label || "Lot"}
                        </span>
                      </SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        {availableUoms.map((uom) => (
                          <SelectItem key={uom.id} value={uom.id}>
                            {uom.description || `${uom.quantity}pc Lot`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                })()}
              </div>

              {/* Quantity */}
              <div className="flex justify-center">
                <Input
                  type="text"
                  className="h-8 w-[8ch] px-1 py-0 text-center text-sm font-mono tabular-nums focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary focus-visible:border-2"
                  value={formatNumberWithCommas(item.quantity_ordered)}
                  onChange={(e) => updateOrderItem(item.id, "quantity_ordered", parseFormattedNumber(e.target.value))}
                />
              </div>

              {/* Rate */}
              <div className="flex justify-center">
                <FinancialGuard kind="revenue"><RateInput
                  value={item.unit_price}
                  onChange={(value) => updateOrderItem(item.id, "unit_price", value)}
                  className="h-8 w-[10ch] px-1 py-0 text-center text-sm font-mono tabular-nums focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary focus-visible:border-2"
                /></FinancialGuard>
              </div>

              {/* Line taxability */}
              <div className="flex justify-center"><Checkbox aria-label={`Taxable line ${item.item_sku || item.id}`} disabled={item.item_type === 'labor'} checked={item.item_type !== 'labor' && item.is_taxable !== false} onCheckedChange={checked => updateOrderItem(item.id, 'is_taxable', checked === true)}/></div>

              {/* Amount */}
              <div className="flex items-center justify-center whitespace-nowrap">
                <span className="w-[11ch] text-sm font-medium text-center font-mono tabular-nums">
                  <FinancialGuard kind="revenue">{formatCurrency(item.quantity_ordered * item.unit_price)}</FinancialGuard>
                </span>
              </div>

              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeOrderItem(item.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {/* Serial Number Input - Shows for manual serial items */}
            {item.serial_tracking_type === "manual" && (
              <div className="flex items-center gap-2 py-1 px-2 bg-muted/30 border-b text-sm">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Serial #:</Label>
                <Input
                  type="text"
                  placeholder="Enter serial number (e.g., key bitting, lock serial)"
                  value={item.requested_serial || ""}
                  onChange={(e) => updateOrderItem(item.id, "requested_serial", e.target.value)}
                  className="h-7 max-w-xs text-sm font-mono"
                />
                <span className="text-xs text-muted-foreground">Required for this item</span>
              </div>
            )}
          </div>
        ))}

        {/* Add Line Button */}
        <Button type="button" variant="ghost" size="sm" onClick={addOrderItem} className="mt-1">
          <Plus className="h-4 w-4 mr-1" />
          Add Line
        </Button>
      </div>

      {/* Totals Section */}
      <div className="flex justify-end pt-2">
        <div className="w-64 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span><FinancialGuard kind="revenue">{formatCurrency(calculateSubtotal())}</FinancialGuard></span>
          </div>
          <TaxLines lines={taxQuote.taxLines} reviewRequired={taxQuote.reviewRequired || !!taxError} />
          <Separator />
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span><FinancialGuard kind="revenue">{formatCurrency(calculateSubtotal() + calculateTax())}</FinancialGuard></span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-end pt-4">
        <Button type="button" disabled={!canProceedToShipping} onClick={() => { setHasVisitedPacking(true); setStep("packing"); }}>
          Continue to Packing
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );

  // Step 2: Packing
  const canProceedToShipping_fromPacking = packingConfig !== null && (
    packingConfig.mode === "auto" || (packingConfig.mode === "manual" && !!packingConfig.manualBoxId && packingConfig.manualWeightOz! > 0)
  );

  // --- Order Details Card (shown on Packing & Shipping steps) ---
  const formatPhone = (phone: string | null | undefined) => {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
    if (digits.length === 11 && digits[0] === '1') return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
    return phone;
  };

  const OrderSummaryCard = ({ showShipping, defaultCollapsed = false }: { showShipping: boolean; defaultCollapsed?: boolean }) => {
    const subtotal = calculateSubtotal();
    const tax = calculateTax();
    const shipping = formData.estimated_shipping ?? null;
    const shippingKnown = showShipping && shipping !== null && shipping > 0;
    const total = subtotal + tax + (shippingKnown ? shipping! : 0);

    return (
      <Card className="text-sm">
        <CardContent className="py-3 px-4 space-y-3">
          <Collapsible defaultOpen={!defaultCollapsed}>
            {/* Header — always visible */}
            <CollapsibleTrigger className="flex items-center justify-between w-full group cursor-pointer">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs font-semibold">
                  {savedOrderNumber ? `#${savedOrderNumber}` : "New Order"}
                </Badge>
                {formData.customer_po && (
                  <Badge variant="secondary" className="text-xs">
                    PO# {formData.customer_po}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold"><FinancialGuard kind="revenue">{formatCurrency(total)}</FinancialGuard></span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </div>
            </CollapsibleTrigger>

            <CollapsibleContent className="space-y-3 mt-3">
              <Separator />

              {/* Customer & Ship To */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Customer</p>
                  {selectedCompany && (
                    <>
                      <p className="font-medium">{selectedCompany.name}</p>
                      {selectedCompany.email && <p className="text-muted-foreground">{selectedCompany.email}</p>}
                      {selectedCompany.phone && <p className="text-muted-foreground">{formatPhone(selectedCompany.phone)}</p>}
                    </>
                  )}
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ship To</p>
                  {selectedAddress && (
                    <>
                      {selectedAddress.name && <p className="font-medium">{selectedAddress.name}</p>}
                      {selectedAddress.address && <p className="text-muted-foreground">{selectedAddress.address}</p>}
                      <p className="text-muted-foreground">
                        {[selectedAddress.city, selectedAddress.state].filter(Boolean).join(', ')}{selectedAddress.zip ? ` ${selectedAddress.zip}` : ''}
                      </p>
                    </>
                  )}
                </div>
              </div>

              <Separator />

              {/* Line Items */}
              <Collapsible defaultOpen={true}>
                <CollapsibleTrigger className="flex items-center justify-between w-full group cursor-pointer">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Line Items</p>
                    <Badge variant="secondary" className="text-xs">{orderItems.length}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground group-data-[state=closed]:inline hidden">
                      <FinancialGuard kind="revenue">{formatCurrency(subtotal)}</FinancialGuard>
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-1">
                  {(() => {
                    const hasPartialFulfillment = orderItems.some(i => i.quantity_invoiced > 0) && orderItems.some(i => i.quantity_ordered - i.quantity_invoiced > 0);
                    const gridCols = hasPartialFulfillment ? 'grid-cols-[18ch_1fr_4ch_5ch_6ch_10ch]' : 'grid-cols-[18ch_1fr_7ch_9ch_10ch]';
                    return (
                      <>
                        <div className={`grid ${gridCols} gap-x-2 px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide`}>
                          <span>SKU</span>
                          <span>Description</span>
                          <span className="text-center">Qty</span>
                          {hasPartialFulfillment && <span className="text-center">Open</span>}
                          <span className="text-center">Rate</span>
                          <span className="text-right">Amount</span>
                        </div>
                        {orderItems.map((item, idx) => {
                          const unfulfilled = item.quantity_ordered - item.quantity_invoiced;
                          return (
                            <div key={idx} className={`grid ${gridCols} gap-x-2 py-1 px-2 rounded text-sm ${idx % 2 === 0 ? 'bg-blue-50' : ''}`}>
                              <span className="truncate text-muted-foreground">{item.item_sku || '—'}</span>
                              <span className="truncate">{item.item_name}</span>
                              <span className="text-right">{item.quantity_ordered}</span>
                              {hasPartialFulfillment && (
                                <span className={`text-right font-medium ${unfulfilled > 0 && unfulfilled < item.quantity_ordered ? 'text-orange-500' : unfulfilled === 0 ? 'text-green-600' : ''}`}>
                                  {unfulfilled > 0 ? unfulfilled : '✓'}
                                </span>
                              )}
                              <span className="text-right text-muted-foreground"><FinancialGuard kind="revenue">{formatCurrency(item.unit_price)}</FinancialGuard></span>
                              <span className="text-right font-medium"><FinancialGuard kind="revenue">{formatCurrency(item.unit_price * item.quantity_ordered)}</FinancialGuard></span>
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                </CollapsibleContent>
              </Collapsible>

              <Separator />

              {/* Totals */}
              <div className="space-y-1">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-medium text-foreground"><FinancialGuard kind="revenue">{formatCurrency(subtotal)}</FinancialGuard></span>
                </div>
                <TaxLines lines={taxQuote.taxLines} reviewRequired={taxQuote.reviewRequired || !!taxError} />
                <div className="flex justify-between text-muted-foreground">
                  <span>Shipping</span>
                  <span className="font-medium text-foreground">
                    <FinancialGuard kind="revenue">{showShipping ? (shippingKnown ? formatCurrency(shipping!) : "Select a rate") : "—"}</FinancialGuard>
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span><FinancialGuard kind="revenue">{formatCurrency(total)}</FinancialGuard></span>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
    );
  };

  const renderPackingStep = () => (
    <div className="space-y-4">
      <OrderSummaryCard showShipping={formData.estimated_shipping > 0} />
      <PackingStepContent
        orderItems={orderItems}
        onPackingComplete={setPackingConfig}
        initialPackingConfig={packingConfig}
      />

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button type="button" variant="outline" onClick={() => setStep("customer_order")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Order
        </Button>
        <Button type="button" disabled={!canProceedToShipping_fromPacking} onClick={() => setStep("shipping")}>
          Continue to Shipping
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );

  // Step 2: Shipping Options (wraps form for submission)
  const renderShippingStep = () => (
    <form id="customer-order-form" onSubmit={handleSubmit} className="space-y-4">
      <OrderSummaryCard showShipping={true} defaultCollapsed={true} />
      {/* Header with Refresh button */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Truck className="h-5 w-5" />
          Shipping Options
        </h3>
        {shippingOptionsLoaded && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadShippingOptions}
            disabled={loadingShippingOptions}
          >
            {loadingShippingOptions ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </>
            )}
          </Button>
        )}
      </div>

      {/* Shipping to address summary */}
      {selectedAddress && (
        <Card className="bg-muted/30">
          <CardContent className="p-3">
            <p className="text-sm font-medium">Shipping to:</p>
            <p className="text-sm">{selectedAddress.address}</p>
            <p className="text-sm text-muted-foreground">
              {selectedAddress.city}, {selectedAddress.state} {selectedAddress.zip}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {loadingShippingOptions && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Fetching rates from all carriers...</span>
        </div>
      )}

      {/* Empty state - shown briefly while auto-loading */}
      {!shippingOptionsLoaded && !loadingShippingOptions && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Package className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">Preparing to load shipping options...</p>
          </CardContent>
        </Card>
      )}

      {/* Shipping options loaded */}
      {shippingOptionsLoaded && !loadingShippingOptions && (
        <div className="space-y-3">
          {/* Sort controls */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground w-16 flex-shrink-0">Sort by:</span>
            <ToggleGroup type="single" value={sortBy} onValueChange={(v) => v && setSortBy(v as SortOption)}>
              <ToggleGroupItem value="value" size="sm" className="text-xs">
                <Star className="h-3 w-3 mr-1" />
                Value
              </ToggleGroupItem>
              <ToggleGroupItem value="speed" size="sm" className="text-xs">
                <Zap className="h-3 w-3 mr-1" />
                Speed
              </ToggleGroupItem>
              <ToggleGroupItem value="carrier" size="sm" className="text-xs">
                <Truck className="h-3 w-3 mr-1" />
                Carrier
              </ToggleGroupItem>
              <ToggleGroupItem value="price" size="sm" className="text-xs">
                <DollarSign className="h-3 w-3 mr-1" />
                Price
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <CarrierRateErrors statuses={carrierStatuses} />

          {/* Carrier filter badges */}
          {(() => {
            const carriers = ["fedex", "ups", "usps"] as const;
            const availableCarriers = carriers.filter((c) => carrierAllowedForDropShip(c, dropShipAddress) && availableShippingOptions.some((o) => o.carrier === c));
            if (availableCarriers.length <= 1) return null;

            return (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground w-16 flex-shrink-0">Show:</span>
                <div className="flex gap-6">
                  {availableCarriers.map((carrier) => {
                    const isActive = carrierFilters.has(carrier);
                    const status = carrierStatuses[carrier];

                    return (
                      <button
                        key={carrier}
                        type="button"
                        onClick={() => toggleCarrierFilter(carrier)}
                        className={cn(
                          "relative rounded transition-all w-12 flex items-center justify-center",
                          isActive ? "opacity-100" : "opacity-40 grayscale",
                        )}
                      >
                        <img
                          src={CARRIER_BADGES[carrier]}
                          alt={carrier.toUpperCase()}
                          className="h-6 w-auto object-contain"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Shipping options list */}
          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {sortedOptions.map((option) => {
              const isSelected =
                formData.carrier_preference === option.carrier &&
                formData.shipping_method_preference === option.service_type;
              const serviceLogo = SERVICE_LOGOS[option.service_type] || CARRIER_LOGOS[option.carrier];
              const deliveryDisplay = option.estimated_delivery
                ? `Delivers: ${formatDeliveryDate(option.estimated_delivery)}`
                : option.delivery_time_display ||
                  `${option.transit_days} business day${option.transit_days !== 1 ? "s" : ""}`;

              return (
                <Card
                  key={`${option.carrier}-${option.service_type}`}
                  className={cn(
                    "cursor-pointer transition-all",
                    isSelected ? "border-primary ring-2 ring-primary/20 bg-primary/5" : "hover:border-muted-foreground",
                  )}
                  onClick={() => handleShippingOptionSelect(option)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img src={serviceLogo} alt={option.carrier} className="h-6 w-auto object-contain" />
                        <div>
                          <p className="font-medium text-sm">{option.service_name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>{deliveryDisplay}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Pricing display */}
                        <div className="text-right mr-1">
                          <FinancialGuard kind="revenue"><p className="font-semibold text-sm">${option.total_charge?.toFixed(2) ?? '—'}</p></FinancialGuard>
                          {option.marginal_cost_per_hour === undefined && option.cost_per_value_hour != null && option.cost_per_value_hour > 0 && (
                            <FinancialGuard kind="revenue"><p className="text-xs text-muted-foreground">${option.cost_per_value_hour.toFixed(2)}/hr</p></FinancialGuard>
                          )}
                          {option.marginal_cost_per_hour !== undefined && (
                            <p className={`text-xs ${
                              option.hours_saved != null && option.hours_saved <= 0 && option.price_diff != null && option.price_diff > 0
                                ? 'text-red-600 dark:text-red-400'
                                : option.marginal_cost_per_hour <= 0
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-amber-600 dark:text-amber-400'
                            }`}>
                              <FinancialGuard kind="supplier_price">{`Arrives ${Math.round(option.hours_saved ?? 0)} business hrs faster at additional cost of ${
                                (option.hours_saved ?? 0) > 0
                                  ? (option.marginal_cost_per_hour <= 0
                                      ? `-$${Math.abs(option.marginal_cost_per_hour).toFixed(2)}`
                                      : `$${option.marginal_cost_per_hour.toFixed(2)}`)
                                  : (option.price_diff != null && option.price_diff < 0
                                      ? `-$${Math.abs(option.price_diff).toFixed(2)}`
                                      : `$${Math.abs(option.price_diff ?? 0).toFixed(2)}`)
                              }/hr`}</FinancialGuard>
                            </p>
                          )}
                        </div>
                        {isSelected && <Check className="h-5 w-5 text-primary" />}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button type="button" variant="outline" onClick={() => setStep("packing")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Packing
        </Button>
        <Button type="button" disabled={!canSubmit} onClick={() => setStep("payment")}>
          Continue to Payment
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </form>
  );

  // Step 4: Payment Method Selection
  const renderPaymentStep = () => {
    const subtotal = calculateSubtotal();
    const shippingCost = formData.estimated_shipping || 0;
    const canCreateOrder =
      selectedPaymentType === 'terms' ||
      selectedPaymentType === 'invoice' ||
      selectedPaymentType === 'link' ||
      !!selectedPaymentMethodId;

    return (
      <div className="space-y-4">
        <OrderSummaryCard showShipping={true} defaultCollapsed={true} />

        {selectedCompany && (
          <PaymentSelector
            customer={{
              id: selectedCompany.id,
              name: selectedCompany.name,
              email: selectedCompany.email || '',
              phone: selectedCompany.phone || '',
              payment_terms: selectedCompany.payment_terms || 'due_in_advance',
              stripe_customer_id: selectedCompany.stripe_customer_id || null,
              customer_number: selectedCompany.customer_number,
            }}
            amountDue={subtotal + calculateTax() + shippingCost}
            orderSubtotal={subtotal + calculateTax()}
            shippingCost={shippingCost}
            depositPaid={formData.deposit_paid}
            depositAmount={formData.deposit_amount}
            onSelect={(methodId, type, _amountOption, _saveCard, _hasExisting, cardBrand, cardLast4) => {
              setSelectedPaymentMethodId(methodId);
              setSelectedPaymentType(type);
              setSelectedCardBrand(cardBrand || null);
              setSelectedCardLast4(cardLast4 || null);
            }}
            onBack={() => setStep("shipping")}
            onCustomerUpdated={async (stripeCustomerId) => {
              await fetchCompanies();
              checkPaymentStatus(stripeCustomerId);
            }}
            hideActions={true}
          />
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <Button type="button" variant="outline" onClick={() => setStep("shipping")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Shipping
          </Button>
          <Button
            type="submit"
            form="customer-order-form"
            disabled={loading || !canCreateOrder}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
            "Save & Continue"
          )}
        </Button>
      </div>
    </div>
  );
};

  // Step 5: Order Confirmation with email preview & send via Resend
  const buildEmailPayload = () => {
    const subtotal = calculateSubtotal();
    const tax = calculateTax();
    const shipping = formData.estimated_shipping || 0;
    const total = subtotal + tax + shipping;
    const orderDate = formData.order_date ? format(new Date(formData.order_date), "MMMM d, yyyy") : format(new Date(), "MMMM d, yyyy");

    const addressBlock = selectedAddress
      ? `${selectedAddress.address}<br/>${selectedAddress.city}, ${selectedAddress.state} ${selectedAddress.zip}`
      : "";

    let paymentLine = "N/A";
    if (selectedPaymentType === 'terms') {
      paymentLine = `Net Terms (${selectedCompany?.payment_terms || 'Standard'})`;
    } else if (selectedPaymentType === 'invoice') {
      paymentLine = "Invoice";
    } else if (selectedPaymentType === 'link') {
      paymentLine = "Payment Link (email to customer)";
    } else if (selectedPaymentType === 'manual_entry' && selectedPaymentMethodId) {
      paymentLine = "One-Time Card (saved for this order)";
    } else if (selectedPaymentType === 'card' && selectedPaymentMethodId) {
      paymentLine = selectedCardBrand && selectedCardLast4
        ? `${selectedCardBrand.charAt(0).toUpperCase() + selectedCardBrand.slice(1)} ****${selectedCardLast4}`
        : "Credit Card on file";
    }

    const payload = {
      orderNumber: savedOrderNumber,
      customerEmail: selectedCompany?.email || "",
      customerName: selectedCompany?.name || "",
      items: orderItems.map(item => ({
        item_name: item.item_name,
        item_sku: item.item_sku,
        quantity_ordered: item.quantity_ordered,
        unit_price: item.unit_price,
      })),
      subtotal,
      tax,
      taxLines: taxQuote.taxLines,
      shipping,
      total,
      shippingAddress: addressBlock,
      paymentMethod: paymentLine,
      notes: formData.notes || "",
      orderDate,
    };
    console.log('[EmailPreview] Payload:', payload.orderNumber, payload.items.length, 'items');
    return payload;
  };

  const loadEmailPreview = async () => {
    setEmailPreviewLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-order-confirmation', {
        body: { ...buildEmailPayload(), preview: true },
      });
      if (error) throw error;
      if (data?.html) {
        setEmailPreviewHtml(data.html);
      }
    } catch (err: any) {
      console.error("Failed to load email preview:", err);
    } finally {
      setEmailPreviewLoading(false);
    }
  };

  const sendConfirmationEmail = async () => {
    setEmailSending(true);
    try {
      if (selectedPaymentType === 'link') {
        // Send payment link instead of confirmation email
        const subtotal = calculateSubtotal();
        const tax = calculateTax();
        const shipping = formData.estimated_shipping || 0;
        const total = subtotal + tax + shipping;

        const { data, error } = await supabase.functions.invoke('send-payment-link', {
          body: {
            order_id: savedOrderId,
            order_number: savedOrderNumber,
            customer_email: selectedCompany?.email || null,
            customer_phone: selectedCompany?.phone || null,
            customer_name: selectedCompany?.name || '',
            amount: total,
          },
        });
        if (error) throw error;
        if (data?.success) {
          setEmailSent(true);
          toast({ title: "Payment Link Sent", description: `Payment link sent to ${selectedCompany?.email || selectedCompany?.phone}` });
        } else {
          toast({ title: "Send Error", description: data?.error || "Failed to send payment link", variant: "destructive" });
        }
      } else {
        const { data, error } = await supabase.functions.invoke('send-order-confirmation', {
          body: { ...buildEmailPayload(), preview: false },
        });
        if (error) throw error;
        if (data?.success) {
          setEmailSent(true);
          if (data.html) setEmailPreviewHtml(data.html);
          toast({ title: "Email Sent", description: `Confirmation email sent to ${selectedCompany?.email}` });
        } else {
          toast({ title: "Email Error", description: data?.error || "Failed to send email", variant: "destructive" });
        }
      }
    } catch (err: any) {
      toast({ title: "Send Error", description: err.message || "Failed to send", variant: "destructive" });
    } finally {
      setEmailSending(false);
    }
  };

  const handleCopyEmailHtml = async () => {
    if (!emailPreviewHtml) return;
    try {
      const blob = new Blob([emailPreviewHtml], { type: 'text/html' });
      const clipboardItem = new ClipboardItem({ 'text/html': blob });
      await navigator.clipboard.write([clipboardItem]);
      toast({ title: "Copied", description: "Email copied to clipboard — paste into Gmail" });
    } catch {
      toast({ title: "Error", description: "Failed to copy to clipboard", variant: "destructive" });
    }
  };

  const renderConfirmationStep = () => {
    let paymentLabel = "N/A";
    if (selectedPaymentType === 'terms') {
      paymentLabel = `Net Terms (${selectedCompany?.payment_terms || 'Standard'})`;
    } else if (selectedPaymentType === 'invoice') {
      paymentLabel = "Invoice";
    } else if (selectedPaymentType === 'link') {
      paymentLabel = "Payment Link (email to customer)";
    } else if (selectedPaymentType === 'manual_entry' && selectedPaymentMethodId) {
      paymentLabel = "One-Time Card (saved for this order)";
    } else if (selectedPaymentType === 'card') {
      paymentLabel = selectedCardBrand && selectedCardLast4
        ? `${selectedCardBrand.charAt(0).toUpperCase() + selectedCardBrand.slice(1)} ****${selectedCardLast4}`
        : "Credit Card on file";
    }

    return (
      <div className="space-y-4">
        {/* Success banner */}
        <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400 flex-shrink-0" />
            <div>
              <p className="font-semibold text-green-800 dark:text-green-200">Order #{savedOrderNumber} Saved Successfully</p>
              <p className="text-sm text-green-600 dark:text-green-400">Review the details below and optionally send a confirmation email.</p>
            </div>
          </CardContent>
        </Card>

        <OrderSummaryCard showShipping={true} defaultCollapsed={true} />

        {/* Payment info */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Payment:</span>
              <span className="font-medium">{paymentLabel}</span>
            </div>
          </CardContent>
        </Card>

        {/* Email Preview */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Confirmation Email Preview
              </CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyEmailHtml}
                disabled={!emailPreviewHtml}
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy Email
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {emailPreviewLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading preview…</span>
              </div>
            ) : emailPreviewHtml ? (
              <iframe
                srcDoc={emailPreviewHtml}
                className="w-full border rounded-md bg-white"
                style={{ height: '420px' }}
                title="Email Preview"
                sandbox="allow-same-origin"
              />
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">Unable to load email preview</p>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col gap-3 pt-2">
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={sendConfirmationEmail}
            disabled={emailSending || emailSent || !selectedCompany?.email}
          >
            {emailSending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending…
              </>
            ) : emailSent ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {selectedPaymentType === 'link' ? 'Payment Link Sent' : 'Email Sent'}
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                {selectedPaymentType === 'link' ? 'Send Payment Link' : 'Send Confirmation Email'}
              </>
            )}
          </Button>

          {!selectedCompany?.email && (
            <p className="text-xs text-destructive text-center">No email address on file for this customer.</p>
          )}

          <div className="flex justify-between pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep("payment")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Payment
            </Button>
            <Button
              type="button"
              onClick={() => {
                resetForm();
                onSuccess();
                onClose();
              }}
            >
              Done
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // Handle refreshing payment status after changes
  const handlePaymentMethodsChanged = () => {
    if (selectedCompany?.stripe_customer_id) {
      checkPaymentStatus(selectedCompany.stripe_customer_id);
    }
  };

  // Handle Stripe customer link success
  const handleStripeCustomerLinked = async () => {
    // Refresh the companies list to get the new stripe_customer_id
    await fetchCompanies();
    // Re-check payment status (will be no_payment_method since just linked)
    if (formData.customer_company_id) {
      // We need to get the updated company with stripe_customer_id
      const { data } = await supabase
        .from("companies")
        .select("stripe_customer_id")
        .eq("id", formData.customer_company_id)
        .single();
      
      if (data?.stripe_customer_id) {
        checkPaymentStatus(data.stripe_customer_id);
      }
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>Create Customer Order</DialogTitle>
            <DialogDescription>Create a new customer order with shipping and item details</DialogDescription>
          </DialogHeader>

          <StepIndicator />

          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-6 py-4">
            <div style={{ display: step === "customer_order" ? "block" : "none" }}>
              {renderCustomerOrderStep()}
            </div>
            {hasVisitedPacking && (
              <div style={{ display: step === "packing" ? "block" : "none" }}>
                {renderPackingStep()}
              </div>
            )}
            <div style={{ display: step === "shipping" ? "block" : "none" }}>
              {renderShippingStep()}
            </div>
            <div style={{ display: step === "payment" ? "block" : "none" }}>
              {renderPaymentStep()}
            </div>
            <div style={{ display: step === "confirmation" ? "block" : "none" }}>
              {renderConfirmationStep()}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Cards Modal */}
      {selectedCompany?.stripe_customer_id && (
        <ManageCardsModal
          open={showManageCardsModal}
          onClose={() => setShowManageCardsModal(false)}
          stripeCustomerId={selectedCompany.stripe_customer_id}
          customerName={selectedCompany.name}
          onPaymentMethodsChanged={handlePaymentMethodsChanged}
        />
      )}

      {/* Stripe Customer Link Modal */}
      {selectedCompany && (
        <StripeCustomerLink
          open={showStripeCustomerModal}
          onClose={() => setShowStripeCustomerModal(false)}
          company={{
            id: selectedCompany.id,
            name: selectedCompany.name,
            email: selectedCompany.email || undefined,
            phone: selectedCompany.phone || undefined,
            billing_address: selectedCompany.billing_address || undefined,
            customer_number: selectedCompany.customer_number,
            owners_name: selectedCompany.owners_name || undefined,
          }}
          onSuccess={handleStripeCustomerLinked}
        />
      )}
    </>
  );
};
