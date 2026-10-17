import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Download, FileSpreadsheet } from "lucide-react";
import { UnifiedInventoryExporter } from "./UnifiedInventoryExporter";
import { UnifiedInventoryImporter } from "./UnifiedInventoryImporter";

interface Props {
  onDataChange?: () => void;
}

export function InventoryManagementActions({ onDataChange }: Props) {
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);

  return (
    <>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setShowImport(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Import XLSX
        </Button>

        <Button variant="outline" onClick={() => setShowExport(true)}>
          <Download className="h-4 w-4 mr-2" />
          Export XLSX
        </Button>
      </div>

      <UnifiedInventoryExporter
        open={showExport}
        onClose={() => setShowExport(false)}
      />

      <UnifiedInventoryImporter
        open={showImport}
        onClose={() => setShowImport(false)}
        onDataChange={onDataChange}
      />
    </>
  );
}
