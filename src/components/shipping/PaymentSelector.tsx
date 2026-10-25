import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, CreditCard, Mail, ArrowLeft, Check, CheckCircle, AlertCircle, Plus, FileText, Keyboard, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { usePaymentTerms } from '@/hooks/usePaymentTerms';
import { findTerm, termKind, depositFraction } from '@/lib/credit-rules';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';
import { AddCardForm } from './AddCardForm';

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  payment_terms: string;
  stripe_customer_id: string | null;
  customer_number?: number;
}

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default?: boolean;
  type?: 'payment_method' | 'source';
}

interface StripeMeta {
  livemode: boolean;
  key_type: 'TEST' | 'LIVE';
  stripe_customer_id: string;
  customer_found: boolean;
  customer_name?: string | null;
  customer_email?: string | null;
  counts: {
    payment_methods: number;
    legacy_sources: number;
    total: number;
  };
  defaults?: {
    default_payment_method_id: string | null;
    default_source_id: string | null;
  };
}

type PaymentAmountOption = 'full' | 'remaining' | 'terms';
// Payment type includes invoice for net terms customers
type PaymentType = 'card' | 'link' | 'manual_entry' | 'manual_entry_save' | 'terms' | 'invoice';
interface PaymentSelectorProps {
  customer: Customer;
  amountDue: number;
  orderSubtotal: number;
  shippingCost: number;
  depositPaid: boolean;
  depositAmount: number;
  onSelect: (methodId: string | null, type: PaymentType, amountOption: PaymentAmountOption, saveCard?: boolean, hasExistingCards?: boolean, cardBrand?: string, cardLast4?: string) => void;
  onBack: () => void;
  onCustomerUpdated?: (stripeCustomerId: string) => void;
  hideActions?: boolean;
}

