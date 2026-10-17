import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BomComponent {
  id?: string;
  component_item_id: string;
  component_sku?: string;
  component_description?: string;
  quantity_needed: number;
  waste_factor: number;
  unit_cost?: number;
  isNew?: boolean;
  isDeleted?: boolean;
}

interface InventoryItemBomEditorProps {
  inventoryItemId?: string;
  components: BomComponent[];
  onComponentsChange: (components: BomComponent[]) => void;
  currentItemId?: string; // To prevent self-reference
}

interface InventoryItemOption {
  id: string;
  sku: string;
  sales_description: string | null;
  unit_cost: number | null;
}

export const InventoryItemBomEditor = ({
  inventoryItemId,
  components,
  onComponentsChange,
  currentItemId,
}: InventoryItemBomEditorProps) => {
  const [inventoryItems, setInventoryItems] = useState<InventoryItemOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [openPopoverIndex, setOpenPopoverIndex] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  // Fetch available inventory items
  useEffect(() => {
    const fetchInventoryItems = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("inventory_items")
          .select("id, sku, sales_description, unit_cost")
          .eq("is_active", true)
          .order("sku");

        if (error) throw error;
        setInventoryItems(data || []);
      } catch (error) {
        console.error("Error fetching inventory items:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchInventoryItems();
  }, []);

  // Load existing BOM components when editing
  useEffect(() => {
    if (inventoryItemId) {
      loadBomComponents();
    }
  }, [inventoryItemId]);

  const loadBomComponents = async () => {
    if (!inventoryItemId) return;

    try {
      const { data, error } = await supabase
        .from("inventory_item_components")
        .select(`
          id,
          component_item_id,
          quantity_needed,
          waste_factor,
          component:inventory_items!inventory_item_components_component_item_id_fkey (
            sku,
            sales_description,
            unit_cost
          )
        `)
        .eq("inventory_item_id", inventoryItemId);

      if (error) throw error;

      if (data) {
        const loadedComponents: BomComponent[] = data.map((item: any) => ({
          id: item.id,
          component_item_id: item.component_item_id,
          component_sku: item.component?.sku,
          component_description: item.component?.sales_description,
          quantity_needed: item.quantity_needed,
          waste_factor: item.waste_factor || 0,
          unit_cost: item.component?.unit_cost,
        }));
        onComponentsChange(loadedComponents);
      }
    } catch (error) {
      console.error("Error loading BOM components:", error);
    }
  };

  const addComponent = () => {
    onComponentsChange([
      ...components,
      {
        component_item_id: "",
        quantity_needed: 1,
        waste_factor: 0,
        isNew: true,
      },
    ]);
  };

  const updateComponent = (index: number, updates: Partial<BomComponent>) => {
    const updated = [...components];
    updated[index] = { ...updated[index], ...updates };
    onComponentsChange(updated);
  };

  const removeComponent = (index: number) => {
    const updated = [...components];
    if (updated[index].id) {
      // Mark existing component for deletion
      updated[index] = { ...updated[index], isDeleted: true };
    } else {
      // Remove new component entirely
      updated.splice(index, 1);
    }
    onComponentsChange(updated);
  };

  const selectComponent = (index: number, item: InventoryItemOption) => {
    updateComponent(index, {
      component_item_id: item.id,
      component_sku: item.sku,
      component_description: item.sales_description || undefined,
      unit_cost: item.unit_cost || undefined,
    });
    setOpenPopoverIndex(null);
    setSearchTerm("");
  };

  // Filter out items that are already in the BOM and the current item itself
  const getAvailableItems = () => {
    const usedIds = components
      .filter((c) => !c.isDeleted)
      .map((c) => c.component_item_id);

    return inventoryItems.filter(
      (item) =>
        !usedIds.includes(item.id) &&
        item.id !== currentItemId &&
        (searchTerm === "" ||
          item.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (item.sales_description?.toLowerCase() || "").includes(
            searchTerm.toLowerCase()
          ))
    );
  };

  const calculateExtendedCost = (component: BomComponent) => {
    if (!component.unit_cost) return 0;
    return (
      component.unit_cost *
      component.quantity_needed *
      (1 + component.waste_factor)
    );
  };

  const calculateTotalBomCost = () => {
    return components
      .filter((c) => !c.isDeleted)
      .reduce((total, c) => total + calculateExtendedCost(c), 0);
  };

  const activeComponents = components.filter((c) => !c.isDeleted);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Label className="text-base font-medium">Production BOM Components</Label>
        <Button type="button" variant="outline" size="sm" onClick={addComponent}>
          <Plus className="h-4 w-4 mr-1" />
          Add Component
        </Button>
      </div>

      {activeComponents.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border rounded-md">
          No components added. Click "Add Component" to define the BOM.
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 text-sm font-medium">Component</th>
                <th className="text-right p-3 text-sm font-medium w-24">Qty Needed</th>
                <th className="text-right p-3 text-sm font-medium w-28">Waste Factor %</th>
                <th className="text-right p-3 text-sm font-medium w-24">Unit Cost</th>
                <th className="text-right p-3 text-sm font-medium w-28">Extended Cost</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {components.map((component, index) =>
                component.isDeleted ? null : (
                  <tr key={index} className="border-t">
                    <td className="p-2">
                      <Popover
                        open={openPopoverIndex === index}
                        onOpenChange={(open) => {
                          setOpenPopoverIndex(open ? index : null);
                          if (!open) setSearchTerm("");
                        }}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between text-left h-9"
                          >
                            {component.component_item_id ? (
                              <span className="truncate">
                                {component.component_sku}
                                {component.component_description &&
                                  ` - ${component.component_description}`}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">
                                Select component...
                              </span>
                            )}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-0" align="start">
                          <Command>
                            <CommandInput
                              placeholder="Search components..."
                              value={searchTerm}
                              onValueChange={setSearchTerm}
                            />
                            <CommandList>
                              <CommandEmpty>No component found.</CommandEmpty>
                              <CommandGroup>
                                {getAvailableItems().map((item) => (
                                  <CommandItem
                                    key={item.id}
                                    value={item.sku}
                                    onSelect={() => selectComponent(index, item)}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        component.component_item_id === item.id
                                          ? "opacity-100"
                                          : "opacity-0"
                                      )}
                                    />
                                    <span className="truncate">
                                      {item.sku}
                                      {item.sales_description &&
                                        ` - ${item.sales_description}`}
                                    </span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={component.quantity_needed}
                        onChange={(e) =>
                          updateComponent(index, {
                            quantity_needed: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full text-right h-9"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={(component.waste_factor * 100).toFixed(1)}
                        onChange={(e) =>
                          updateComponent(index, {
                            waste_factor: (parseFloat(e.target.value) || 0) / 100,
                          })
                        }
                        className="w-full text-right h-9"
                      />
                    </td>
                    <td className="p-2 text-right text-sm">
                      {component.unit_cost
                        ? `$${component.unit_cost.toFixed(4)}`
                        : "-"}
                    </td>
                    <td className="p-2 text-right text-sm font-medium">
                      ${calculateExtendedCost(component).toFixed(4)}
                    </td>
                    <td className="p-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeComponent(index)}
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
            <tfoot className="bg-muted/30">
              <tr className="border-t">
                <td colSpan={4} className="p-3 text-right font-medium">
                  Total BOM Cost per Unit:
                </td>
                <td className="p-3 text-right font-bold">
                  ${calculateTotalBomCost().toFixed(4)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Define the raw materials needed to produce this item. Waste factor
        accounts for expected material loss during production.
      </p>
    </div>
  );
};

// Helper function to save BOM components
export const saveBomComponents = async (
  inventoryItemId: string,
  components: BomComponent[]
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Delete removed components
    const deletedComponents = components.filter((c) => c.isDeleted && c.id);
    if (deletedComponents.length > 0) {
      const { error: deleteError } = await supabase
        .from("inventory_item_components")
        .delete()
        .in(
          "id",
          deletedComponents.map((c) => c.id!)
        );

      if (deleteError) throw deleteError;
    }

    // Insert new components
    const newComponents = components.filter(
      (c) => c.isNew && !c.isDeleted && c.component_item_id
    );
    if (newComponents.length > 0) {
      const { error: insertError } = await supabase
        .from("inventory_item_components")
        .insert(
          newComponents.map((c) => ({
            inventory_item_id: inventoryItemId,
            component_item_id: c.component_item_id,
            quantity_needed: c.quantity_needed,
            waste_factor: c.waste_factor,
          }))
        );

      if (insertError) throw insertError;
    }

    // Update existing components
    const existingComponents = components.filter(
      (c) => c.id && !c.isNew && !c.isDeleted
    );
    for (const component of existingComponents) {
      const { error: updateError } = await supabase
        .from("inventory_item_components")
        .update({
          quantity_needed: component.quantity_needed,
          waste_factor: component.waste_factor,
        })
        .eq("id", component.id!);

      if (updateError) throw updateError;
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error saving BOM components:", error);
    return { success: false, error: error.message };
  }
};

// Helper function to load BOM components
export const loadBomComponents = async (
  inventoryItemId: string
): Promise<BomComponent[]> => {
  try {
    const { data, error } = await supabase
      .from("inventory_item_components")
      .select(`
        id,
        component_item_id,
        quantity_needed,
        waste_factor,
        component:inventory_items!inventory_item_components_component_item_id_fkey (
          sku,
          sales_description,
          unit_cost
        )
      `)
      .eq("inventory_item_id", inventoryItemId);

    if (error) throw error;

    return (data || []).map((item: any) => ({
      id: item.id,
      component_item_id: item.component_item_id,
      component_sku: item.component?.sku,
      component_description: item.component?.sales_description,
      quantity_needed: item.quantity_needed,
      waste_factor: item.waste_factor || 0,
      unit_cost: item.component?.unit_cost,
    }));
  } catch (error) {
    console.error("Error loading BOM components:", error);
    return [];
  }
};
