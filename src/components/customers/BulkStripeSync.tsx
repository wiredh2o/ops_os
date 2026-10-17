import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  CreditCard, 
  Users, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Play, 
  Loader2,
  RefreshCw 
} from 'lucide-react';

interface BulkStripeSyncProps {
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

interface SyncResult {
  customerId: string;
  customerNumber: number;
  customerName: string;
  success: boolean;
  error?: string;
  stripeCustomerId?: string;
}

export function BulkStripeSync({ open, onClose, onComplete }: BulkStripeSyncProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [customersWithoutStripe, setCustomersWithoutStripe] = useState<any[]>([]);
  const [customersWithStripe, setCustomersWithStripe] = useState<number>(0);
  const [totalCustomers, setTotalCustomers] = useState<number>(0);
  const [progress, setProgress] = useState(0);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [results, setResults] = useState<SyncResult[]>([]);
  const [syncComplete, setSyncComplete] = useState(false);

  useEffect(() => {
    if (open) {
      loadCustomerStats();
    }
  }, [open]);

  const loadCustomerStats = async () => {
    setIsLoading(true);
    try {
      // Get all customers
      const allCustomers: any[] = [];
      const batchSize = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('companies')
          .select('id, customer_number, name, email, phone, billing_address, owners_name, stripe_customer_id, is_active')
          .order('customer_number', { ascending: true })
          .range(offset, offset + batchSize - 1);

        if (error) throw error;
        
        if (data && data.length > 0) {
          allCustomers.push(...data);
          offset += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      setTotalCustomers(allCustomers.length);
      
      const withStripe = allCustomers.filter(c => c.stripe_customer_id);
      const withoutStripe = allCustomers.filter(c => !c.stripe_customer_id && c.is_active);
      
      setCustomersWithStripe(withStripe.length);
      setCustomersWithoutStripe(withoutStripe);
      
    } catch (error) {
      console.error('Error loading customer stats:', error);
      toast({
        title: 'Error',
        description: 'Failed to load customer statistics',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const startSync = async () => {
    if (customersWithoutStripe.length === 0) return;

    setIsSyncing(true);
    setProgress(0);
    setResults([]);
    setSyncComplete(false);

    const BATCH_SIZE = 25;
    const batches = Math.ceil(customersWithoutStripe.length / BATCH_SIZE);
    setTotalBatches(batches);

    const allResults: SyncResult[] = [];

    for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
      setCurrentBatch(batchIndex + 1);
      
      const start = batchIndex * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, customersWithoutStripe.length);
      const batch = customersWithoutStripe.slice(start, end);

      try {
        const { data, error } = await supabase.functions.invoke('batch-create-stripe-customers', {
          body: { 
            customers: batch.map(c => ({
              company_id: c.id,
              name: c.name,
              email: c.email,
              phone: c.phone,
              billing_address: c.billing_address,
              customer_number: c.customer_number,
              owners_name: c.owners_name,
            }))
          }
        });

        if (error) {
          // Batch failed entirely
          batch.forEach(c => {
            allResults.push({
              customerId: c.id,
              customerNumber: c.customer_number,
              customerName: c.name,
              success: false,
              error: error.message,
            });
          });
        } else if (data?.results) {
          // Handle both array (new format) and object (legacy format) responses
          if (Array.isArray(data.results)) {
            // New format: array of per-customer results
            data.results.forEach((result: any, idx: number) => {
              const customer = batch[idx];
              allResults.push({
                customerId: customer.id,
                customerNumber: customer.customer_number,
                customerName: customer.name,
                success: result.success,
                error: result.error,
                stripeCustomerId: result.stripe_customer_id,
              });
            });
          } else {
            // Legacy format: summary object - mark all as success if created > 0
            batch.forEach(c => {
              allResults.push({
                customerId: c.id,
                customerNumber: c.customer_number,
                customerName: c.name,
                success: true,
              });
            });
          }
        }
      } catch (err: any) {
        // Network or other error
        batch.forEach(c => {
          allResults.push({
            customerId: c.id,
            customerNumber: c.customer_number,
            customerName: c.name,
            success: false,
            error: err.message || 'Unknown error',
          });
        });
      }

      // Update progress
      setProgress(Math.round(((batchIndex + 1) / batches) * 100));
      setResults([...allResults]);

      // Small delay between batches to avoid rate limiting
      if (batchIndex < batches - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    setSyncComplete(true);
    setIsSyncing(false);

    const successCount = allResults.filter(r => r.success).length;
    const failCount = allResults.filter(r => !r.success).length;

    toast({
      title: 'Sync Complete',
      description: `${successCount} created, ${failCount} failed`,
    });

    if (onComplete) {
      onComplete();
    }
  };

  const handleClose = () => {
    if (!isSyncing) {
      setResults([]);
      setSyncComplete(false);
      setProgress(0);
      onClose();
    }
  };

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Bulk Stripe Customer Sync
          </DialogTitle>
          <DialogDescription>
            Create Stripe customer records for all existing customers
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Stats Cards */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Total Customers
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      {totalCustomers}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Linked to Stripe
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-primary" />
                      {customersWithStripe}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Need Stripe ID
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                      {customersWithoutStripe.length}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Action Section */}
              {!isSyncing && !syncComplete && customersWithoutStripe.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Ready to Sync</AlertTitle>
                  <AlertDescription>
                    {customersWithoutStripe.length} active customers will have Stripe accounts created.
                    This will process in batches of 25 customers at a time.
                  </AlertDescription>
                </Alert>
              )}

              {customersWithoutStripe.length === 0 && !syncComplete && (
                <Alert className="border-accent bg-accent/10">
                  <CheckCircle className="h-4 w-4 text-accent-foreground" />
                  <AlertTitle>All Synced!</AlertTitle>
                  <AlertDescription>
                    All active customers already have Stripe customer IDs.
                  </AlertDescription>
                </Alert>
              )}

              {/* Progress Section */}
              {(isSyncing || syncComplete) && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Progress</span>
                      <span>
                        {isSyncing 
                          ? `Batch ${currentBatch} of ${totalBatches}` 
                          : 'Complete'}
                      </span>
                    </div>
                    <Progress value={progress} className="h-3" />
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>{progress}% complete</span>
                      <span className="flex gap-4">
                        <span className="text-primary">{successCount} success</span>
                        {failCount > 0 && (
                          <span className="text-destructive">{failCount} failed</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Results List */}
                  {results.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Results</CardTitle>
                        <CardDescription>
                          Showing {Math.min(results.length, 50)} of {results.length} processed
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-48">
                          <div className="space-y-1">
                            {results.slice(-50).reverse().map((result, idx) => (
                              <div 
                                key={result.customerId} 
                                className="flex items-center justify-between py-1 text-sm border-b border-muted last:border-0"
                              >
                                <div className="flex items-center gap-2">
                                  {result.success ? (
                                    <CheckCircle className="h-4 w-4 text-primary" />
                                  ) : (
                                    <XCircle className="h-4 w-4 text-destructive" />
                                  )}
                                  <span className="font-mono text-xs text-muted-foreground">
                                    #{result.customerNumber}
                                  </span>
                                  <span className="truncate max-w-[200px]">
                                    {result.customerName}
                                  </span>
                                </div>
                                <div>
                                  {result.success ? (
                                    <Badge variant="outline" className="text-primary text-xs">
                                      Created
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-destructive text-xs">
                                      {result.error?.slice(0, 30)}...
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleClose} disabled={isSyncing}>
            {syncComplete ? 'Close' : 'Cancel'}
          </Button>
          
          {!syncComplete && customersWithoutStripe.length > 0 && (
            <Button 
              onClick={startSync} 
              disabled={isSyncing || isLoading}
            >
              {isSyncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Start Sync ({customersWithoutStripe.length} customers)
                </>
              )}
            </Button>
          )}

          {syncComplete && failCount > 0 && (
            <Button onClick={() => {
              setSyncComplete(false);
              setResults([]);
              loadCustomerStats();
            }}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry Failed
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
