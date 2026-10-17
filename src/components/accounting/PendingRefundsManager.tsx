import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, DollarSign, Users, FileCheck, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';
import { format } from 'date-fns';

interface PendingRefund {
  id: string;
  company_id: string;
  company_name: string;
  amount: number;
  created_at: string;
  source_order_number: string | null;
  description: string | null;
}

export function PendingRefundsManager() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [pendingRefunds, setPendingRefunds] = useState<PendingRefund[]>([]);
  const [totalPending, setTotalPending] = useState(0);
  const [customerCount, setCustomerCount] = useState(0);
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [selectedRefund, setSelectedRefund] = useState<PendingRefund | null>(null);
  const [checkNumber, setCheckNumber] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadPendingRefunds();
  }, []);

  const loadPendingRefunds = async () => {
    try {
      setLoading(true);

      // Get all pending refund transactions
      const { data: transactions, error } = await supabase
        .from('store_credit_transactions')
        .select(`
          id,
          company_id,
          amount,
          created_at,
          source_order_id,
          description,
          company:companies(name)
        `)
        .eq('transaction_type', 'refund_pending')
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Get order numbers for source orders
      const sourceOrderIds = transactions
        ?.filter(t => t.source_order_id)
        .map(t => t.source_order_id) || [];

      let orderMap: Record<string, string> = {};
      if (sourceOrderIds.length > 0) {
        const { data: orders } = await supabase
          .from('production_orders')
          .select('id, order_number')
          .in('id', sourceOrderIds);
        
        orderMap = (orders || []).reduce((acc, o) => {
          acc[o.id] = o.order_number;
          return acc;
        }, {} as Record<string, string>);
      }

      const refunds: PendingRefund[] = (transactions || []).map(t => ({
        id: t.id,
        company_id: t.company_id,
        company_name: (t.company as any)?.name || 'Unknown',
        amount: t.amount,
        created_at: t.created_at,
        source_order_number: t.source_order_id ? orderMap[t.source_order_id] || null : null,
        description: t.description,
      }));

      setPendingRefunds(refunds);

      // Calculate totals
      const total = refunds.reduce((sum, r) => sum + r.amount, 0);
      setTotalPending(total);

      const uniqueCompanies = new Set(refunds.map(r => r.company_id));
      setCustomerCount(uniqueCompanies.size);

    } catch (error: any) {
      console.error('Error loading pending refunds:', error);
      toast({
        title: 'Error',
        description: 'Failed to load pending refunds',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleIssueRefund = async () => {
    if (!selectedRefund || !checkNumber.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a check number',
        variant: 'destructive',
      });
      return;
    }

    setProcessing(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Update the existing transaction to mark as issued
      const { error: updateError } = await supabase
        .from('store_credit_transactions')
        .update({
          transaction_type: 'refund_issued',
          check_number: checkNumber.trim(),
        })
        .eq('id', selectedRefund.id);

      if (updateError) throw updateError;

      // Decrease the pending refund balance on the company
      const { data: company } = await supabase
        .from('companies')
        .select('pending_refund_balance')
        .eq('id', selectedRefund.company_id)
        .single();

      const newBalance = Math.max(0, (company?.pending_refund_balance || 0) - selectedRefund.amount);

      await supabase
        .from('companies')
        .update({ pending_refund_balance: newBalance })
        .eq('id', selectedRefund.company_id);

      toast({
        title: 'Refund Issued',
        description: `Check #${checkNumber} for ${formatCurrency(selectedRefund.amount)} issued to ${selectedRefund.company_name}`,
      });

      setIssueDialogOpen(false);
      setSelectedRefund(null);
      setCheckNumber('');
      loadPendingRefunds();

    } catch (error: any) {
      console.error('Error issuing refund:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to issue refund',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const openIssueDialog = (refund: PendingRefund) => {
    setSelectedRefund(refund);
    setCheckNumber('');
    setIssueDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Pending Refunds
            </CardTitle>
            <DollarSign className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {formatCurrency(totalPending)}
            </div>
            <p className="text-xs text-muted-foreground">
              Awaiting check issuance
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Customers with Pending Refunds
            </CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{customerCount}</div>
            <p className="text-xs text-muted-foreground">
              Unique customers
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Refresh Button */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={loadPendingRefunds}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Pending Refunds Table */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Refunds</CardTitle>
          <CardDescription>
            Refunds that need to be issued via check
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingRefunds.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No pending refunds</p>
              <p className="text-sm">All refunds have been processed</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Source Order</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingRefunds.map((refund) => (
                  <TableRow key={refund.id}>
                    <TableCell className="font-medium">
                      {refund.company_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                        {formatCurrency(refund.amount)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(refund.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      {refund.source_order_number ? (
                        <Badge variant="secondary">{refund.source_order_number}</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        onClick={() => openIssueDialog(refund)}
                      >
                        Issue Refund
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Issue Refund Dialog */}
      <Dialog open={issueDialogOpen} onOpenChange={setIssueDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue Refund Check</DialogTitle>
          </DialogHeader>
          
          {selectedRefund && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer</span>
                  <span className="font-medium">{selectedRefund.company_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-bold text-primary">
                    {formatCurrency(selectedRefund.amount)}
                  </span>
                </div>
                {selectedRefund.source_order_number && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Source Order</span>
                    <span>{selectedRefund.source_order_number}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="checkNumber">Check Number</Label>
                <Input
                  id="checkNumber"
                  value={checkNumber}
                  onChange={(e) => setCheckNumber(e.target.value)}
                  placeholder="Enter check number"
                  autoFocus
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIssueDialogOpen(false)}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleIssueRefund}
              disabled={processing || !checkNumber.trim()}
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                'Mark as Issued'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
