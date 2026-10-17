import { Button } from "@/components/ui/button";
import { Edit3, Loader2, RotateCcw, Save, X } from "lucide-react";

interface PackingEditToolbarProps {
  isEditing: boolean;
  onToggleEdit: () => void;
  onReset: () => void;
  onSave: () => void;
  hasChanges: boolean;
  isSaving?: boolean;
}

export function PackingEditToolbar({
  isEditing,
  onToggleEdit,
  onReset,
  onSave,
  hasChanges,
  isSaving = false,
}: PackingEditToolbarProps) {
  if (!isEditing) {
    return (
      <Button variant="outline" size="sm" onClick={onToggleEdit} className="gap-1.5">
        <Edit3 className="h-3.5 w-3.5" />
        Customize Packing
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={onReset} disabled={isSaving} className="gap-1.5">
        <RotateCcw className="h-3.5 w-3.5" />
        Reset
      </Button>
      <Button
        size="sm"
        onClick={onSave}
        disabled={!hasChanges || isSaving}
        className="gap-1.5"
      >
        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        {isSaving ? "Saving…" : "Save"}
      </Button>
      <Button variant="ghost" size="sm" onClick={onToggleEdit}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
