import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Building2, Package } from "lucide-react";

interface BulkPackageAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packageCount: number;
  companyName: string;
  onConfirm: () => void;
}

export function BulkPackageAssignmentDialog({
  open,
  onOpenChange,
  packageCount,
  companyName,
  onConfirm,
}: BulkPackageAssignmentDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Confirm Bulk Assignment
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3 pt-2">
            <div className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4" />
              <span>
                You are about to assign <strong>{packageCount}</strong> package
                {packageCount !== 1 ? "s" : ""} to:
              </span>
            </div>
            <div className="rounded-md bg-muted p-3 font-medium text-foreground">
              {companyName}
            </div>
            <p className="text-sm">This action will update all selected packages at once.</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Confirm Assignment</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
