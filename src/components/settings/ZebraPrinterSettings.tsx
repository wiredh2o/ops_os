import { useState } from "react";
import { Printer, ChevronDown, ChevronUp, CheckCircle2, XCircle, Loader2, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  buildTestLabelZpl,
  checkZebraService,
  getDefaultPrinter,
  sendZplToPrinter,
  type ZebraPrinter,
  type ZebraServiceInfo,
} from "@/lib/zebra-browser-print";

export function ZebraPrinterSettings() {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [service, setService] = useState<ZebraServiceInfo | null>(null);
  const [printer, setPrinter] = useState<ZebraPrinter | null>(null);

  const check = async () => {
    setChecking(true);
    setPrinter(null);
    try {
      const info = await checkZebraService();
      setService(info);
      if (info.available && info.baseUrl) {
        const p = await getDefaultPrinter(info.baseUrl);
        setPrinter(p);
      }
    } catch (err) {
      setService({ available: false, error: (err as Error).message });
    } finally {
      setChecking(false);
    }
  };

  const authorize = () => {
    // Opens Zebra's local service directly so the browser shows its
    // certificate warning; accepting it trusts the service for this browser.
    window.open("https://localhost:9101/available", "_blank", "noopener");
  };

  const printTest = async () => {
    if (!service?.baseUrl || !printer) return;
    setPrinting(true);
    try {
      await sendZplToPrinter(service.baseUrl, printer, buildTestLabelZpl());
      toast({ title: "Test label sent", description: `Printed to ${printer.name}.` });
    } catch (err) {
      toast({ title: "Print failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Printer className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-lg">Label Printer (Zebra)</CardTitle>
                  <CardDescription>
                    Direct raw-ZPL printing through Zebra Browser Print — no print dialog, true 203 DPI barcodes.
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {service?.available && printer ? (
                  <Badge>Connected</Badge>
                ) : service && !service.available ? (
                  <Badge variant="secondary">Not detected</Badge>
                ) : null}
                {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              With Zebra Browser Print running on this computer and your ZP 500 set as its default device, labels
              print instantly as native Zebra commands. On computers without it, the app falls back to standard
              PDF printing.
            </p>

            <div className="flex items-center gap-3">
              <Button onClick={check} disabled={checking} size="sm">
                {checking && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Check connection
              </Button>
              {service?.available && printer && (
                <Button onClick={printTest} disabled={printing} size="sm" variant="outline">
                  {printing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Print test label
                </Button>
              )}
            </div>

            <p className="text-sm">
              Working on FedEx label certification?{" "}
              <a href="/fedex-cert-labels" className="text-primary underline">
                Generate the test label set
              </a>
              .
            </p>

            {service && (
              <div className="flex items-start gap-2 text-sm border rounded-lg p-3">
                {service.available && printer ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600 shrink-0" />
                    <div>
                      <p>
                        Zebra Browser Print is running. Default printer: <strong>{printer.name}</strong>
                        {printer.connection ? ` (${printer.connection})` : ""}.
                      </p>
                      <p className="text-muted-foreground">
                        Print a test label to confirm the full path from the app to the printer.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                    <p>{service.error}</p>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
