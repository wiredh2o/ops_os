import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export type CarrierStatusMap = Record<string, { available: boolean; error?: string }>;

const NAMES: Record<string, string> = { fedex: "FedEx", ups: "UPS", usps: "USPS" };

/** Lists carriers whose live rates could not be obtained, with the reason. */
export function carrierFailures(statuses: CarrierStatusMap) {
  return Object.entries(statuses || {})
    .filter(([, s]) => s && s.available === false)
    .map(([carrier, s]) => ({ carrier, name: NAMES[carrier] || carrier.toUpperCase(), error: s.error || "Unknown error" }));
}

export function CarrierRateErrors({ statuses }: { statuses: CarrierStatusMap }) {
  const failures = carrierFailures(statuses);
  if (failures.length === 0) return null;
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>
        {failures.length === 1 ? `${failures[0].name} rates unavailable` : "Some carrier rates unavailable"}
      </AlertTitle>
      <AlertDescription>
        <ul className="mt-1 space-y-1 text-sm">
          {failures.map((f) => (
            <li key={f.carrier}><span className="font-semibold">{f.name}:</span> {f.error}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs">No rates are shown for these carriers.</p>
      </AlertDescription>
    </Alert>
  );
}
