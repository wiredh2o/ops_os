import React, { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Phone,
  Package,
  Truck,
  Copy,
  ExternalLink,
  CheckCircle,
  Clock,
  Wrench,
  AlertCircle,
  FileText,
  User,
  Tag,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import { useAuth } from '@/hooks/useAuth';
import { canRequestRma, canReceiveRma } from '@/lib/rma';

// Interface matches the search_repair_items RPC function return type
interface RepairSearchResult {
  id: string;
  item_name: string;
  serial_number: string | null;
  mac_address: string | null;
  status: string;
  problem_reported: string | null;
  diagnosis: string | null;
  completion_outcome: string | null;
  customer_po: string | null;
  company_id: string | null;
  company_name: string | null;
  company_email: string | null;
  company_phone: string | null;
  package_id: string | null;
  tracking_number: string | null;
  outbound_tracking_number: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  logged: { label: "Logged", icon: <FileText className="h-3 w-3" />, className: "bg-muted text-muted-foreground" },
  diagnosed: { label: "Diagnosed", icon: <AlertCircle className="h-3 w-3" />, className: "bg-blue-500 text-white" },
  in_repair: { label: "In Repair", icon: <Wrench className="h-3 w-3" />, className: "bg-amber-500 text-white" },
  completed: { label: "Completed", icon: <CheckCircle className="h-3 w-3" />, className: "bg-green-500 text-white" },
  queued_for_shipping: { label: "Queued for Shipping", icon: <Package className="h-3 w-3" />, className: "bg-amber-600 text-white" },
  label_staged: { label: "Label Staged", icon: <Package className="h-3 w-3" />, className: "bg-indigo-500 text-white" },
  awaiting_pickup: { label: "Awaiting Pickup", icon: <Truck className="h-3 w-3" />, className: "bg-purple-600 text-white" },
  in_transit: { label: "In Transit", icon: <Truck className="h-3 w-3" />, className: "bg-cyan-600 text-white" },
  delivered: { label: "Delivered", icon: <CheckCircle className="h-3 w-3" />, className: "bg-emerald-600 text-white" },
  invoiced: { label: "Invoiced", icon: <FileText className="h-3 w-3" />, className: "bg-slate-500 text-white" },
};

export const RepairStatusLookup: React.FC<{ rmaId?: string }> = ({ rmaId }) => {
  const { roles, rolesLoading } = useAuth();
  const external = canRequestRma(roles) && !canReceiveRma(roles);
  const [rmaRepairs, setRmaRepairs] = useState<Array<{ id: string; item_name: string; serial_number?: string; status: string; completion_outcome?: string }>>([]);
  const [rmaError, setRmaError] = useState('');
  useEffect(() => {
    if (!rmaId) return;
    let cancelled = false;
    supabase.rpc('get_my_rma_repairs', { p_id: rmaId }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) { setRmaError('Unable to load repair status.'); return; }
      setRmaRepairs(Array.isArray(data) ? data as unknown as typeof rmaRepairs : []);
    });
    return () => { cancelled = true; };
  }, [rmaId]);
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<RepairSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const { toast } = useToast();

  // Debounced search
  const performSearch = useCallback(async (term: string) => {
    if (rmaId || rolesLoading || external) return;
    if (!term.trim() || term.length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);

    try {
      const { data, error } = await supabase.rpc("search_repair_items", {
        search_term: term.trim(),
      });

      if (error) throw error;
      setResults((data as RepairSearchResult[]) || []);
    } catch (error: any) {
      console.error("Search error:", error);
      toast({
        title: "Search Error",
        description: error.message || "Failed to search repair items",
        variant: "destructive",
      });
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [toast, rmaId, rolesLoading, external]);

  // Debounce effect
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, performSearch]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: `${label} copied to clipboard`,
    });
  };

  const openFedExTracking = (trackingNumber: string) => {
    window.open(
      `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
      "_blank"
    );
  };

  const getStatusBadge = (status: string) => {
    const config = STATUS_CONFIG[status] || {
      label: status,
      icon: null,
      className: "bg-muted text-muted-foreground",
    };

    return (
      <Badge className={`${config.className} flex items-center gap-1`}>
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  const formatDeliveryInfo = (result: RepairSearchResult) => {
    if (result.delivered_at) {
      return `Delivered ${format(new Date(result.delivered_at), "MMM d, yyyy 'at' h:mm a")}`;
    }
    return null;
  };

  if (rmaId) return <div className="space-y-3 border-t pt-3">
    {rmaError && <p role="alert" className="text-destructive">{rmaError}</p>}
    {!rmaError && rmaRepairs.length === 0 && <p className="text-sm text-muted-foreground">Repair items have not yet been logged.</p>}
    {rmaRepairs.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{item.item_name}{item.serial_number ? ` · ${item.serial_number}` : ''}</span><Badge variant="secondary">{item.completion_outcome || item.status}</Badge></div>)}
  </div>;
  if (external) return <div className="p-6"><Button asChild><a href="/rma">View my RMAs</a></Button></div>;
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Repair Status Lookup</h1>
          <p className="text-muted-foreground">
            Quick search for customer service inquiries
          </p>
        </div>
      </div>

      {/* Search Input */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search by serial #, MAC address, tracking #, customer name, PO#..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-12 text-lg"
              autoFocus
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Enter at least 2 characters to search. Results update as you type.
          </p>
        </CardContent>
      </Card>

      {/* Results */}
      {loading ? (
        <Card>
          <CardContent className="pt-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-12 w-12 rounded" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : hasSearched && results.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No results found</h3>
            <p className="text-muted-foreground">
              Try a different search term or check for typos
            </p>
          </CardContent>
        </Card>
      ) : results.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {results.length} Result{results.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Inbound Tracking</TableHead>
                    <TableHead>Outbound/Delivery</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result) => (
                    <React.Fragment key={result.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() =>
                          setExpandedItem(
                            expandedItem === result.id
                              ? null
                              : result.id
                          )
                        }
                      >
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium">{result.item_name}</p>
                            {result.serial_number && (
                              <p className="text-xs text-muted-foreground">
                                S/N: {result.serial_number}
                              </p>
                            )}
                            {result.mac_address && (
                              <p className="text-xs text-muted-foreground">
                                MAC: {result.mac_address}
                              </p>
                            )}
                            {result.customer_po && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Tag className="h-3 w-3" />
                                PO#: {result.customer_po}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(result.status)}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {result.company_name && (
                              <p className="font-medium flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {result.company_name}
                              </p>
                            )}
                            {result.company_phone && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {result.company_phone}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {result.tracking_number ? (
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-sm">
                                {result.tracking_number}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyToClipboard(
                                    result.tracking_number!,
                                    "Inbound tracking"
                                  );
                                }}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {result.outbound_tracking_number ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1">
                                <span className="font-mono text-sm">
                                  {result.outbound_tracking_number}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyToClipboard(
                                      result.outbound_tracking_number!,
                                      "Outbound tracking"
                                    );
                                  }}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openFedExTracking(result.outbound_tracking_number!);
                                  }}
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                              </div>
                              {formatDeliveryInfo(result) && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatDeliveryInfo(result)}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">
                              Not yet shipped
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm">
                            {expandedItem === result.id
                              ? "Less"
                              : "More"}
                          </Button>
                        </TableCell>
                      </TableRow>

                      {/* Expanded Details Row */}
                      {expandedItem === result.id && (
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={6} className="p-4">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                              <div>
                                <p className="text-muted-foreground text-xs uppercase mb-1">
                                  Problem Reported
                                </p>
                                <p>{result.problem_reported || "Not specified"}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground text-xs uppercase mb-1">
                                  Diagnosis
                                </p>
                                <p>{result.diagnosis || "Pending"}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground text-xs uppercase mb-1">
                                  Outcome
                                </p>
                                <p className="capitalize">
                                  {result.completion_outcome?.replace(/_/g, " ") ||
                                    "In progress"}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground text-xs uppercase mb-1">
                                  Customer Email
                                </p>
                                <p>{result.company_email || "—"}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground text-xs uppercase mb-1">
                                  Received
                                </p>
                                <p>
                                  {format(
                                    new Date(result.created_at),
                                    "MMM d, yyyy"
                                  )}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground text-xs uppercase mb-1">
                                  Last Updated
                                </p>
                                <p>
                                  {formatDistanceToNow(
                                    new Date(result.updated_at),
                                    { addSuffix: true }
                                  )}
                                </p>
                              </div>
                              {result.customer_po && (
                                <div>
                                  <p className="text-muted-foreground text-xs uppercase mb-1">
                                    Customer PO#
                                  </p>
                                  <p className="font-medium">{result.customer_po}</p>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      ) : null}

      {/* Quick Reference */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Status Reference</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <Badge key={key} className={`${config.className} flex items-center gap-1`}>
                {config.icon}
                {config.label}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RepairStatusLookup;
