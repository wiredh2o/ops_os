import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, RefreshCw, CheckCircle, AlertCircle, HelpCircle, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { StripeCustomerLink } from "./StripeCustomerLink";

interface SyncResults {
  auto_matched: { company_id: string; company_name: string; stripe_id: string; stripe_name: string; match_type: string }[];
  needs_review: { company_id: string; company_name: string; candidates: { stripe_id: string; stripe_name: string; score: number }[] }[];
  no_match: { company_id: string; company_name: string }[];
}

export function StripeCustomerSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [results, setResults] = useState<SyncResults | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<{ id: string; name: string } | null>(null);
  const { toast } = useToast();

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-stripe-customers');

      if (error) throw error;
      setResults(data);
      
      toast({
        title: "Sync complete",
        description: `${data.auto_matched.length} matched, ${data.needs_review.length} need review, ${data.no_match.length} not found`,
      });
    } catch (error: any) {
      toast({
        title: "Sync failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleReviewLink = async (companyId: string, stripeId: string) => {
    try {
      const company = results?.needs_review.find(c => c.company_id === companyId);
      if (!company) return;

      const { error } = await supabase.functions.invoke('link-stripe-customer', {
        body: {
          company_id: companyId,
          stripe_customer_id: stripeId,
        }
      });

      if (error) throw error;

      // Update results to remove this item from needs_review
      setResults(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          needs_review: prev.needs_review.filter(c => c.company_id !== companyId),
          auto_matched: [...prev.auto_matched, {
            company_id: companyId,
            company_name: company.company_name,
            stripe_id: stripeId,
            stripe_name: company.candidates.find(c => c.stripe_id === stripeId)?.stripe_name || '',
            match_type: 'manual',
          }],
        };
      });

      toast({
        title: "Customer linked",
        description: `${company.company_name} linked to Stripe`,
      });
    } catch (error: any) {
      toast({
        title: "Link failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Stripe Customer Sync</h3>
          <p className="text-sm text-muted-foreground">
            Automatically match customers with their Stripe accounts
          </p>
        </div>
        <Button onClick={handleSync} disabled={isSyncing}>
          {isSyncing ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Sync with Stripe
        </Button>
      </div>

      {results && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Auto-Matched
              </CardTitle>
              <CardDescription>{results.auto_matched.length} customers</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-48">
                <div className="space-y-2">
                  {results.auto_matched.map((match) => (
                    <div key={match.company_id} className="text-sm p-2 bg-green-50 dark:bg-green-950 rounded">
                      <p className="font-medium">{match.company_name}</p>
                      <p className="text-xs text-muted-foreground">→ {match.stripe_name}</p>
                      <Badge variant="secondary" className="text-xs mt-1">{match.match_type}</Badge>
                    </div>
                  ))}
                  {results.auto_matched.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No auto-matches</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-yellow-500" />
                Needs Review
              </CardTitle>
              <CardDescription>{results.needs_review.length} customers</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-48">
                <div className="space-y-2">
                  {results.needs_review.map((item) => (
                    <div key={item.company_id} className="text-sm p-2 bg-yellow-50 dark:bg-yellow-950 rounded">
                      <p className="font-medium">{item.company_name}</p>
                      <div className="mt-1 space-y-1">
                        {item.candidates.slice(0, 2).map((candidate) => (
                          <div key={candidate.stripe_id} className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground truncate">
                              {candidate.stripe_name}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2"
                              onClick={() => handleReviewLink(item.company_id, candidate.stripe_id)}
                            >
                              <Link2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {results.needs_review.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No items need review</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                Not in Stripe
              </CardTitle>
              <CardDescription>{results.no_match.length} customers</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-48">
                <div className="space-y-2">
                  {results.no_match.map((item) => (
                    <div
                      key={item.company_id}
                      className="text-sm p-2 bg-red-50 dark:bg-red-950 rounded flex items-center justify-between"
                    >
                      <span className="font-medium truncate">{item.company_name}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2"
                        onClick={() => setSelectedCompany({ id: item.company_id, name: item.company_name })}
                      >
                        Link
                      </Button>
                    </div>
                  ))}
                  {results.no_match.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">All customers matched</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}

      {selectedCompany && (
        <StripeCustomerLink
          open={true}
          onClose={() => setSelectedCompany(null)}
          company={selectedCompany}
          onSuccess={() => {
            // Remove from no_match
            setResults(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                no_match: prev.no_match.filter(c => c.company_id !== selectedCompany.id),
              };
            });
          }}
        />
      )}
    </div>
  );
}
