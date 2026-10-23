import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Loader2, Printer, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  checkZebraService,
  getDefaultPrinter,
  sendZplToPrinter,
  type ZebraServiceInfo,
} from "@/lib/zebra-browser-print";

interface LabelResult {
  trackingNumber: string;
  sequence: number;
  totalPieces: number;
  zplBase64: string;
}

interface ScenarioResult {
  scenario: string;
  service: string;
  labels: LabelResult[];
  error?: string;
}

interface AddressForm {
  name: string;
  company: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  postal_code: string;
  phone: string;
}

const emptyAddress: AddressForm = {
  name: "",
  company: "",
  street: "",
  street2: "",
  city: "",
  state: "",
  postal_code: "",
  phone: "",
};

function AddressFields({
  title,
  value,
  onChange,
}: {
  title: string;
  value: AddressForm;
  onChange: (v: AddressForm) => void;
}) {
  const set = (k: keyof AddressForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.value });
  return (
    <div className="space-y-3">
      <h4 className="font-medium">{title}</h4>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label>Contact name</Label>
          <Input value={value.name} onChange={set("name")} />
        </div>
        <div className="grid gap-1.5">
          <Label>Company</Label>
          <Input value={value.company} onChange={set("company")} />
        </div>
        <div className="grid gap-1.5 col-span-2">
          <Label>Street</Label>
          <Input value={value.street} onChange={set("street")} />
        </div>
        <div className="grid gap-1.5 col-span-2">
          <Label>Street 2 (optional)</Label>
          <Input value={value.street2} onChange={set("street2")} />
        </div>
        <div className="grid gap-1.5">
          <Label>City</Label>
          <Input value={value.city} onChange={set("city")} />
        </div>
        <div className="grid gap-1.5">
          <Label>State</Label>
          <Input value={value.state} onChange={set("state")} maxLength={2} />
        </div>
        <div className="grid gap-1.5">
          <Label>ZIP</Label>
          <Input value={value.postal_code} onChange={set("postal_code")} />
        </div>
        <div className="grid gap-1.5">
          <Label>Phone (real 10-digit)</Label>
          <Input value={value.phone} onChange={set("phone")} />
        </div>
      </div>
    </div>
  );
}

export default function FedExCertLabels() {
  const navigate = useNavigate();
  const [shipFrom, setShipFrom] = useState<AddressForm>(emptyAddress);
  const [shipTo, setShipTo] = useState<AddressForm>(emptyAddress);
  const [weight, setWeight] = useState("5");
  const [dims, setDims] = useState({ length: "12", width: "9", height: "6" });
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ScenarioResult[] | null>(null);
  const [zebra, setZebra] = useState<ZebraServiceInfo | null>(null);
  const [printingKey, setPrintingKey] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setResults(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-fedex-test-labels", {
        body: {
          ship_from: shipFrom,
          ship_to: shipTo,
          weight_lbs: Number(weight),
          dimensions: { length: Number(dims.length), width: Number(dims.width), height: Number(dims.height) },
        },
      });
      if (error) {
        let msg = error.message;
        try {
          msg = (await (error as any).context?.json())?.error ?? msg;
        } catch {
          /* keep */
        }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      setResults(data.results as ScenarioResult[]);
      // Check for a Zebra printer in the background so the Print buttons appear.
      checkZebraService().then(setZebra);
    } catch (err) {
      toast({ title: "Could not generate labels", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const download = (label: LabelResult, scenario: string) => {
    const binary = atob(label.zplBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fedex-cert-${scenario.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-piece-${label.sequence}-of-${label.totalPieces}.zpl`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printToZebra = async (label: LabelResult) => {
    const key = `${label.trackingNumber}-${label.sequence}`;
    setPrintingKey(key);
    try {
      const info = zebra?.available ? zebra : await checkZebraService();
      setZebra(info);
      if (!info.available || !info.baseUrl) throw new Error(info.error ?? "Zebra Browser Print not detected.");
      const printer = await getDefaultPrinter(info.baseUrl);
      await sendZplToPrinter(info.baseUrl, printer, atob(label.zplBase64));
      toast({ title: "Label sent", description: `Piece ${label.sequence} of ${label.totalPieces} printed to ${printer.name}.` });
    } catch (err) {
      toast({ title: "Print failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setPrintingKey(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Settings
        </Button>
        <div>
          <h1 className="text-2xl font-bold">FedEx Label Certification</h1>
          <p className="text-sm text-muted-foreground">
            Generates sandbox test labels for the FedEx Bar Code Analysis packet. Nothing is saved to your
            database — the labels exist only on this page.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Test shipment details</CardTitle>
          <CardDescription>
            Use real addresses and real 10-digit phone numbers — FedEx reviewers check the label text against the
            cover sheet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <AddressFields title="Ship from" value={shipFrom} onChange={setShipFrom} />
          <AddressFields title="Ship to" value={shipTo} onChange={setShipTo} />
          <div className="grid grid-cols-4 gap-3">
            <div className="grid gap-1.5">
              <Label>Weight (lb)</Label>
              <Input type="number" min="1" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Length (in)</Label>
              <Input type="number" min="1" value={dims.length} onChange={(e) => setDims({ ...dims, length: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Width (in)</Label>
              <Input type="number" min="1" value={dims.width} onChange={(e) => setDims({ ...dims, width: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Height (in)</Label>
              <Input type="number" min="1" value={dims.height} onChange={(e) => setDims({ ...dims, height: e.target.value })} />
            </div>
          </div>
          <Button onClick={generate} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Generate certification labels
          </Button>
        </CardContent>
      </Card>

      {results && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Generated labels</CardTitle>
            <CardDescription>
              Print each label on the ZP 500 (or download the .zpl files), then scan the printed labels at 600 DPI
              for the FedEx submission.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {results.map((r) => (
              <div key={r.scenario} className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h5 className="font-medium">{r.scenario}</h5>
                  {r.error ? null : (
                    <span className="text-sm text-muted-foreground">
                      {r.labels.length} label{r.labels.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                {r.error ? (
                  <div className="flex items-start gap-2 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <p>{r.error}</p>
                  </div>
                ) : (
                  r.labels.map((label) => {
                    const key = `${label.trackingNumber}-${label.sequence}`;
                    return (
                      <div key={key} className="flex items-center justify-between gap-3 text-sm border-t pt-2">
                        <div>
                          <p className="font-mono">{label.trackingNumber}</p>
                          <p className="text-muted-foreground">
                            Piece {label.sequence} of {label.totalPieces}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => printToZebra(label)}
                            disabled={printingKey === key}
                          >
                            {printingKey === key ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Printer className="h-4 w-4 mr-1" />
                            )}
                            Print to Zebra
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => download(label, r.scenario)}>
                            <Download className="h-4 w-4 mr-1" /> .zpl
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
