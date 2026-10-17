import { toast } from "@/hooks/use-toast";

// Standardized toast messages with 3-second auto-dismiss
export const showToast = {
  success: (title: string, description?: string) => {
    toast({
      title,
      description,
      variant: "default",
      duration: 3000,
    });
  },

  error: (title: string, description?: string) => {
    toast({
      title,
      description,
      variant: "destructive",
      duration: 3000,
    });
  },

  info: (title: string, description?: string) => {
    toast({
      title,
      description,
      variant: "default",
      duration: 3000,
    });
  },

  // Pre-configured common messages
  saveSuccess: (itemName: string = "Item") => {
    showToast.success("Success", `${itemName} saved successfully`);
  },

  saveError: (itemName: string = "Item") => {
    showToast.error("Error", `Failed to save ${itemName.toLowerCase()}`);
  },

  deleteSuccess: (itemName: string = "Item") => {
    showToast.success("Success", `${itemName} deleted successfully`);
  },

  deleteError: (itemName: string = "Item") => {
    showToast.error("Error", `Failed to delete ${itemName.toLowerCase()}`);
  },

  updateSuccess: (itemName: string = "Item") => {
    showToast.success("Success", `${itemName} updated successfully`);
  },

  updateError: (itemName: string = "Item") => {
    showToast.error("Error", `Failed to update ${itemName.toLowerCase()}`);
  },

  createSuccess: (itemName: string = "Item") => {
    showToast.success("Success", `${itemName} created successfully`);
  },

  createError: (itemName: string = "Item") => {
    showToast.error("Error", `Failed to create ${itemName.toLowerCase()}`);
  },

  loadError: (itemName: string = "data") => {
    showToast.error("Error", `Failed to load ${itemName.toLowerCase()}`);
  },

  permissionError: () => {
    showToast.error("Error", "You do not have permission to perform this action");
  },

  validationError: (message: string) => {
    showToast.error("Validation Error", message);
  },

  uploadSuccess: () => {
    showToast.success("Success", "File uploaded successfully");
  },

  uploadError: () => {
    showToast.error("Error", "Failed to upload file");
  }
};