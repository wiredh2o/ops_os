import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface CustomerShippingAddressCsvImporterProps {
  onImported: () => void;
}

export function CustomerShippingAddressCsvImporter({
  onImported,
}: CustomerShippingAddressCsvImporterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [replaceAll, setReplaceAll] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast.error("Please select a CSV file");
      return;
    }

    setIsImporting(true);
    try {
      const csvData = await file.text();

      const { data, error } = await supabase.functions.invoke(
        "import-customer-shipping-addresses-csv",
        {
          body: { csvData, replaceAll },
        }
      );

      if (error) throw error;

      toast.success(
        `Import complete: ${data.created} created, ${data.updated} updated, ${data.skipped} skipped`
      );

      if (data.errors && data.errors.length > 0) {
        console.warn("Import errors:", data.errors);
      }

      setIsOpen(false);
      setFile(null);
      setReplaceAll(false);
      onImported();
    } catch (error: any) {
      console.error("Import error:", error);
      toast.error("Failed to import shipping addresses: " + error.message);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="h-4 w-4 mr-2" />
          Import Addresses CSV
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Shipping Addresses from CSV</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">
              Upload a CSV file with shipping address data. The system will
              match by customer_number and address_name.
            </p>
            <Input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              disabled={isImporting}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="replaceAll"
              checked={replaceAll}
              onCheckedChange={(checked) => setReplaceAll(checked as boolean)}
              disabled={isImporting}
            />
            <Label htmlFor="replaceAll" className="text-sm cursor-pointer">
              Replace all addresses (removes addresses not in CSV)
            </Label>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isImporting}
            >
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={!file || isImporting}>
              {isImporting ? "Importing..." : "Import"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
