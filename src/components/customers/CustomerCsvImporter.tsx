import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ImportStripeDialog } from "./ImportStripeDialog";

interface CustomerCsvImporterProps {
  onImported: () => void;
}

export function CustomerCsvImporter({ onImported }: CustomerCsvImporterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [showStripeDialog, setShowStripeDialog] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors?: string[];
  } | null>(null);
  const [newCustomerIds, setNewCustomerIds] = useState<string[]>([]);

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
      
      const { data: result, error } = await supabase.functions.invoke('import-customer-csv', {
        body: { csvData, updateExisting: true }
      });

      if (error) throw error;

      if (result.success) {
        // Store results for the Stripe dialog
        setImportResult({
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          errors: result.errors,
        });
        setNewCustomerIds(result.newCustomerIds || []);
        
        // Close import dialog and show Stripe dialog
        setIsOpen(false);
        setFile(null);
        setShowStripeDialog(true);
      } else {
        throw new Error(result.error || 'Import failed');
      }
    } catch (error: any) {
      console.error("Import error:", error);
      toast.error("Import failed: " + error.message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleStripeDialogClose = () => {
    setShowStripeDialog(false);
    setImportResult(null);
    setNewCustomerIds([]);
    onImported();
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Customers from CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                Upload a CSV file with customer data. Records with matching customer_number will be updated; others will be created as new customers.
              </p>
              <Input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                disabled={isImporting}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isImporting}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={!file || isImporting}>
                {isImporting ? "Importing..." : "Import"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {importResult && (
        <ImportStripeDialog
          open={showStripeDialog}
          onClose={handleStripeDialogClose}
          importResult={importResult}
          newCustomerIds={newCustomerIds}
        />
      )}
    </>
  );
}