export function PaymentSelector({ 
  customer, 
  amountDue, 
  orderSubtotal,
  shippingCost,
  depositPaid,
  depositAmount,
  onSelect, 
  onBack,
  onCustomerUpdated,
  hideActions = false
}: PaymentSelectorProps) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [stripeMeta, setStripeMeta] = useState<StripeMeta | null>(null);
  const [stripeError, setStripeError] = useState<{ error: string; message: string; hint?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncingStripe, setSyncingStripe] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'card' | 'link' | 'manual_entry' | 'manual_entry_save' | 'terms' | 'invoice'>('card');
  const [selectedAmountOption, setSelectedAmountOption] = useState<PaymentAmountOption>('full');
  const [saveCardForLink, setSaveCardForLink] = useState(true);
  const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(customer.stripe_customer_id);
  const [deletingMethodId, setDeletingMethodId] = useState<string | null>(null);
  const [confirmDeleteMethod, setConfirmDeleteMethod] = useState<PaymentMethod | null>(null);
  const [showAddCardForm, setShowAddCardForm] = useState(false);
  const [oneTimeCardMap, setOneTimeCardMap] = useState<Map<string, string>>(new Map());
  const { toast } = useToast();

  const paymentTerms = customer.payment_terms || 'due_in_advance';
  const { data: termsList = [] } = usePaymentTerms();
  const term = findTerm(termsList, paymentTerms);
  const kind = termKind(term);
  const isNetTermsCustomer = kind === 'net';
  const termLabel = term?.label ?? paymentTerms;
  const netDays = term?.net_days ?? 0;
  const remainingFraction = 1 - depositFraction(term);

  useEffect(() => {
    initializePayment();
  }, [customer.id]);

  // Set default selection based on payment terms
  useEffect(() => {
    if (isNetTermsCustomer) {
      // Net Terms customers default to invoice option
      setSelectedType('invoice');
      setSelectedAmountOption('terms');
    } else if (kind === 'deposit' && depositPaid) {
      setSelectedAmountOption('remaining');
    } else {
      setSelectedAmountOption('full');
    }
  }, [paymentTerms, depositPaid, isNetTermsCustomer, kind]);

  const ensureStripeCustomer = async (): Promise<string | null> => {
    // Already have a Stripe customer ID
    if (customer.stripe_customer_id) {
      return customer.stripe_customer_id;
    }

    setSyncingStripe(true);
    setSyncError(null);

    try {
      // Step 1: Search Stripe for existing customer by email
      if (customer.email) {
        console.log('Searching Stripe for existing customer by email:', customer.email);
        const { data: searchResult, error: searchError } = await supabase.functions.invoke('search-stripe-customers', {
          body: { email: customer.email }
        });

        if (!searchError && searchResult?.customers?.length > 0) {
          // Found existing Stripe customer - link them
          const stripeCustomer = searchResult.customers[0];
          console.log('Found existing Stripe customer:', stripeCustomer.id);
          
          const { error: linkError } = await supabase.functions.invoke('link-stripe-customer', {
            body: {
              company_id: customer.id,
              stripe_customer_id: stripeCustomer.id,
              customer_number: customer.customer_number
            }
          });

          if (linkError) {
            console.error('Error linking Stripe customer:', linkError);
            throw new Error('Failed to link existing Stripe customer');
          }

          onCustomerUpdated?.(stripeCustomer.id);
          return stripeCustomer.id;
        }
      }

      // Step 2: No existing customer found - create new one
      console.log('Creating new Stripe customer for:', customer.name);
      const { data: createResult, error: createError } = await supabase.functions.invoke('create-stripe-customer', {
        body: {
          company_id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
        }
      });

      if (createError || !createResult?.stripe_customer_id) {
        console.error('Error creating Stripe customer:', createError);
        throw new Error('Failed to create Stripe customer');
      }

      console.log('Created new Stripe customer:', createResult.stripe_customer_id);
      onCustomerUpdated?.(createResult.stripe_customer_id);
      return createResult.stripe_customer_id;
    } catch (error: any) {
      console.error('Error ensuring Stripe customer:', error);
      setSyncError(error.message || 'Failed to set up payment account');
      return null;
    } finally {
      setSyncingStripe(false);
    }
  };

  const initializePayment = async () => {
    setLoading(true);
    
    const resolvedStripeId = await ensureStripeCustomer();
    setStripeCustomerId(resolvedStripeId);
    
    if (resolvedStripeId) {
      await loadPaymentMethods(resolvedStripeId);
    } else {
      setLoading(false);
    }
  };

  const loadPaymentMethods = async (stripeId: string) => {
    setStripeError(null);
    try {
      const { data, error } = await supabase.functions.invoke('get-stripe-payment-methods', {
        body: { stripe_customer_id: stripeId },
      });

      // Handle edge function errors (including 404 for customer not found)
      if (error) {
        console.error('Edge function error:', error);
        // Try to parse the error response body
        if (error.context?.body) {
          try {
            const errorBody = JSON.parse(error.context.body);
            setStripeError({
              error: errorBody.error || 'unknown_error',
              message: errorBody.message || 'Failed to load payment methods',
              hint: errorBody.hint
            });
            setStripeMeta(errorBody.meta || null);
          } catch {
            setStripeError({ error: 'unknown_error', message: error.message });
          }
        } else {
          setStripeError({ error: 'unknown_error', message: error.message });
        }
        return;
      }

      // Check for error in response body (non-2xx responses)
      if (data?.error) {
        setStripeError({
          error: data.error,
          message: data.message || 'Failed to load payment methods',
          hint: data.hint
        });
        setStripeMeta(data.meta || null);
        return;
      }

      const methods = data?.payment_methods || [];
      setPaymentMethods(methods);
      setStripeMeta(data?.meta || null);

      // Query one-time cards from open orders for this customer
      try {
        const { data: oneTimeCards } = await supabase
          .from('customer_orders')
          .select('stripe_payment_method_id, order_number')
          .eq('customer_company_id', customer.id)
          .eq('is_one_time_card', true)
          .not('stripe_payment_method_id', 'is', null)
          .not('order_status', 'in', '(fulfilled,cancelled)');

        setOneTimeCardMap(new Map(
          (oneTimeCards || []).map(c => [c.stripe_payment_method_id!, c.order_number])
        ));
      } catch (err) {
        console.error('Error loading one-time card info:', err);
      }
      
      // Auto-select default card if available
      const defaultCard = methods.find((m: PaymentMethod) => m.is_default);
      if (defaultCard) {
        setSelectedMethod(defaultCard.id);
        setSelectedType('card');
      } else if (methods.length > 0) {
        setSelectedMethod(methods[0].id);
        setSelectedType('card');
      }
    } catch (err: any) {
      console.error('Error loading payment methods:', err);
      setStripeError({ error: 'unexpected_error', message: err.message || 'Unexpected error loading payment methods' });
    } finally {
      setLoading(false);
    }
  };

  const handleRetrySync = () => {
    initializePayment();
  };

  const handleAddNewCard = () => {
    // Show the add card form inline
    setShowAddCardForm(true);
  };

  const handleCardAdded = async (paymentMethodId: string) => {
    // Refresh the payment methods list
    if (stripeCustomerId) {
      await loadPaymentMethods(stripeCustomerId);
    }
    // Select the newly added card
    setSelectedMethod(paymentMethodId);
    setSelectedType('card');
    setShowAddCardForm(false);
    toast({
      title: "Payment method added",
      description: "Your new card has been saved and selected.",
    });
  };

  const handleCancelAddCard = () => {
    setShowAddCardForm(false);
  };

  const handleSelectCard = (methodId: string) => {
    setSelectedMethod(methodId);
    setSelectedType('card');
  };

  const handleSelectLink = () => {
    setSelectedMethod(null);
    setSelectedType('link');
  };

  const handleSelectManualEntry = () => {
    setSelectedMethod(null);
    setSelectedType('manual_entry');
  };

  const handleSelectInvoice = () => {
    setSelectedMethod(null);
    setSelectedType('invoice');
    setSelectedAmountOption('terms');
  };

  const handleSelectTerms = () => {
    setSelectedMethod(null);
    setSelectedType('terms');
    setSelectedAmountOption('terms');
  };

  const getSelectedCardMeta = () => {
    if (selectedType === 'card' && selectedMethod) {
      const card = paymentMethods.find(pm => pm.id === selectedMethod);
      if (card) return { brand: card.brand, last4: card.last4 };
    }
    return { brand: undefined, last4: undefined };
  };

  const handleConfirm = () => {
    const { brand, last4 } = getSelectedCardMeta();
    onSelect(
      selectedMethod, 
      selectedType, 
      selectedAmountOption,
      selectedType === 'link' ? saveCardForLink : undefined,
      paymentMethods.length > 0,
      brand,
      last4
    );
  };

  // When hideActions is true, the parent controls navigation and never triggers handleConfirm.
  // Sync selection state to the parent reactively so it always has the current payment choice.
  useEffect(() => {
    if (hideActions) {
      const { brand, last4 } = getSelectedCardMeta();
      onSelect(
        selectedMethod,
        selectedType,
        selectedAmountOption,
        selectedType === 'link' ? saveCardForLink : undefined,
        paymentMethods.length > 0,
        brand,
        last4
      );
    }
  }, [hideActions, selectedMethod, selectedType, selectedAmountOption, saveCardForLink, paymentMethods.length]);

  const getBrandIcon = (brand: string) => {
    return brand.charAt(0).toUpperCase() + brand.slice(1);
  };

  // Calculate amounts based on payment terms and deposit status
  const getAmountForOption = (option: PaymentAmountOption): number => {
    const totalWithShipping = orderSubtotal + shippingCost;
    
    switch (option) {
      case 'full':
        return totalWithShipping;
      case 'remaining':
        // For fifty_fifty with deposit paid, charge remaining 50% + shipping
        if (kind === 'deposit' && depositPaid) {
          return (orderSubtotal * remainingFraction) + shippingCost;
        }
        return totalWithShipping - depositAmount;
      case 'terms':
        return 0; // Bill on terms
      default:
        return totalWithShipping;
    }
  };

  // Determine which amount options to show
  const getAmountOptions = (): { value: PaymentAmountOption; label: string; amount: number; description: string }[] => {
    const totalWithShipping = orderSubtotal + shippingCost;
    const options: { value: PaymentAmountOption; label: string; amount: number; description: string }[] = [];

    if (kind === 'prepay') {
      // Only full amount for due_in_advance
      options.push({
        value: 'full',
        label: 'Pay Full Amount',
        amount: totalWithShipping,
        description: 'Collect payment before shipping'
      });
    } else if (kind === 'deposit') {
      if (depositPaid) {
        // Only remaining balance
        options.push({
          value: 'remaining',
          label: 'Pay Remaining Balance',
          amount: (orderSubtotal * remainingFraction) + shippingCost,
          description: `Deposit (${formatCurrency(depositAmount)}) already paid`
        });
      } else {
        // Show both 50% deposit and full amount options
        options.push({
          value: 'full',
          label: 'Pay Full Amount Now',
          amount: totalWithShipping,
          description: 'Pay the entire order upfront'
        });
      }
    } else if (kind === 'net') {
      // Net terms: show bill on terms or pay now
      options.push({
        value: 'terms',
        label: `Bill on ${termLabel} Terms`,
        amount: 0,
        description: 'Invoice will be sent after shipping'
      });
      options.push({
        value: 'full',
        label: 'Pay Now (Optional)',
        amount: totalWithShipping,
        description: 'Collect payment before shipping'
      });
    }

    return options;
  };

  const amountOptions = getAmountOptions();
  const selectedAmount = getAmountForOption(selectedAmountOption);
  const showPaymentMethods = selectedType === 'invoice' || (selectedAmountOption !== 'terms' && selectedAmount > 0);
  // If showing the add card form, render it instead
  if (showAddCardForm && stripeCustomerId) {
    return (
      <div className="space-y-4">
        <AddCardForm
          stripeCustomerId={stripeCustomerId}
          onSuccess={handleCardAdded}
          onCancel={handleCancelAddCard}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Select Payment</h3>
        </div>
        {/* Stripe Environment Badge */}
        {stripeMeta && (
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${
            stripeMeta.key_type === 'TEST' 
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' 
              : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              stripeMeta.key_type === 'TEST' ? 'bg-amber-500' : 'bg-green-500'
            }`} />
            Stripe {stripeMeta.key_type}
          </div>
        )}
      </div>

      {/* Amount Options */}
      {amountOptions.length > 1 && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm font-medium mb-3">Payment Amount</p>
            <RadioGroup 
              value={selectedAmountOption} 
              onValueChange={(value) => {
                setSelectedAmountOption(value as PaymentAmountOption);
                if (value === 'terms') {
                  setSelectedType('terms');
                  setSelectedMethod(null);
                } else if (selectedType === 'terms') {
                  setSelectedType('card');
                }
              }}
            >
              {amountOptions.map((option) => (
                <div 
                  key={option.value} 
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedAmountOption === option.value 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => {
                    setSelectedAmountOption(option.value);
                    if (option.value === 'terms') {
                      setSelectedType('terms');
                      setSelectedMethod(null);
                    } else if (selectedType === 'terms') {
                      setSelectedType('card');
                    }
                  }}
                >
                  <div className="flex items-center gap-3">
                    <RadioGroupItem value={option.value} id={option.value} />
                    <div>
                      <Label htmlFor={option.value} className="font-medium cursor-pointer">
                        {option.label}
                      </Label>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </div>
                  </div>
                  <span className={`font-bold ${option.amount === 0 ? 'text-muted-foreground' : 'text-primary'}`}>
                    <FinancialGuard kind="revenue">{option.amount === 0 ? '$0.00 now' : formatCurrency(option.amount)}</FinancialGuard>
                  </span>
                </div>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>
      )}

      {/* Single amount display for due_in_advance */}
      {amountOptions.length === 1 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Amount to Charge</span>
              <span className="text-2xl font-bold text-primary"><FinancialGuard kind="revenue">{formatCurrency(selectedAmount)}</FinancialGuard></span>
            </div>
          </CardContent>
        </Card>
      )}

      {syncingStripe ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Looking up payment account...</p>
        </div>
      ) : syncError ? (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-destructive">Payment Setup Issue</p>
                <p className="text-sm text-muted-foreground mt-1">{syncError}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={handleRetrySync}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground mb-2">You can still proceed with:</p>
              <div className="space-y-2">
                <Button 
                  variant="outline" 
                  className="w-full justify-start" 
                  onClick={() => { setSyncError(null); handleSelectManualEntry(); }}
                >
                  <Keyboard className="h-4 w-4 mr-2" />
                  Enter card details manually
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start" 
                  onClick={() => { setSyncError(null); handleSelectLink(); }}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Send payment link to customer
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : stripeError ? (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-destructive">
                  {stripeError.error === 'stripe_customer_not_found' 
                    ? 'Stripe Customer Not Found' 
                    : 'Payment Method Error'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">{stripeError.message}</p>
                {stripeError.hint && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 font-medium">{stripeError.hint}</p>
                )}
                {stripeMeta && (
                  <div className="mt-3 p-2 bg-muted rounded text-xs space-y-1">
                    <p>Stripe Mode: <span className="font-mono font-medium">{stripeMeta.key_type}</span></p>
                    <p>Customer ID: <span className="font-mono">{stripeMeta.stripe_customer_id}</span></p>
                    <p>Customer Found: <span className="font-medium">{stripeMeta.customer_found ? 'Yes' : 'No'}</span></p>
                  </div>
                )}
                <Button variant="outline" size="sm" className="mt-3" onClick={() => loadPaymentMethods(stripeCustomerId!)}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground mb-2">You can still proceed with:</p>
              <div className="space-y-2">
                <Button 
                  variant="outline" 
                  className="w-full justify-start" 
                  onClick={() => { setStripeError(null); handleSelectManualEntry(); }}
                >
                  <Keyboard className="h-4 w-4 mr-2" />
                  Enter card details manually
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start" 
                  onClick={() => { setStripeError(null); handleSelectLink(); }}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Send payment link to customer
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading payment methods...</p>
        </div>
      ) : showPaymentMethods ? (
        <div className="space-y-3">
          {/* Invoice Option for Net Terms Customers */}
          {isNetTermsCustomer && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Payment Terms</p>
              <Card
                className={`cursor-pointer transition-all hover:border-primary ${
                  selectedType === 'invoice' ? 'border-2 border-primary bg-primary/5' : ''
                }`}
                onClick={handleSelectInvoice}
              >
                <CardContent className="p-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      <div>
                        <p className="font-medium">
                          Invoice on {termLabel}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Payment due within {netDays} days of shipment
                        </p>
                      </div>
                    </div>
                    {selectedType === 'invoice' && (
                      <Check className="h-5 w-5 text-primary" />
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Saved Cards */}
          {paymentMethods.length > 0 && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">
                {isNetTermsCustomer ? 'Or Pay Now With Saved Card' : 'Saved Payment Methods'}
              </p>
              <div className="grid gap-2">
                {paymentMethods.map((method) => (
                  <Card
                    key={method.id}
                    className={`cursor-pointer transition-all hover:border-primary ${
                      selectedMethod === method.id && selectedType === 'card'
                        ? 'border-2 border-primary bg-primary/5' 
                        : ''
                    }`}
                    onClick={() => handleSelectCard(method.id)}
                  >
                    <CardContent className="p-3">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <CreditCard className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium">
                                {getBrandIcon(method.brand)} •••• {method.last4}
                                {method.is_default && (
                                  <span className="ml-2 text-xs text-muted-foreground">(Default)</span>
                                )}
                              </p>
                              {oneTimeCardMap.has(method.id) && (
                                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-600">
                                  One-Time · Order #{oneTimeCardMap.get(method.id)}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Expires {method.exp_month}/{method.exp_year}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteMethod(method);
                            }}
                            disabled={deletingMethodId !== null}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          {selectedMethod === method.id && selectedType === 'card' && (
                            <Check className="h-5 w-5 text-primary" />
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Delete Confirmation Dialog */}
          <AlertDialog open={!!confirmDeleteMethod} onOpenChange={(open) => !open && setConfirmDeleteMethod(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Payment Method</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to remove the {confirmDeleteMethod?.brand} card ending in ••••{confirmDeleteMethod?.last4}? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deletingMethodId !== null}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deletingMethodId !== null}
                  onClick={async (e) => {
                    e.preventDefault();
                    if (!confirmDeleteMethod) return;
                    
                    setDeletingMethodId(confirmDeleteMethod.id);
                    try {
                      const { error } = await supabase.functions.invoke('detach-stripe-payment-method', {
                        body: {
                          stripe_customer_id: stripeCustomerId,
                          payment_method_id: confirmDeleteMethod.id,
                          type: confirmDeleteMethod.type || 'payment_method'
                        }
                      });
                      if (error) throw error;
                      
                      setPaymentMethods(prev => prev.filter(m => m.id !== confirmDeleteMethod.id));
                      if (selectedMethod === confirmDeleteMethod.id) {
                        const remaining = paymentMethods.filter(m => m.id !== confirmDeleteMethod.id);
                        if (remaining.length > 0) {
                          setSelectedMethod(remaining[0].id);
                          setSelectedType('card');
                        } else {
                          setSelectedMethod(null);
                          setSelectedType('manual_entry');
                        }
                      }
                      toast({
                        title: "Payment method removed",
                        description: `${confirmDeleteMethod.brand} ••••${confirmDeleteMethod.last4} has been deleted.`,
                      });
                      setConfirmDeleteMethod(null);
                    } catch (err: any) {
                      console.error('Failed to delete payment method:', err);
                      toast({
                        title: "Failed to remove card",
                        description: err.message || "An error occurred while removing the payment method.",
                        variant: "destructive",
                      });
                    } finally {
                      setDeletingMethodId(null);
                    }
                  }}
                >
                  {deletingMethodId !== null ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* No Cards Info - only show when customer exists and has no cards */}
          {paymentMethods.length === 0 && stripeCustomerId && stripeMeta?.customer_found && !stripeError && (
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm py-2 px-3 bg-amber-50 dark:bg-amber-950 rounded-lg">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>No saved payment methods found for this customer in Stripe {stripeMeta.key_type} mode.</span>
            </div>
          )}

          {/* Send Payment Link Option */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Other Options</p>
            <div className="grid gap-2">
              {/* Manual Card Entry */}
              <Card
                className={`cursor-pointer transition-all hover:border-primary ${
                  selectedType === 'manual_entry' ? 'border-2 border-primary bg-primary/5' : ''
                }`}
                onClick={handleSelectManualEntry}
              >
                <CardContent className="p-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <CreditCard className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">
                          {paymentMethods.length > 0 
                            ? "Use Different Card (One-Time)" 
                            : "Enter Card Details"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {hideActions && paymentMethods.length > 0
                            ? "Card will be saved for this order only — not charged until fulfillment"
                            : paymentMethods.length > 0
                              ? "Enter card details for this order only - card will not be saved"
                              : "Enter card details now to process payment immediately"}
                        </p>
                      </div>
                    </div>
                    {selectedType === 'manual_entry' && !selectedMethod && (
                      <Check className="h-5 w-5 text-primary" />
                    )}
                    {selectedType === 'manual_entry' && selectedMethod && (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Inline card entry form for customer order context */}
              {selectedType === 'manual_entry' && hideActions && stripeCustomerId && !selectedMethod && (
                <div className="ml-2 border-l-2 border-primary/20 pl-4">
                  <AddCardForm
                    stripeCustomerId={stripeCustomerId}
                    onSuccess={(paymentMethodId) => {
                      setSelectedMethod(paymentMethodId);
                      toast({
                        title: 'Card saved',
                        description: 'Card saved for this order — it will not be charged until fulfillment.',
                      });
                    }}
                    onCancel={() => setSelectedType('card')}
                  />
                </div>
              )}

              {/* Success confirmation when card is saved */}
              {selectedType === 'manual_entry' && hideActions && selectedMethod && (
                <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                      <div>
                        <p className="font-medium text-green-800 dark:text-green-200">Card saved for this order</p>
                        <p className="text-xs text-green-600 dark:text-green-400">
                          This card will be charged at fulfillment and automatically removed afterward.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Send Payment Link */}
              <Card
                className={`cursor-pointer transition-all hover:border-primary ${
                  selectedType === 'link' ? 'border-2 border-primary bg-primary/5' : ''
                }`}
                onClick={handleSelectLink}
              >
                <CardContent className="p-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Send Payment Link</p>
                        <p className="text-xs text-muted-foreground">
                          {customer.email && customer.phone 
                            ? `Email to ${customer.email} and text to ${customer.phone}`
                            : customer.email 
                              ? `Email to ${customer.email}`
                              : customer.phone 
                                ? `Text to ${customer.phone}`
                                : 'Send via email and/or SMS'}
                        </p>
                      </div>
                    </div>
                    {selectedType === 'link' && (
                      <Check className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  {selectedType === 'link' && (
                    <div 
                      className="flex items-center space-x-2 mt-3 pt-3 border-t"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox 
                        id="saveCardLink" 
                        checked={saveCardForLink}
                        onCheckedChange={(checked) => setSaveCardForLink(checked === true)}
                      />
                      <Label htmlFor="saveCardLink" className="text-xs cursor-pointer">
                        Save card for future purchases (default)
                      </Label>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Add New Card */}
              {stripeCustomerId && (
                <Card
                  className="cursor-pointer transition-all hover:border-primary"
                  onClick={handleAddNewCard}
                >
                  <CardContent className="p-3">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <Plus className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">Add New Payment Method</p>
                          <p className="text-xs text-muted-foreground">
                            Save a new card for this and future orders
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      ) : selectedAmountOption === 'terms' ? (
        <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div>
                <p className="font-medium text-blue-900 dark:text-blue-100">
                  Invoice on {termLabel} Terms
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  No payment required now. An invoice for <FinancialGuard kind="revenue">{formatCurrency(orderSubtotal + shippingCost)}</FinancialGuard> will be 
                  sent after shipping and is due within {netDays} days.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Actions */}
      {!hideActions && (
        <div className="flex gap-2 pt-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button 
            className="flex-1" 
            onClick={handleConfirm}
            disabled={
              showPaymentMethods && 
              selectedType === 'card' && 
              !selectedMethod && 
              paymentMethods.length > 0
            }
          >
            Continue to Confirmation
          </Button>
        </div>
      )}
    </div>
  );
}
