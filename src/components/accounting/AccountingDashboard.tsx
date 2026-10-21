import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, DollarSign, CreditCard, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { FieldGuard } from "@/components/permissions/FieldGuard";
import { formatCurrency } from "@/lib/utils";

interface Account {
  id: string;
  name: string;
  account_type: string | null;
  account_subtype: string | null;
  account_number: string | null;
  description: string | null;
  current_balance: number | null;
  is_active: boolean;
  company_id?: string;
}

interface Transaction {
  id: string;
  transaction_date: string;
  description: string;
  total_amount: number;
  transaction_type: string;
  is_reconciled: boolean;
  reference_number: string | null;
}

export const AccountingDashboard = () => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (user) {
      initializeAccountsAndFetchData();
    }
  }, [user]);

  const initializeAccountsAndFetchData = async () => {
    try {
      setLoading(true);
      
      // Check if accounts exist
      const { data: existingAccounts } = await supabase
        .from("accounts")
        .select("*");

      // If no accounts exist, create default ones
      if (!existingAccounts || existingAccounts.length === 0) {
        await createDefaultAccounts();
      }

      // Fetch all data
      await fetchData();
    } catch (error) {
      console.error('Error initializing accounts:', error);
      toast.error('Failed to initialize accounting system');
    } finally {
      setLoading(false);
    }
  };

  const createDefaultAccounts = async () => {
    const defaultAccounts = [
      { name: 'Checking Account', account_type: 'asset' as const, account_subtype: 'checking' as const, account_number: '1000', description: 'Primary checking account' },
      { name: 'Credit Card', account_type: 'liability' as const, account_subtype: 'credit_card' as const, account_number: '2000', description: 'Business credit card' },
      { name: 'Inventory', account_type: 'asset' as const, account_subtype: 'inventory' as const, account_number: '1200', description: 'Inventory asset account' },
      { name: 'Accounts Receivable', account_type: 'asset' as const, account_subtype: 'accounts_receivable' as const, account_number: '1100', description: 'Money owed by customers' },
      { name: 'Sales Revenue', account_type: 'income' as const, account_subtype: 'sales' as const, account_number: '4000', description: 'Sales income' },
      { name: 'Cost of Goods Sold', account_type: 'expense' as const, account_subtype: 'cost_of_goods_sold' as const, account_number: '5000', description: 'Direct costs of goods sold' },
      { name: 'Operating Expenses', account_type: 'expense' as const, account_subtype: 'operating_expenses' as const, account_number: '6000', description: 'General operating expenses' }
    ];

    for (const account of defaultAccounts) {
      await supabase
        .from("accounts")
        .insert({ ...account, created_by: user?.id || '' });
    }

    toast.success('Default accounts created successfully');
  };

  const fetchData = async () => {
    try {
      // Fetch accounts using secure view
      const { data: accountsData, error: accountsError } = await supabase
        .from("accounts_secure")
        .select("*")
        .order("name");

      if (accountsError) throw accountsError;
      setAccounts(accountsData || []);

      // Fetch recent transactions
      const { data: transactionsData, error: transactionsError } = await supabase
        .from("transactions")
        .select("*")
        .order("transaction_date", { ascending: false })
        .limit(50);

      if (transactionsError) throw transactionsError;
      setTransactions(transactionsData || []);

    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to fetch accounting data');
    }
  };


  const getAccountTypeColor = (type: string) => {
    switch (type) {
      case 'asset': return 'bg-green-500/10 text-green-700 border-green-500/20';
      case 'liability': return 'bg-red-500/10 text-red-700 border-red-500/20';
      case 'equity': return 'bg-blue-500/10 text-blue-700 border-blue-500/20';
      case 'income': return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20';
      case 'expense': return 'bg-orange-500/10 text-orange-700 border-orange-500/20';
      default: return 'bg-gray-500/10 text-gray-700 border-gray-500/20';
    }
  };

  const filteredAccounts = accounts.filter(account =>
    account.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (account.account_type?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false) ||
    (account.account_subtype?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
  );

  const filteredTransactions = transactions.filter(transaction =>
    transaction.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    transaction.transaction_type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate summary statistics
  const totalAssets = accounts
    .filter(acc => acc.account_type === 'asset')
    .reduce((sum, acc) => sum + (acc.current_balance || 0), 0);

  const totalLiabilities = accounts
    .filter(acc => acc.account_type === 'liability')
    .reduce((sum, acc) => sum + (acc.current_balance || 0), 0);

  const netWorth = totalAssets - totalLiabilities;

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading accounting data...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold">Accounting Dashboard</h2>
        <div className="flex gap-2">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Transaction
          </Button>
          <Button variant="outline">
            <Building2 className="w-4 h-4 mr-2" />
            Reconcile
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600"><FinancialGuard kind="margin">{formatCurrency(totalAssets)}</FinancialGuard></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Liabilities</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600"><FinancialGuard kind="margin">{formatCurrency(totalLiabilities)}</FinancialGuard></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Worth</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netWorth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              <FinancialGuard kind="margin">{formatCurrency(netWorth)}</FinancialGuard>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mb-4">
        <Input
          placeholder="Search accounts or transactions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-md"
        />
      </div>

      <Tabs defaultValue="accounts" className="w-full">
        <TabsList>
          <TabsTrigger value="accounts">Chart of Accounts</TabsTrigger>
          <TabsTrigger value="transactions">Recent Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Chart of Accounts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredAccounts.map((account) => (
                  <div key={account.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <FieldGuard 
                        tableName="accounts" 
                        columnName="account_number" 
                        targetCompanyId={account.company_id}
                        fallback={<div className="text-sm text-muted-foreground">•••</div>}
                      >
                        <div className="text-sm text-muted-foreground">
                          {account.account_number}
                        </div>
                      </FieldGuard>
                      <div>
                        <h3 className="font-medium">{account.name}</h3>
                        <p className="text-sm text-muted-foreground">{account.description}</p>
                      </div>
                      <FieldGuard 
                        tableName="accounts" 
                        columnName="account_type" 
                        targetCompanyId={account.company_id}
                        fallback={<Badge variant="outline">Hidden</Badge>}
                      >
                        {account.account_type && (
                          <Badge className={getAccountTypeColor(account.account_type)}>
                            {account.account_type}
                          </Badge>
                        )}
                      </FieldGuard>
                      <FieldGuard 
                        tableName="accounts" 
                        columnName="account_subtype" 
                        targetCompanyId={account.company_id}
                        fallback={<Badge variant="outline">Hidden</Badge>}
                      >
                        {account.account_subtype && (
                          <Badge variant="outline">
                            {account.account_subtype.replace('_', ' ')}
                          </Badge>
                        )}
                      </FieldGuard>
                    </div>
                    <div className="text-right">
                      <FieldGuard 
                        tableName="accounts" 
                        columnName="current_balance" 
                        targetCompanyId={account.company_id}
                        fallback={<div className="text-lg font-semibold text-muted-foreground">Hidden</div>}
                      >
                        <div className={`text-lg font-semibold ${
                          (account.current_balance || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {formatCurrency(account.current_balance || 0)}
                        </div>
                      </FieldGuard>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredTransactions.map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="text-sm text-muted-foreground">
                        {new Date(transaction.transaction_date).toLocaleDateString()}
                      </div>
                      <div>
                        <h3 className="font-medium">{transaction.description}</h3>
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline">
                            {transaction.transaction_type.replace('_', ' ')}
                          </Badge>
                          {transaction.is_reconciled && (
                            <Badge className="bg-green-500/10 text-green-700 border-green-500/20">
                              Reconciled
                            </Badge>
                          )}
                          {transaction.reference_number && (
                            <span className="text-sm text-muted-foreground">
                              Ref: {transaction.reference_number}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-semibold ${
                        transaction.total_amount >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {formatCurrency(transaction.total_amount)}
                      </div>
                    </div>
                  </div>
                ))}
                {filteredTransactions.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No transactions found
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};