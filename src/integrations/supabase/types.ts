export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_number: string | null
          account_subtype: Database["public"]["Enums"]["account_subtype"]
          account_type: Database["public"]["Enums"]["account_type"]
          company_id: string | null
          created_at: string
          created_by: string
          current_balance: number
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          account_subtype: Database["public"]["Enums"]["account_subtype"]
          account_type: Database["public"]["Enums"]["account_type"]
          company_id?: string | null
          created_at?: string
          created_by: string
          current_balance?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          account_subtype?: Database["public"]["Enums"]["account_subtype"]
          account_type?: Database["public"]["Enums"]["account_type"]
          company_id?: string | null
          created_at?: string
          created_by?: string
          current_balance?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_accounts_company"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      assemblies: {
        Row: {
          active: boolean
          actual_packed_volume_cubic_inches: number | null
          always_ship_stacked: boolean
          auto_production_orders_generated: number | null
          consumption_last_12_months: number | null
          consumption_start_date: string | null
          created_at: string
          created_by: string
          daily_consumption_rate: number | null
          density: number | null
          dimension_h: number | null
          dimension_l: number | null
          dimension_w: number | null
          eligible_for_distributor_discount: boolean | null
          external_supplier_id: string | null
          id: string
          image_urls: string[] | null
          is_consigned: boolean
          is_externally_sourced: boolean
          is_subassembly: boolean
          last_14_day_check_date: string | null
          lead_time_days: number | null
          manufacturer_part_number: string | null
          markup_percentage: number | null
          max_stack_quantity: number | null
          packed_density: number | null
          packed_diameter: number | null
          packed_dimension_h: number | null
          packed_dimension_l: number | null
          packed_dimension_w: number | null
          packed_shape: string
          packed_volume_cubic_inches: number | null
          paper_thickness_back: number
          paper_thickness_bottom: number
          paper_thickness_front: number
          paper_thickness_left: number
          paper_thickness_right: number
          paper_thickness_side: number
          paper_thickness_top: number
          paper_thickness_uniform: number
          purchase_description: string | null
          quantity_allocated: number
          quantity_atp: number
          quantity_ats: number
          quantity_on_hand: number
          quantity_on_order: number
          reorder_point: number
          sales_description: string | null
          selling_price: number
          serial_prefix: string | null
          serial_tracking_type: string | null
          ships_in_own_packaging: boolean
          sku: string
          taxable: boolean
          unit_cost: number | null
          updated_at: string
          visible_for_sale: boolean
          volume_cubic_inches: number | null
          weight_oz: number | null
        }
        Insert: {
          active?: boolean
          actual_packed_volume_cubic_inches?: number | null
          always_ship_stacked?: boolean
          auto_production_orders_generated?: number | null
          consumption_last_12_months?: number | null
          consumption_start_date?: string | null
          created_at?: string
          created_by: string
          daily_consumption_rate?: number | null
          density?: number | null
          dimension_h?: number | null
          dimension_l?: number | null
          dimension_w?: number | null
          eligible_for_distributor_discount?: boolean | null
          external_supplier_id?: string | null
          id?: string
          image_urls?: string[] | null
          is_consigned?: boolean
          is_externally_sourced?: boolean
          is_subassembly?: boolean
          last_14_day_check_date?: string | null
          lead_time_days?: number | null
          manufacturer_part_number?: string | null
          markup_percentage?: number | null
          max_stack_quantity?: number | null
          packed_density?: number | null
          packed_diameter?: number | null
          packed_dimension_h?: number | null
          packed_dimension_l?: number | null
          packed_dimension_w?: number | null
          packed_shape?: string
          packed_volume_cubic_inches?: number | null
          paper_thickness_back?: number
          paper_thickness_bottom?: number
          paper_thickness_front?: number
          paper_thickness_left?: number
          paper_thickness_right?: number
          paper_thickness_side?: number
          paper_thickness_top?: number
          paper_thickness_uniform?: number
          purchase_description?: string | null
          quantity_allocated?: number
          quantity_atp?: number
          quantity_ats?: number
          quantity_on_hand?: number
          quantity_on_order?: number
          reorder_point?: number
          sales_description?: string | null
          selling_price?: number
          serial_prefix?: string | null
          serial_tracking_type?: string | null
          ships_in_own_packaging?: boolean
          sku: string
          taxable?: boolean
          unit_cost?: number | null
          updated_at?: string
          visible_for_sale?: boolean
          volume_cubic_inches?: number | null
          weight_oz?: number | null
        }
        Update: {
          active?: boolean
          actual_packed_volume_cubic_inches?: number | null
          always_ship_stacked?: boolean
          auto_production_orders_generated?: number | null
          consumption_last_12_months?: number | null
          consumption_start_date?: string | null
          created_at?: string
          created_by?: string
          daily_consumption_rate?: number | null
          density?: number | null
          dimension_h?: number | null
          dimension_l?: number | null
          dimension_w?: number | null
          eligible_for_distributor_discount?: boolean | null
          external_supplier_id?: string | null
          id?: string
          image_urls?: string[] | null
          is_consigned?: boolean
          is_externally_sourced?: boolean
          is_subassembly?: boolean
          last_14_day_check_date?: string | null
          lead_time_days?: number | null
          manufacturer_part_number?: string | null
          markup_percentage?: number | null
          max_stack_quantity?: number | null
          packed_density?: number | null
          packed_diameter?: number | null
          packed_dimension_h?: number | null
          packed_dimension_l?: number | null
          packed_dimension_w?: number | null
          packed_shape?: string
          packed_volume_cubic_inches?: number | null
          paper_thickness_back?: number
          paper_thickness_bottom?: number
          paper_thickness_front?: number
          paper_thickness_left?: number
          paper_thickness_right?: number
          paper_thickness_side?: number
          paper_thickness_top?: number
          paper_thickness_uniform?: number
          purchase_description?: string | null
          quantity_allocated?: number
          quantity_atp?: number
          quantity_ats?: number
          quantity_on_hand?: number
          quantity_on_order?: number
          reorder_point?: number
          sales_description?: string | null
          selling_price?: number
          serial_prefix?: string | null
          serial_tracking_type?: string | null
          ships_in_own_packaging?: boolean
          sku?: string
          taxable?: boolean
          unit_cost?: number | null
          updated_at?: string
          visible_for_sale?: boolean
          volume_cubic_inches?: number | null
          weight_oz?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assemblies_external_supplier_id_fkey"
            columns: ["external_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      assembly_components: {
        Row: {
          assembly_id: string
          created_at: string
          id: string
          inventory_item_id: string
          quantity_needed: number
          updated_at: string
        }
        Insert: {
          assembly_id: string
          created_at?: string
          id?: string
          inventory_item_id: string
          quantity_needed?: number
          updated_at?: string
        }
        Update: {
          assembly_id?: string
          created_at?: string
          id?: string
          inventory_item_id?: string
          quantity_needed?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assembly_components_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_components_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "backordered_assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_components_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "backordered_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_components_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      assembly_demand_analytics: {
        Row: {
          adjusted_reorder_point: number | null
          annual_avg: number
          assembly_id: string
          created_at: string
          daily_shipments: number
          date: string
          id: string
          quarterly_avg: number
          safety_stock_tier: string | null
          updated_at: string
        }
        Insert: {
          adjusted_reorder_point?: number | null
          annual_avg?: number
          assembly_id: string
          created_at?: string
          daily_shipments?: number
          date?: string
          id?: string
          quarterly_avg?: number
          safety_stock_tier?: string | null
          updated_at?: string
        }
        Update: {
          adjusted_reorder_point?: number | null
          annual_avg?: number
          assembly_id?: string
          created_at?: string
          daily_shipments?: number
          date?: string
          id?: string
          quarterly_avg?: number
          safety_stock_tier?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      assembly_demand_events: {
        Row: {
          assembly_id: string
          created_at: string
          demand_date: string
          demand_source: string
          id: string
          notes: string | null
          quantity_demanded: number
          source_order_id: string
        }
        Insert: {
          assembly_id: string
          created_at?: string
          demand_date?: string
          demand_source: string
          id?: string
          notes?: string | null
          quantity_demanded: number
          source_order_id: string
        }
        Update: {
          assembly_id?: string
          created_at?: string
          demand_date?: string
          demand_source?: string
          id?: string
          notes?: string | null
          quantity_demanded?: number
          source_order_id?: string
        }
        Relationships: []
      }
      assembly_production_triggers: {
        Row: {
          assembly_id: string
          created_at: string | null
          fourteen_day_threshold: number
          id: string
          production_order_id: string | null
          quantity_on_hand_at_trigger: number
          recommended_quantity: number
          status: string
          trigger_date: string
        }
        Insert: {
          assembly_id: string
          created_at?: string | null
          fourteen_day_threshold: number
          id?: string
          production_order_id?: string | null
          quantity_on_hand_at_trigger: number
          recommended_quantity: number
          status?: string
          trigger_date?: string
        }
        Update: {
          assembly_id?: string
          created_at?: string | null
          fourteen_day_threshold?: number
          id?: string
          production_order_id?: string | null
          quantity_on_hand_at_trigger?: number
          recommended_quantity?: number
          status?: string
          trigger_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "assembly_production_triggers_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_production_triggers_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "backordered_assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_production_triggers_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "orders_awaiting_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_production_triggers_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      assembly_purchase_uoms: {
        Row: {
          assembly_id: string
          created_at: string
          id: string
          is_default: boolean
          lead_time_days: number | null
          minimum_order_quantity: number | null
          purchase_uom: string
          quantity: number
          sort_order: number
          supplier_name: string | null
          unit_cost: number
          updated_at: string
        }
        Insert: {
          assembly_id: string
          created_at?: string
          id?: string
          is_default?: boolean
          lead_time_days?: number | null
          minimum_order_quantity?: number | null
          purchase_uom: string
          quantity: number
          sort_order?: number
          supplier_name?: string | null
          unit_cost: number
          updated_at?: string
        }
        Update: {
          assembly_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          lead_time_days?: number | null
          minimum_order_quantity?: number | null
          purchase_uom?: string
          quantity?: number
          sort_order?: number
          supplier_name?: string | null
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assembly_purchase_uoms_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_purchase_uoms_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "backordered_assemblies"
            referencedColumns: ["id"]
          },
        ]
      }
      assembly_sales_uoms: {
        Row: {
          assembly_id: string
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          quantity: number
          sort_order: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          assembly_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          quantity: number
          sort_order?: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          assembly_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          quantity?: number
          sort_order?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assembly_sales_uoms_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_sales_uoms_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "backordered_assemblies"
            referencedColumns: ["id"]
          },
        ]
      }
      assembly_shipment_history: {
        Row: {
          assembly_id: string
          created_at: string
          id: string
          production_order_id: string
          quantity_shipped: number
          shipped_date: string
        }
        Insert: {
          assembly_id: string
          created_at?: string
          id?: string
          production_order_id: string
          quantity_shipped: number
          shipped_date: string
        }
        Update: {
          assembly_id?: string
          created_at?: string
          id?: string
          production_order_id?: string
          quantity_shipped?: number
          shipped_date?: string
        }
        Relationships: []
      }
      assembly_subassemblies: {
        Row: {
          created_at: string
          id: string
          parent_assembly_id: string
          quantity_needed: number
          subassembly_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          parent_assembly_id: string
          quantity_needed?: number
          subassembly_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          parent_assembly_id?: string
          quantity_needed?: number
          subassembly_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assembly_subassemblies_parent_assembly_id_fkey"
            columns: ["parent_assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_subassemblies_parent_assembly_id_fkey"
            columns: ["parent_assembly_id"]
            isOneToOne: false
            referencedRelation: "backordered_assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_subassemblies_subassembly_id_fkey"
            columns: ["subassembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_subassemblies_subassembly_id_fkey"
            columns: ["subassembly_id"]
            isOneToOne: false
            referencedRelation: "backordered_assemblies"
            referencedColumns: ["id"]
          },
        ]
      }
      assembly_waste_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_date: string
          alert_status: string
          assembly_id: string
          created_at: string
          current_waste_rate: number
          historical_average: number
          id: string
          threshold_percentage: number
          variance_amount: number
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_date: string
          alert_status?: string
          assembly_id: string
          created_at?: string
          current_waste_rate: number
          historical_average: number
          id?: string
          threshold_percentage?: number
          variance_amount: number
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_date?: string
          alert_status?: string
          assembly_id?: string
          created_at?: string
          current_waste_rate?: number
          historical_average?: number
          id?: string
          threshold_percentage?: number
          variance_amount?: number
        }
        Relationships: []
      }
      assembly_waste_analytics: {
        Row: {
          analysis_date: string
          assembly_id: string
          build_time_per_unit: number
          component_cost_trend: number
          created_at: string
          id: string
          materials_efficiency: number
          setup_time_per_unit: number
          total_planned_quantity: number
          total_waste_quantity: number
          total_yield_quantity: number
          waste_percentage: number
        }
        Insert: {
          analysis_date: string
          assembly_id: string
          build_time_per_unit?: number
          component_cost_trend?: number
          created_at?: string
          id?: string
          materials_efficiency?: number
          setup_time_per_unit?: number
          total_planned_quantity?: number
          total_waste_quantity?: number
          total_yield_quantity?: number
          waste_percentage?: number
        }
        Update: {
          analysis_date?: string
          assembly_id?: string
          build_time_per_unit?: number
          component_cost_trend?: number
          created_at?: string
          id?: string
          materials_efficiency?: number
          setup_time_per_unit?: number
          total_planned_quantity?: number
          total_waste_quantity?: number
          total_yield_quantity?: number
          waste_percentage?: number
        }
        Relationships: []
      }
      box_sizes: {
        Row: {
          cost_per_box: number
          created_at: string
          created_by: string
          dimension_h: number
          dimension_l: number
          dimension_w: number
          id: string
          image_url: string | null
          is_active: boolean
          lead_time_days: number | null
          max_weight_oz: number | null
          minimum_order_quantity: number | null
          name: string
          shipping_cost_multiplier: number
          supplier: string | null
          updated_at: string
          weight_oz: number | null
        }
        Insert: {
          cost_per_box?: number
          created_at?: string
          created_by?: string
          dimension_h: number
          dimension_l: number
          dimension_w: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          lead_time_days?: number | null
          max_weight_oz?: number | null
          minimum_order_quantity?: number | null
          name: string
          shipping_cost_multiplier?: number
          supplier?: string | null
          updated_at?: string
          weight_oz?: number | null
        }
        Update: {
          cost_per_box?: number
          created_at?: string
          created_by?: string
          dimension_h?: number
          dimension_l?: number
          dimension_w?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          lead_time_days?: number | null
          max_weight_oz?: number | null
          minimum_order_quantity?: number | null
          name?: string
          shipping_cost_multiplier?: number
          supplier?: string | null
          updated_at?: string
          weight_oz?: number | null
        }
        Relationships: []
      }
      card_range_allocations: {
        Row: {
          allocated_at: string
          allocation_end: number
          allocation_start: number
          card_range_inventory_id: string
          created_at: string
          customer_order_id: string | null
          customer_order_item_id: string | null
          id: string
        }
        Insert: {
          allocated_at?: string
          allocation_end: number
          allocation_start: number
          card_range_inventory_id: string
          created_at?: string
          customer_order_id?: string | null
          customer_order_item_id?: string | null
          id?: string
        }
        Update: {
          allocated_at?: string
          allocation_end?: number
          allocation_start?: number
          card_range_inventory_id?: string
          created_at?: string
          customer_order_id?: string | null
          customer_order_item_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_range_allocations_card_range_inventory_id_fkey"
            columns: ["card_range_inventory_id"]
            isOneToOne: false
            referencedRelation: "card_range_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_range_allocations_customer_order_id_fkey"
            columns: ["customer_order_id"]
            isOneToOne: false
            referencedRelation: "customer_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_range_allocations_customer_order_item_id_fkey"
            columns: ["customer_order_item_id"]
            isOneToOne: false
            referencedRelation: "customer_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      card_range_inventory: {
        Row: {
          assembly_id: string | null
          created_at: string
          id: string
          inventory_item_id: string | null
          range_end: number
          range_start: number
          received_at: string | null
          source_po_id: string | null
          source_po_item_id: string | null
          status: string
        }
        Insert: {
          assembly_id?: string | null
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          range_end: number
          range_start: number
          received_at?: string | null
          source_po_id?: string | null
          source_po_item_id?: string | null
          status?: string
        }
        Update: {
          assembly_id?: string | null
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          range_end?: number
          range_start?: number
          received_at?: string | null
          source_po_id?: string | null
          source_po_item_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_range_inventory_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_range_inventory_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "backordered_assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_range_inventory_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "backordered_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_range_inventory_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_range_inventory_source_po_id_fkey"
            columns: ["source_po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_range_inventory_source_po_item_id_fkey"
            columns: ["source_po_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      carrier_accounts: {
        Row: {
          account_name: string | null
          account_number: string
          carrier: Database["public"]["Enums"]["shipping_carrier_type"]
          created_at: string
          created_by: string
          environment: string
          eps_balance: number | null
          eps_balance_updated_at: string | null
          id: string
          is_active: boolean
          metadata: Json | null
          negotiated_rates_enabled: boolean | null
          updated_at: string
        }
        Insert: {
          account_name?: string | null
          account_number: string
          carrier: Database["public"]["Enums"]["shipping_carrier_type"]
          created_at?: string
          created_by: string
          environment?: string
          eps_balance?: number | null
          eps_balance_updated_at?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json | null
          negotiated_rates_enabled?: boolean | null
          updated_at?: string
        }
        Update: {
          account_name?: string | null
          account_number?: string
          carrier?: Database["public"]["Enums"]["shipping_carrier_type"]
          created_at?: string
          created_by?: string
          environment?: string
          eps_balance?: number | null
          eps_balance_updated_at?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json | null
          negotiated_rates_enabled?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          billing_address: string | null
          created_at: string
          credit_limit: number | null
          customer_number: number
          default_shipping_address_id: string | null
          email: string | null
          fedex_account_number: string | null
          id: string
          is_active: boolean
          is_distributor: boolean
          is_taxable: boolean
          last_trans_date: string | null
          name: string
          owners_name: string | null
          payment_terms: string | null
          pending_refund_balance: number | null
          phone: string | null
          preferred_shipping_carrier: string | null
          price_level_id: string | null
          sales_tax_license_expires_at: string | null
          sales_tax_license_ocr_data: Json | null
          sales_tax_license_ocr_processed_at: string | null
          sales_tax_license_url: string | null
          shipping_addresses: Json | null
          signature_required: boolean
          start_date: string
          store_credit_balance: number | null
          stripe_customer_id: string | null
          stripe_last_synced_at: string | null
          stripe_sync_status: string | null
          updated_at: string
          ups_account_number: string | null
          use_third_party_shipping: boolean | null
        }
        Insert: {
          billing_address?: string | null
          created_at?: string
          credit_limit?: number | null
          customer_number: number
          default_shipping_address_id?: string | null
          email?: string | null
          fedex_account_number?: string | null
          id?: string
          is_active?: boolean
          is_distributor?: boolean
          is_taxable?: boolean
          last_trans_date?: string | null
          name: string
          owners_name?: string | null
          payment_terms?: string | null
          pending_refund_balance?: number | null
          phone?: string | null
          preferred_shipping_carrier?: string | null
          price_level_id?: string | null
          sales_tax_license_expires_at?: string | null
          sales_tax_license_ocr_data?: Json | null
          sales_tax_license_ocr_processed_at?: string | null
          sales_tax_license_url?: string | null
          shipping_addresses?: Json | null
          signature_required?: boolean
          start_date?: string
          store_credit_balance?: number | null
          stripe_customer_id?: string | null
          stripe_last_synced_at?: string | null
          stripe_sync_status?: string | null
          updated_at?: string
          ups_account_number?: string | null
          use_third_party_shipping?: boolean | null
        }
        Update: {
          billing_address?: string | null
          created_at?: string
          credit_limit?: number | null
          customer_number?: number
          default_shipping_address_id?: string | null
          email?: string | null
          fedex_account_number?: string | null
          id?: string
          is_active?: boolean
          is_distributor?: boolean
          is_taxable?: boolean
          last_trans_date?: string | null
          name?: string
          owners_name?: string | null
          payment_terms?: string | null
          pending_refund_balance?: number | null
          phone?: string | null
          preferred_shipping_carrier?: string | null
          price_level_id?: string | null
          sales_tax_license_expires_at?: string | null
          sales_tax_license_ocr_data?: Json | null
          sales_tax_license_ocr_processed_at?: string | null
          sales_tax_license_url?: string | null
          shipping_addresses?: Json | null
          signature_required?: boolean
          start_date?: string
          store_credit_balance?: number | null
          stripe_customer_id?: string | null
          stripe_last_synced_at?: string | null
          stripe_sync_status?: string | null
          updated_at?: string
          ups_account_number?: string | null
          use_third_party_shipping?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_price_level_id_fkey"
            columns: ["price_level_id"]
            isOneToOne: false
            referencedRelation: "price_levels"
            referencedColumns: ["id"]
          },
        ]
      }
      component_price_history: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          last_paid_unit_cost: number
          price_date: string
          purchase_order_reference: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          last_paid_unit_cost?: number
          price_date: string
          purchase_order_reference?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          last_paid_unit_cost?: number
          price_date?: string
          purchase_order_reference?: string | null
        }
        Relationships: []
      }
      customer_order_items: {
        Row: {
          actual_serial: string | null
          assembly_id: string | null
          assembly_sales_uom_id: string | null
          created_at: string
          customer_order_id: string
          drop_ship_purchase_order_id: string | null
          fulfillment_method: string | null
          id: string
          inventory_item_id: string | null
          inventory_sales_uom_id: string | null
          item_type: string
          labor_item_id: string | null
          notes: string | null
          quantity_drop_shipped: number | null
          quantity_invoiced: number
          quantity_ordered: number
          requested_serial: string | null
          serial_pending: boolean | null
          serial_range_end: number | null
          serial_range_start: number | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          actual_serial?: string | null
          assembly_id?: string | null
          assembly_sales_uom_id?: string | null
          created_at?: string
          customer_order_id: string
          drop_ship_purchase_order_id?: string | null
          fulfillment_method?: string | null
          id?: string
          inventory_item_id?: string | null
          inventory_sales_uom_id?: string | null
          item_type: string
          labor_item_id?: string | null
          notes?: string | null
          quantity_drop_shipped?: number | null
          quantity_invoiced?: number
          quantity_ordered: number
          requested_serial?: string | null
          serial_pending?: boolean | null
          serial_range_end?: number | null
          serial_range_start?: number | null
          unit_price: number
          updated_at?: string
        }
        Update: {
          actual_serial?: string | null
          assembly_id?: string | null
          assembly_sales_uom_id?: string | null
          created_at?: string
          customer_order_id?: string
          drop_ship_purchase_order_id?: string | null
          fulfillment_method?: string | null
          id?: string
          inventory_item_id?: string | null
          inventory_sales_uom_id?: string | null
          item_type?: string
          labor_item_id?: string | null
          notes?: string | null
          quantity_drop_shipped?: number | null
          quantity_invoiced?: number
          quantity_ordered?: number
          requested_serial?: string | null
          serial_pending?: boolean | null
          serial_range_end?: number | null
          serial_range_start?: number | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_order_items_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_order_items_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "backordered_assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_order_items_assembly_sales_uom_id_fkey"
            columns: ["assembly_sales_uom_id"]
            isOneToOne: false
            referencedRelation: "assembly_sales_uoms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_order_items_customer_order_id_fkey"
            columns: ["customer_order_id"]
            isOneToOne: false
            referencedRelation: "customer_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_order_items_drop_ship_purchase_order_id_fkey"
            columns: ["drop_ship_purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_order_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "backordered_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_order_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_order_items_inventory_sales_uom_id_fkey"
            columns: ["inventory_sales_uom_id"]
            isOneToOne: false
            referencedRelation: "inventory_sales_uoms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_order_items_labor_item_id_fkey"
            columns: ["labor_item_id"]
            isOneToOne: false
            referencedRelation: "labor_items"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_orders: {
        Row: {
          carrier_preference: string | null
          created_at: string
          created_by: string | null
          customer_company_id: string
          customer_po: string | null
          deposit_amount: number | null
          deposit_paid: boolean | null
          due_date: string | null
          estimated_shipping: number | null
          id: string
          internal_notes: string | null
          is_one_time_card: boolean
          notes: string | null
          num_packages: number | null
          order_date: string | null
          order_number: string
          order_status: string | null
          package_height: number | null
          package_length: number | null
          package_weight_oz: number | null
          package_width: number | null
          packing_mode: string | null
          packing_packages_json: Json | null
          payment_status: string | null
          priority: string | null
          selected_box_id: string | null
          shipping_address_id: string | null
          shipping_method_preference: string | null
          shipping_preference: string | null
          signature_option: string | null
          source: string | null
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          stripe_payment_method_id: string | null
          updated_at: string
        }
        Insert: {
          carrier_preference?: string | null
          created_at?: string
          created_by?: string | null
          customer_company_id: string
          customer_po?: string | null
          deposit_amount?: number | null
          deposit_paid?: boolean | null
          due_date?: string | null
          estimated_shipping?: number | null
          id?: string
          internal_notes?: string | null
          is_one_time_card?: boolean
          notes?: string | null
          num_packages?: number | null
          order_date?: string | null
          order_number: string
          order_status?: string | null
          package_height?: number | null
          package_length?: number | null
          package_weight_oz?: number | null
          package_width?: number | null
          packing_mode?: string | null
          packing_packages_json?: Json | null
          payment_status?: string | null
          priority?: string | null
          selected_box_id?: string | null
          shipping_address_id?: string | null
          shipping_method_preference?: string | null
          shipping_preference?: string | null
          signature_option?: string | null
          source?: string | null
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_method_id?: string | null
          updated_at?: string
        }
        Update: {
          carrier_preference?: string | null
          created_at?: string
          created_by?: string | null
          customer_company_id?: string
          customer_po?: string | null
          deposit_amount?: number | null
          deposit_paid?: boolean | null
          due_date?: string | null
          estimated_shipping?: number | null
          id?: string
          internal_notes?: string | null
          is_one_time_card?: boolean
          notes?: string | null
          num_packages?: number | null
          order_date?: string | null
          order_number?: string
          order_status?: string | null
          package_height?: number | null
          package_length?: number | null
          package_weight_oz?: number | null
          package_width?: number | null
          packing_mode?: string | null
          packing_packages_json?: Json | null
          payment_status?: string | null
          priority?: string | null
          selected_box_id?: string | null
          shipping_address_id?: string | null
          shipping_method_preference?: string | null
          shipping_preference?: string | null
          signature_option?: string | null
          source?: string | null
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_method_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_orders_customer_company_id_fkey"
            columns: ["customer_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_orders_selected_box_id_fkey"
            columns: ["selected_box_id"]
            isOneToOne: false
            referencedRelation: "box_sizes"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_demand_cache: {
        Row: {
          calculation_date: string
          created_at: string | null
          historical_days_remaining: number
          id: string
          item_id: string
          item_type: string
          real_events_days: number
          ttm_value: number
        }
        Insert: {
          calculation_date?: string
          created_at?: string | null
          historical_days_remaining?: number
          id?: string
          item_id: string
          item_type: string
          real_events_days?: number
          ttm_value?: number
        }
        Update: {
          calculation_date?: string
          created_at?: string | null
          historical_days_remaining?: number
          id?: string
          item_id?: string
          item_type?: string
          real_events_days?: number
          ttm_value?: number
        }
        Relationships: []
      }
      deleted_customers_audit: {
        Row: {
          created_at: string | null
          customer_number: number | null
          deleted_at: string | null
          deletion_reason: string | null
          email: string | null
          id: string
          name: string
          original_customer_id: string
          phone: string | null
        }
        Insert: {
          created_at?: string | null
          customer_number?: number | null
          deleted_at?: string | null
          deletion_reason?: string | null
          email?: string | null
          id?: string
          name: string
          original_customer_id: string
          phone?: string | null
        }
        Update: {
          created_at?: string | null
          customer_number?: number | null
          deleted_at?: string | null
          deletion_reason?: string | null
          email?: string | null
          id?: string
          name?: string
          original_customer_id?: string
          phone?: string | null
        }
        Relationships: []
      }
      demand_events: {
        Row: {
          created_at: string
          demand_date: string
          demand_source: string
          id: string
          inventory_item_id: string
          notes: string | null
          quantity_demanded: number
          source_assembly_id: string | null
          source_order_id: string
        }
        Insert: {
          created_at?: string
          demand_date?: string
          demand_source: string
          id?: string
          inventory_item_id: string
          notes?: string | null
          quantity_demanded: number
          source_assembly_id?: string | null
          source_order_id: string
        }
        Update: {
          created_at?: string
          demand_date?: string
          demand_source?: string
          id?: string
          inventory_item_id?: string
          notes?: string | null
          quantity_demanded?: number
          source_assembly_id?: string | null
          source_order_id?: string
        }
        Relationships: []
      }
      furniture_items: {
        Row: {
          asset_tag: string | null
          condition: string | null
          created_at: string
          created_by: string
          id: string
          item_name: string
          item_type: string
          location: string | null
          notes: string | null
          purchase_value: number | null
          serial_number: string | null
          updated_at: string
          warranty_expires_at: string | null
        }
        Insert: {
          asset_tag?: string | null
          condition?: string | null
          created_at?: string
          created_by?: string
          id?: string
          item_name: string
          item_type: string
          location?: string | null
          notes?: string | null
          purchase_value?: number | null
          serial_number?: string | null
          updated_at?: string
          warranty_expires_at?: string | null
        }
        Update: {
          asset_tag?: string | null
          condition?: string | null
          created_at?: string
          created_by?: string
          id?: string
          item_name?: string
          item_type?: string
          location?: string | null
          notes?: string | null
          purchase_value?: number | null
          serial_number?: string | null
          updated_at?: string
          warranty_expires_at?: string | null
        }
        Relationships: []
      }
      inbound_package_items: {
        Row: {
          created_at: string
          created_by: string
          id: string
          package_id: string
          repair_item_id: string
          unboxing_order: number
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          package_id: string
          repair_item_id: string
          unboxing_order: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          package_id?: string
          repair_item_id?: string
          unboxing_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_inbound_package_items_package"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "inbound_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_inbound_package_items_repair_item"
            columns: ["repair_item_id"]
            isOneToOne: false
            referencedRelation: "repair_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_package_photos: {
        Row: {
          created_at: string
          created_by: string
          file_path: string
          id: string
          package_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          file_path: string
          id?: string
          package_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          file_path?: string
          id?: string
          package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_package_photos_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "inbound_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_packages: {
        Row: {
          assigned_tray: string | null
          category: Database["public"]["Enums"]["receiving_category"] | null
          company_id: string | null
          created_at: string
          customer_initiated: boolean
          customer_po: string | null
          id: string
          initiated_by_user_id: string | null
          initiated_via: string | null
          intake_notes: string | null
          item_count: number | null
          label_purchased: boolean
          received_at: string | null
          received_by: string | null
          return_shipping_address: string | null
          shipping_preference: string
          status: string
          tracking_number: string
          updated_at: string
        }
        Insert: {
          assigned_tray?: string | null
          category?: Database["public"]["Enums"]["receiving_category"] | null
          company_id?: string | null
          created_at?: string
          customer_initiated?: boolean
          customer_po?: string | null
          id?: string
          initiated_by_user_id?: string | null
          initiated_via?: string | null
          intake_notes?: string | null
          item_count?: number | null
          label_purchased?: boolean
          received_at?: string | null
          received_by?: string | null
          return_shipping_address?: string | null
          shipping_preference?: string
          status?: string
          tracking_number: string
          updated_at?: string
        }
        Update: {
          assigned_tray?: string | null
          category?: Database["public"]["Enums"]["receiving_category"] | null
          company_id?: string | null
          created_at?: string
          customer_initiated?: boolean
          customer_po?: string | null
          id?: string
          initiated_by_user_id?: string | null
          initiated_via?: string | null
          intake_notes?: string | null
          item_count?: number | null
          label_purchased?: boolean
          received_at?: string | null
          received_by?: string | null
          return_shipping_address?: string | null
          shipping_preference?: string
          status?: string
          tracking_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_packages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_demand_analytics: {
        Row: {
          adjusted_reorder_point: number | null
          annual_avg: number
          created_at: string
          daily_demand: number
          date: string
          id: string
          inventory_item_id: string
          quarterly_avg: number
          safety_stock_tier: string | null
          spike_factor: number
          updated_at: string
        }
        Insert: {
          adjusted_reorder_point?: number | null
          annual_avg?: number
          created_at?: string
          daily_demand?: number
          date?: string
          id?: string
          inventory_item_id: string
          quarterly_avg?: number
          safety_stock_tier?: string | null
          spike_factor?: number
          updated_at?: string
        }
        Update: {
          adjusted_reorder_point?: number | null
          annual_avg?: number
          created_at?: string
          daily_demand?: number
          date?: string
          id?: string
          inventory_item_id?: string
          quarterly_avg?: number
          safety_stock_tier?: string | null
          spike_factor?: number
          updated_at?: string
        }
        Relationships: []
      }
      inventory_item_components: {
        Row: {
          component_item_id: string
          created_at: string
          id: string
          inventory_item_id: string
          quantity_needed: number
          updated_at: string
          waste_factor: number | null
        }
        Insert: {
          component_item_id: string
          created_at?: string
          id?: string
          inventory_item_id: string
          quantity_needed?: number
          updated_at?: string
          waste_factor?: number | null
        }
        Update: {
          component_item_id?: string
          created_at?: string
          id?: string
          inventory_item_id?: string
          quantity_needed?: number
          updated_at?: string
          waste_factor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_item_components_component_item_id_fkey"
            columns: ["component_item_id"]
            isOneToOne: false
            referencedRelation: "backordered_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_item_components_component_item_id_fkey"
            columns: ["component_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_item_components_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "backordered_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_item_components_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          actual_packed_volume_cubic_inches: number | null
          always_ship_stacked: boolean
          consumption_last_12_months: number | null
          consumption_start_date: string | null
          created_at: string
          created_by: string
          daily_consumption_rate: number | null
          density: number | null
          digikey_part_number: string | null
          dimension_h: number | null
          dimension_l: number | null
          dimension_w: number | null
          eligible_for_distributor_discount: boolean | null
          external_part_number: string | null
          external_supplier_id: string | null
          has_purchase_conversion: boolean
          has_sales_conversion: boolean
          id: string
          image_urls: string[] | null
          is_active: boolean
          is_consigned: boolean
          is_externally_sourced: boolean
          is_taxable: boolean | null
          lead_time_days: number | null
          made_from_raw_materials: boolean
          manufacturer_part_number: string | null
          max_stack_quantity: number | null
          minimum_order_quantity: number | null
          mouser_part_number: string | null
          packed_density: number | null
          packed_diameter: number | null
          packed_dimension_h: number | null
          packed_dimension_l: number | null
          packed_dimension_w: number | null
          packed_shape: string
          packed_volume_cubic_inches: number | null
          paper_thickness_back: number
          paper_thickness_bottom: number
          paper_thickness_front: number
          paper_thickness_left: number
          paper_thickness_right: number
          paper_thickness_side: number
          paper_thickness_top: number
          paper_thickness_uniform: number
          purchase_description: string | null
          purchase_unit_cost: number | null
          purchase_uom: string | null
          purchase_uom_quantity: number | null
          quantity_allocated: number
          quantity_atp: number
          quantity_ats: number
          quantity_on_hand: number
          quantity_on_order: number
          reorder_point: number | null
          sales_description: string | null
          sales_unit_price: number | null
          sales_uom: string | null
          sales_uom_quantity: number | null
          serial_prefix: string | null
          serial_tracking_type: string | null
          ships_in_own_packaging: boolean
          sku: string
          stocking_uom: string
          unit_cost: number | null
          unit_price: number
          updated_at: string
          vendor: string | null
          video_url: string | null
          visible_for_sale: boolean
          volume_cubic_inches: number | null
          weight_oz: number | null
        }
        Insert: {
          actual_packed_volume_cubic_inches?: number | null
          always_ship_stacked?: boolean
          consumption_last_12_months?: number | null
          consumption_start_date?: string | null
          created_at?: string
          created_by: string
          daily_consumption_rate?: number | null
          density?: number | null
          digikey_part_number?: string | null
          dimension_h?: number | null
          dimension_l?: number | null
          dimension_w?: number | null
          eligible_for_distributor_discount?: boolean | null
          external_part_number?: string | null
          external_supplier_id?: string | null
          has_purchase_conversion?: boolean
          has_sales_conversion?: boolean
          id?: string
          image_urls?: string[] | null
          is_active?: boolean
          is_consigned?: boolean
          is_externally_sourced?: boolean
          is_taxable?: boolean | null
          lead_time_days?: number | null
          made_from_raw_materials?: boolean
          manufacturer_part_number?: string | null
          max_stack_quantity?: number | null
          minimum_order_quantity?: number | null
          mouser_part_number?: string | null
          packed_density?: number | null
          packed_diameter?: number | null
          packed_dimension_h?: number | null
          packed_dimension_l?: number | null
          packed_dimension_w?: number | null
          packed_shape?: string
          packed_volume_cubic_inches?: number | null
          paper_thickness_back?: number
          paper_thickness_bottom?: number
          paper_thickness_front?: number
          paper_thickness_left?: number
          paper_thickness_right?: number
          paper_thickness_side?: number
          paper_thickness_top?: number
          paper_thickness_uniform?: number
          purchase_description?: string | null
          purchase_unit_cost?: number | null
          purchase_uom?: string | null
          purchase_uom_quantity?: number | null
          quantity_allocated?: number
          quantity_atp?: number
          quantity_ats?: number
          quantity_on_hand?: number
          quantity_on_order?: number
          reorder_point?: number | null
          sales_description?: string | null
          sales_unit_price?: number | null
          sales_uom?: string | null
          sales_uom_quantity?: number | null
          serial_prefix?: string | null
          serial_tracking_type?: string | null
          ships_in_own_packaging?: boolean
          sku: string
          stocking_uom?: string
          unit_cost?: number | null
          unit_price?: number
          updated_at?: string
          vendor?: string | null
          video_url?: string | null
          visible_for_sale?: boolean
          volume_cubic_inches?: number | null
          weight_oz?: number | null
        }
        Update: {
          actual_packed_volume_cubic_inches?: number | null
          always_ship_stacked?: boolean
          consumption_last_12_months?: number | null
          consumption_start_date?: string | null
          created_at?: string
          created_by?: string
          daily_consumption_rate?: number | null
          density?: number | null
          digikey_part_number?: string | null
          dimension_h?: number | null
          dimension_l?: number | null
          dimension_w?: number | null
          eligible_for_distributor_discount?: boolean | null
          external_part_number?: string | null
          external_supplier_id?: string | null
          has_purchase_conversion?: boolean
          has_sales_conversion?: boolean
          id?: string
          image_urls?: string[] | null
          is_active?: boolean
          is_consigned?: boolean
          is_externally_sourced?: boolean
          is_taxable?: boolean | null
          lead_time_days?: number | null
          made_from_raw_materials?: boolean
          manufacturer_part_number?: string | null
          max_stack_quantity?: number | null
          minimum_order_quantity?: number | null
          mouser_part_number?: string | null
          packed_density?: number | null
          packed_diameter?: number | null
          packed_dimension_h?: number | null
          packed_dimension_l?: number | null
          packed_dimension_w?: number | null
          packed_shape?: string
          packed_volume_cubic_inches?: number | null
          paper_thickness_back?: number
          paper_thickness_bottom?: number
          paper_thickness_front?: number
          paper_thickness_left?: number
          paper_thickness_right?: number
          paper_thickness_side?: number
          paper_thickness_top?: number
          paper_thickness_uniform?: number
          purchase_description?: string | null
          purchase_unit_cost?: number | null
          purchase_uom?: string | null
          purchase_uom_quantity?: number | null
          quantity_allocated?: number
          quantity_atp?: number
          quantity_ats?: number
          quantity_on_hand?: number
          quantity_on_order?: number
          reorder_point?: number | null
          sales_description?: string | null
          sales_unit_price?: number | null
          sales_uom?: string | null
          sales_uom_quantity?: number | null
          serial_prefix?: string | null
          serial_tracking_type?: string | null
          ships_in_own_packaging?: boolean
          sku?: string
          stocking_uom?: string
          unit_cost?: number | null
          unit_price?: number
          updated_at?: string
          vendor?: string | null
          video_url?: string | null
          visible_for_sale?: boolean
          volume_cubic_inches?: number | null
          weight_oz?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_external_supplier_id_fkey"
            columns: ["external_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_order_history: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          order_date: string
          production_order_id: string
          quantity_ordered: number
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          order_date: string
          production_order_id: string
          quantity_ordered: number
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          order_date?: string
          production_order_id?: string
          quantity_ordered?: number
        }
        Relationships: []
      }
      inventory_purchase_uoms: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          is_default: boolean
          lead_time_days: number | null
          minimum_order_quantity: number | null
          purchase_uom: string
          quantity: number
          sort_order: number
          supplier_name: string | null
          unit_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          is_default?: boolean
          lead_time_days?: number | null
          minimum_order_quantity?: number | null
          purchase_uom: string
          quantity: number
          sort_order?: number
          supplier_name?: string | null
          unit_cost: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          is_default?: boolean
          lead_time_days?: number | null
          minimum_order_quantity?: number | null
          purchase_uom?: string
          quantity?: number
          sort_order?: number
          supplier_name?: string | null
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_purchase_uoms_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "backordered_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_purchase_uoms_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_sales_uoms: {
        Row: {
          created_at: string
          description: string | null
          id: string
          inventory_item_id: string
          is_default: boolean
          quantity: number
          sort_order: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          inventory_item_id: string
          is_default?: boolean
          quantity: number
          sort_order?: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          inventory_item_id?: string
          is_default?: boolean
          quantity?: number
          sort_order?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_sales_uoms_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "backordered_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_sales_uoms_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      labor_items: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          eligible_for_distributor_discount: boolean | null
          hourly_rate: number
          id: string
          is_taxable: boolean
          item_number: string
          name: string
          unit_of_measure: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          eligible_for_distributor_discount?: boolean | null
          hourly_rate?: number
          id?: string
          is_taxable?: boolean
          item_number: string
          name: string
          unit_of_measure?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          eligible_for_distributor_discount?: boolean | null
          hourly_rate?: number
          id?: string
          is_taxable?: boolean
          item_number?: string
          name?: string
          unit_of_measure?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          error_message: string | null
          external_id: string | null
          id: string
          message: string
          notification_type: string
          order_id: string
          order_type: string
          recipient: string
          sent_at: string
          status: string
          subject: string | null
        }
        Insert: {
          error_message?: string | null
          external_id?: string | null
          id?: string
          message: string
          notification_type: string
          order_id: string
          order_type: string
          recipient: string
          sent_at?: string
          status?: string
          subject?: string | null
        }
        Update: {
          error_message?: string | null
          external_id?: string | null
          id?: string
          message?: string
          notification_type?: string
          order_id?: string
          order_type?: string
          recipient?: string
          sent_at?: string
          status?: string
          subject?: string | null
        }
        Relationships: []
      }
      order_item_serials: {
        Row: {
          assigned_by: string | null
          created_at: string | null
          customer_order_item_id: string | null
          id: string
          initials: string | null
          label_printed_at: string | null
          production_order_item_id: string | null
          serial_number: string
          serial_type: string
          serialized_inventory_id: string | null
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string | null
          customer_order_item_id?: string | null
          id?: string
          initials?: string | null
          label_printed_at?: string | null
          production_order_item_id?: string | null
          serial_number: string
          serial_type: string
          serialized_inventory_id?: string | null
        }
        Update: {
          assigned_by?: string | null
          created_at?: string | null
          customer_order_item_id?: string | null
          id?: string
          initials?: string | null
          label_printed_at?: string | null
          production_order_item_id?: string | null
          serial_number?: string
          serial_type?: string
          serialized_inventory_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_item_serials_customer_order_item_id_fkey"
            columns: ["customer_order_item_id"]
            isOneToOne: false
            referencedRelation: "customer_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_serials_production_order_item_id_fkey"
            columns: ["production_order_item_id"]
            isOneToOne: false
            referencedRelation: "production_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_serials_serialized_inventory_id_fkey"
            columns: ["serialized_inventory_id"]
            isOneToOne: false
            referencedRelation: "serialized_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      package_images: {
        Row: {
          content_type: string | null
          created_at: string | null
          file_size: number | null
          id: string
          original_filename: string | null
          package_id: string
          storage_path: string
          updated_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string | null
          file_size?: number | null
          id?: string
          original_filename?: string | null
          package_id: string
          storage_path: string
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string | null
          file_size?: number | null
          id?: string
          original_filename?: string | null
          package_id?: string
          storage_path?: string
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "package_images_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "inbound_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_bags: {
        Row: {
          cost_per_bag: number
          created_at: string
          created_by: string
          id: string
          image_url: string | null
          is_active: boolean
          length_inches: number
          name: string
          shipping_cost_multiplier: number
          supplier: string | null
          updated_at: string
          width_inches: number
        }
        Insert: {
          cost_per_bag?: number
          created_at?: string
          created_by: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          length_inches: number
          name: string
          shipping_cost_multiplier?: number
          supplier?: string | null
          updated_at?: string
          width_inches: number
        }
        Update: {
          cost_per_bag?: number
          created_at?: string
          created_by?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          length_inches?: number
          name?: string
          shipping_cost_multiplier?: number
          supplier?: string | null
          updated_at?: string
          width_inches?: number
        }
        Relationships: []
      }
      packing_feedback: {
        Row: {
          algorithm_option_index: number
          box_dims: Json
          company_id: string | null
          corrected_layers: Json | null
          corrected_positions: Json | null
          created_at: string
          created_by: string | null
          feedback_type: string
          id: string
          item_profiles: Json
          layer_profiles: Json
          original_layers: Json
          original_positions: Json
          selected_option_index: number
        }
        Insert: {
          algorithm_option_index?: number
          box_dims: Json
          company_id?: string | null
          corrected_layers?: Json | null
          corrected_positions?: Json | null
          created_at?: string
          created_by?: string | null
          feedback_type: string
          id?: string
          item_profiles?: Json
          layer_profiles?: Json
          original_layers?: Json
          original_positions?: Json
          selected_option_index?: number
        }
        Update: {
          algorithm_option_index?: number
          box_dims?: Json
          company_id?: string | null
          corrected_layers?: Json | null
          corrected_positions?: Json | null
          created_at?: string
          created_by?: string | null
          feedback_type?: string
          id?: string
          item_profiles?: Json
          layer_profiles?: Json
          original_layers?: Json
          original_positions?: Json
          selected_option_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "packing_feedback_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_papers: {
        Row: {
          cost_per_foot: number
          created_at: string
          created_by: string
          cubic_inches_per_linear_inch: number
          id: string
          is_active: boolean
          name: string
          shipping_cost_multiplier: number
          supplier: string | null
          updated_at: string
          weight_oz_per_foot: number
          width_inches: number
        }
        Insert: {
          cost_per_foot?: number
          created_at?: string
          created_by?: string
          cubic_inches_per_linear_inch?: number
          id?: string
          is_active?: boolean
          name: string
          shipping_cost_multiplier?: number
          supplier?: string | null
          updated_at?: string
          weight_oz_per_foot: number
          width_inches?: number
        }
        Update: {
          cost_per_foot?: number
          created_at?: string
          created_by?: string
          cubic_inches_per_linear_inch?: number
          id?: string
          is_active?: boolean
          name?: string
          shipping_cost_multiplier?: number
          supplier?: string | null
          updated_at?: string
          weight_oz_per_foot?: number
          width_inches?: number
        }
        Relationships: []
      }
      packing_tapes: {
        Row: {
          cost_per_roll: number
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          length_yards: number
          name: string
          shipping_cost_multiplier: number
          supplier: string | null
          updated_at: string
          width_inches: number
        }
        Insert: {
          cost_per_roll?: number
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          length_yards: number
          name: string
          shipping_cost_multiplier?: number
          supplier?: string | null
          updated_at?: string
          width_inches: number
        }
        Update: {
          cost_per_roll?: number
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          length_yards?: number
          name?: string
          shipping_cost_multiplier?: number
          supplier?: string | null
          updated_at?: string
          width_inches?: number
        }
        Relationships: []
      }
      pending_invites: {
        Row: {
          company_id: string | null
          created_at: string
          email: string
          id: string
          intended_role: Database["public"]["Enums"]["app_role"]
          invite_message: string | null
          inviter_user_id: string
          status: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email: string
          id?: string
          intended_role: Database["public"]["Enums"]["app_role"]
          invite_message?: string | null
          inviter_user_id: string
          status?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string
          id?: string
          intended_role?: Database["public"]["Enums"]["app_role"]
          invite_message?: string | null
          inviter_user_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_invites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_changes: {
        Row: {
          changed_at: string
          changed_by: string
          id: string
          new_value: boolean
          old_value: boolean | null
          permission_name: string
          reason: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          changed_at?: string
          changed_by: string
          id?: string
          new_value: boolean
          old_value?: boolean | null
          permission_name: string
          reason?: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          changed_at?: string
          changed_by?: string
          id?: string
          new_value?: boolean
          old_value?: boolean | null
          permission_name?: string
          reason?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      permissions: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      price_levels: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          discount_percentage: number
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          discount_percentage: number
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          discount_percentage?: number
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      production_order_items: {
        Row: {
          assembly_id: string | null
          build_completed_at: string | null
          build_test_timer_ms: number | null
          cost_per_good_unit: number | null
          created_at: string
          id: string
          inventory_item_id: string | null
          is_taxable: boolean
          item_name: string
          item_sku: string | null
          item_type: string
          labor_item_id: string | null
          materials_consumed_cost: number | null
          materials_wasted_cost: number | null
          notes: string | null
          planned_build_quantity: number | null
          production_order_id: string
          quantity: number
          repair_item_id: string | null
          sales_uom_description: string | null
          sales_uom_id: string | null
          sales_uom_quantity: number | null
          setup_completed_at: string | null
          setup_timer_ms: number | null
          source_order_item_id: string | null
          status: string
          stocking_quantity: number | null
          tax_amount: number | null
          tax_rate: number | null
          total_price: number | null
          unit_price: number | null
          updated_at: string
          waste_percentage: number | null
          waste_quantity: number | null
          yield_quantity: number | null
        }
        Insert: {
          assembly_id?: string | null
          build_completed_at?: string | null
          build_test_timer_ms?: number | null
          cost_per_good_unit?: number | null
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          is_taxable?: boolean
          item_name: string
          item_sku?: string | null
          item_type: string
          labor_item_id?: string | null
          materials_consumed_cost?: number | null
          materials_wasted_cost?: number | null
          notes?: string | null
          planned_build_quantity?: number | null
          production_order_id: string
          quantity?: number
          repair_item_id?: string | null
          sales_uom_description?: string | null
          sales_uom_id?: string | null
          sales_uom_quantity?: number | null
          setup_completed_at?: string | null
          setup_timer_ms?: number | null
          source_order_item_id?: string | null
          status?: string
          stocking_quantity?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          total_price?: number | null
          unit_price?: number | null
          updated_at?: string
          waste_percentage?: number | null
          waste_quantity?: number | null
          yield_quantity?: number | null
        }
        Update: {
          assembly_id?: string | null
          build_completed_at?: string | null
          build_test_timer_ms?: number | null
          cost_per_good_unit?: number | null
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          is_taxable?: boolean
          item_name?: string
          item_sku?: string | null
          item_type?: string
          labor_item_id?: string | null
          materials_consumed_cost?: number | null
          materials_wasted_cost?: number | null
          notes?: string | null
          planned_build_quantity?: number | null
          production_order_id?: string
          quantity?: number
          repair_item_id?: string | null
          sales_uom_description?: string | null
          sales_uom_id?: string | null
          sales_uom_quantity?: number | null
          setup_completed_at?: string | null
          setup_timer_ms?: number | null
          source_order_item_id?: string | null
          status?: string
          stocking_quantity?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          total_price?: number | null
          unit_price?: number | null
          updated_at?: string
          waste_percentage?: number | null
          waste_quantity?: number | null
          yield_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "production_order_items_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_items_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "backordered_assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "backordered_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_items_labor_item_id_fkey"
            columns: ["labor_item_id"]
            isOneToOne: false
            referencedRelation: "labor_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_items_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "orders_awaiting_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_items_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_items_repair_item_id_fkey"
            columns: ["repair_item_id"]
            isOneToOne: false
            referencedRelation: "repair_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_items_sales_uom_id_fkey"
            columns: ["sales_uom_id"]
            isOneToOne: false
            referencedRelation: "inventory_sales_uoms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_items_source_order_item_id_fkey"
            columns: ["source_order_item_id"]
            isOneToOne: false
            referencedRelation: "customer_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      production_order_shipments: {
        Row: {
          box_cost: number | null
          box_dimensions: Json | null
          box_id: string | null
          carrier: string | null
          created_at: string
          id: string
          is_mock: boolean | null
          label_path: string | null
          package_number: number
          package_weight_oz: number | null
          paper_cost: number | null
          paper_length_ft: number | null
          production_order_id: string
          service_type: string | null
          shipping_cost: number | null
          tracking_number: string | null
        }
        Insert: {
          box_cost?: number | null
          box_dimensions?: Json | null
          box_id?: string | null
          carrier?: string | null
          created_at?: string
          id?: string
          is_mock?: boolean | null
          label_path?: string | null
          package_number?: number
          package_weight_oz?: number | null
          paper_cost?: number | null
          paper_length_ft?: number | null
          production_order_id: string
          service_type?: string | null
          shipping_cost?: number | null
          tracking_number?: string | null
        }
        Update: {
          box_cost?: number | null
          box_dimensions?: Json | null
          box_id?: string | null
          carrier?: string | null
          created_at?: string
          id?: string
          is_mock?: boolean | null
          label_path?: string | null
          package_number?: number
          package_weight_oz?: number | null
          paper_cost?: number | null
          paper_length_ft?: number | null
          production_order_id?: string
          service_type?: string | null
          shipping_cost?: number | null
          tracking_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_order_shipments_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "box_sizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_shipments_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "orders_awaiting_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_shipments_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      production_orders: {
        Row: {
          assigned_to: string | null
          auto_generated: boolean | null
          carrier: string | null
          carrier_preference: string | null
          carrier_service_code: string | null
          created_at: string
          created_by: string
          credit_applied: number | null
          customer_company_id: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          customer_po: string | null
          deposit_amount: number | null
          deposit_paid: boolean | null
          due_date: string | null
          fedex_delivery_date: string | null
          fedex_estimated_delivery: string | null
          fedex_label_url: string | null
          fedex_last_status_check: string | null
          fedex_tracking_number: string | null
          id: string
          inbound_package_id: string | null
          is_mock_shipment: boolean | null
          is_subassembly_build: boolean
          label_created_at: string | null
          notes: string | null
          order_number: string
          order_type: Database["public"]["Enums"]["order_type"]
          parent_customer_order_id: string | null
          parent_order_id: string | null
          parent_repair_request_id: string | null
          payment_method: string | null
          payment_received_at: string | null
          payment_status: string | null
          payment_token: string | null
          payment_token_expires_at: string | null
          picked_up_at: string | null
          priority: string
          shipping_carrier: string | null
          shipping_cost: number | null
          shipping_preference:
            | Database["public"]["Enums"]["shipping_preference"]
            | null
          signature_option: string | null
          sold_at: string | null
          source_reason: string | null
          status: string
          store_at_point_of_use: boolean
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          auto_generated?: boolean | null
          carrier?: string | null
          carrier_preference?: string | null
          carrier_service_code?: string | null
          created_at?: string
          created_by: string
          credit_applied?: number | null
          customer_company_id?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          customer_po?: string | null
          deposit_amount?: number | null
          deposit_paid?: boolean | null
          due_date?: string | null
          fedex_delivery_date?: string | null
          fedex_estimated_delivery?: string | null
          fedex_label_url?: string | null
          fedex_last_status_check?: string | null
          fedex_tracking_number?: string | null
          id?: string
          inbound_package_id?: string | null
          is_mock_shipment?: boolean | null
          is_subassembly_build?: boolean
          label_created_at?: string | null
          notes?: string | null
          order_number: string
          order_type?: Database["public"]["Enums"]["order_type"]
          parent_customer_order_id?: string | null
          parent_order_id?: string | null
          parent_repair_request_id?: string | null
          payment_method?: string | null
          payment_received_at?: string | null
          payment_status?: string | null
          payment_token?: string | null
          payment_token_expires_at?: string | null
          picked_up_at?: string | null
          priority?: string
          shipping_carrier?: string | null
          shipping_cost?: number | null
          shipping_preference?:
            | Database["public"]["Enums"]["shipping_preference"]
            | null
          signature_option?: string | null
          sold_at?: string | null
          source_reason?: string | null
          status?: string
          store_at_point_of_use?: boolean
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          auto_generated?: boolean | null
          carrier?: string | null
          carrier_preference?: string | null
          carrier_service_code?: string | null
          created_at?: string
          created_by?: string
          credit_applied?: number | null
          customer_company_id?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          customer_po?: string | null
          deposit_amount?: number | null
          deposit_paid?: boolean | null
          due_date?: string | null
          fedex_delivery_date?: string | null
          fedex_estimated_delivery?: string | null
          fedex_label_url?: string | null
          fedex_last_status_check?: string | null
          fedex_tracking_number?: string | null
          id?: string
          inbound_package_id?: string | null
          is_mock_shipment?: boolean | null
          is_subassembly_build?: boolean
          label_created_at?: string | null
          notes?: string | null
          order_number?: string
          order_type?: Database["public"]["Enums"]["order_type"]
          parent_customer_order_id?: string | null
          parent_order_id?: string | null
          parent_repair_request_id?: string | null
          payment_method?: string | null
          payment_received_at?: string | null
          payment_status?: string | null
          payment_token?: string | null
          payment_token_expires_at?: string | null
          picked_up_at?: string | null
          priority?: string
          shipping_carrier?: string | null
          shipping_cost?: number | null
          shipping_preference?:
            | Database["public"]["Enums"]["shipping_preference"]
            | null
          signature_option?: string | null
          sold_at?: string | null
          source_reason?: string | null
          status?: string
          store_at_point_of_use?: boolean
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_production_orders_customer_company"
            columns: ["customer_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_inbound_package_id_fkey"
            columns: ["inbound_package_id"]
            isOneToOne: false
            referencedRelation: "inbound_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_parent_customer_order_id_fkey"
            columns: ["parent_customer_order_id"]
            isOneToOne: false
            referencedRelation: "customer_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_parent_order_id_fkey"
            columns: ["parent_order_id"]
            isOneToOne: false
            referencedRelation: "orders_awaiting_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_parent_order_id_fkey"
            columns: ["parent_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_parent_repair_request_id_fkey"
            columns: ["parent_repair_request_id"]
            isOneToOne: false
            referencedRelation: "inbound_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_id: string | null
          created_at: string
          default_initials: string | null
          email: string
          first_name: string | null
          id: string
          is_active: boolean
          last_name: string | null
          marketing_view_margin: boolean
          marketing_view_revenue: boolean
          marketing_view_supplier_price: boolean
          phone: string | null
          price_level_id: string | null
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          default_initials?: string | null
          email: string
          first_name?: string | null
          id: string
          is_active?: boolean
          last_name?: string | null
          marketing_view_margin?: boolean
          marketing_view_revenue?: boolean
          marketing_view_supplier_price?: boolean
          phone?: string | null
          price_level_id?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          default_initials?: string | null
          email?: string
          first_name?: string | null
          id?: string
          is_active?: boolean
          last_name?: string | null
          marketing_view_margin?: boolean
          marketing_view_revenue?: boolean
          marketing_view_supplier_price?: boolean
          phone?: string | null
          price_level_id?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_price_level_id_fkey"
            columns: ["price_level_id"]
            isOneToOne: false
            referencedRelation: "price_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          actual_received_date: string | null
          assembly_id: string | null
          created_at: string
          expected_date: string | null
          id: string
          inventory_item_id: string | null
          item_type: string
          notes: string | null
          purchase_order_id: string
          purchase_uom: string | null
          purchase_uom_id: string | null
          purchase_uom_quantity: number | null
          quantity: number
          quantity_received: number
          quantity_remaining: number
          receiving_notes: string | null
          receiving_variance: number | null
          serial_range_end: number | null
          serial_range_start: number | null
          source_customer_order_item_id: string | null
          status: string
          stocking_quantity: number | null
          total_cost: number
          unit_cost: number
          updated_at: string
        }
        Insert: {
          actual_received_date?: string | null
          assembly_id?: string | null
          created_at?: string
          expected_date?: string | null
          id?: string
          inventory_item_id?: string | null
          item_type: string
          notes?: string | null
          purchase_order_id: string
          purchase_uom?: string | null
          purchase_uom_id?: string | null
          purchase_uom_quantity?: number | null
          quantity?: number
          quantity_received?: number
          quantity_remaining?: number
          receiving_notes?: string | null
          receiving_variance?: number | null
          serial_range_end?: number | null
          serial_range_start?: number | null
          source_customer_order_item_id?: string | null
          status?: string
          stocking_quantity?: number | null
          total_cost?: number
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          actual_received_date?: string | null
          assembly_id?: string | null
          created_at?: string
          expected_date?: string | null
          id?: string
          inventory_item_id?: string | null
          item_type?: string
          notes?: string | null
          purchase_order_id?: string
          purchase_uom?: string | null
          purchase_uom_id?: string | null
          purchase_uom_quantity?: number | null
          quantity?: number
          quantity_received?: number
          quantity_remaining?: number
          receiving_notes?: string | null
          receiving_variance?: number | null
          serial_range_end?: number | null
          serial_range_start?: number | null
          source_customer_order_item_id?: string | null
          status?: string
          stocking_quantity?: number | null
          total_cost?: number
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "backordered_assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "backordered_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_uom_id_fkey"
            columns: ["purchase_uom_id"]
            isOneToOne: false
            referencedRelation: "inventory_purchase_uoms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_source_customer_order_item_id_fkey"
            columns: ["source_customer_order_item_id"]
            isOneToOne: false
            referencedRelation: "customer_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          actual_delivery_date: string | null
          auto_generated: boolean | null
          company_id: string | null
          created_at: string
          created_by: string
          drop_ship_address_snapshot: Json | null
          drop_ship_company_id: string | null
          drop_ship_customer_order_id: string | null
          expected_delivery_date: string | null
          id: string
          is_drop_ship: boolean
          notes: string | null
          order_date: string
          purchase_order_number: string
          requested_shipping_carrier: string | null
          requested_shipping_method: string | null
          ship_by_date: string | null
          shipment_token: string | null
          shipment_token_created_at: string | null
          source_reason: string | null
          status: string
          subtotal: number
          supplier_id: string
          tax_amount: number
          total_amount: number
          updated_at: string
          vendor_delivered_at: string | null
          vendor_delivery_status: string | null
          vendor_order_id: string | null
          vendor_order_status: string | null
          vendor_shipped_at: string | null
          vendor_tracking_carrier: string | null
          vendor_tracking_number: string | null
        }
        Insert: {
          actual_delivery_date?: string | null
          auto_generated?: boolean | null
          company_id?: string | null
          created_at?: string
          created_by: string
          drop_ship_address_snapshot?: Json | null
          drop_ship_company_id?: string | null
          drop_ship_customer_order_id?: string | null
          expected_delivery_date?: string | null
          id?: string
          is_drop_ship?: boolean
          notes?: string | null
          order_date?: string
          purchase_order_number: string
          requested_shipping_carrier?: string | null
          requested_shipping_method?: string | null
          ship_by_date?: string | null
          shipment_token?: string | null
          shipment_token_created_at?: string | null
          source_reason?: string | null
          status?: string
          subtotal?: number
          supplier_id: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_delivered_at?: string | null
          vendor_delivery_status?: string | null
          vendor_order_id?: string | null
          vendor_order_status?: string | null
          vendor_shipped_at?: string | null
          vendor_tracking_carrier?: string | null
          vendor_tracking_number?: string | null
        }
        Update: {
          actual_delivery_date?: string | null
          auto_generated?: boolean | null
          company_id?: string | null
          created_at?: string
          created_by?: string
          drop_ship_address_snapshot?: Json | null
          drop_ship_company_id?: string | null
          drop_ship_customer_order_id?: string | null
          expected_delivery_date?: string | null
          id?: string
          is_drop_ship?: boolean
          notes?: string | null
          order_date?: string
          purchase_order_number?: string
          requested_shipping_carrier?: string | null
          requested_shipping_method?: string | null
          ship_by_date?: string | null
          shipment_token?: string | null
          shipment_token_created_at?: string | null
          source_reason?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_delivered_at?: string | null
          vendor_delivery_status?: string | null
          vendor_order_id?: string | null
          vendor_order_status?: string | null
          vendor_shipped_at?: string | null
          vendor_tracking_carrier?: string | null
          vendor_tracking_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_purchase_orders_company"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_drop_ship_company_id_fkey"
            columns: ["drop_ship_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_drop_ship_customer_order_id_fkey"
            columns: ["drop_ship_customer_order_id"]
            isOneToOne: false
            referencedRelation: "customer_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      receiving_events: {
        Row: {
          created_at: string
          created_by: string
          event_type: string
          id: string
          note: string | null
          occurred_at: string
          package_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          event_type?: string
          id?: string
          note?: string | null
          occurred_at?: string
          package_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          event_type?: string
          id?: string
          note?: string | null
          occurred_at?: string
          package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receiving_events_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "inbound_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      receiving_items: {
        Row: {
          condition_notes: string | null
          created_at: string
          created_by: string
          id: string
          item_id: string
          item_type: Database["public"]["Enums"]["receiving_category"]
          package_id: string
          quantity_received: number
        }
        Insert: {
          condition_notes?: string | null
          created_at?: string
          created_by?: string
          id?: string
          item_id: string
          item_type: Database["public"]["Enums"]["receiving_category"]
          package_id: string
          quantity_received?: number
        }
        Update: {
          condition_notes?: string | null
          created_at?: string
          created_by?: string
          id?: string
          item_id?: string
          item_type?: Database["public"]["Enums"]["receiving_category"]
          package_id?: string
          quantity_received?: number
        }
        Relationships: [
          {
            foreignKeyName: "receiving_items_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "inbound_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_items: {
        Row: {
          created_at: string
          id: string
          is_cleared: boolean
          reconciliation_id: string
          transaction_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_cleared?: boolean
          reconciliation_id: string
          transaction_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_cleared?: boolean
          reconciliation_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_items_reconciliation_id_fkey"
            columns: ["reconciliation_id"]
            isOneToOne: false
            referencedRelation: "reconciliations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliations: {
        Row: {
          account_id: string
          created_at: string
          created_by: string
          ending_balance: number
          id: string
          is_completed: boolean
          notes: string | null
          reconciliation_date: string
          statement_date: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by: string
          ending_balance: number
          id?: string
          is_completed?: boolean
          notes?: string | null
          reconciliation_date: string
          statement_date: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string
          ending_balance?: number
          id?: string
          is_completed?: boolean
          notes?: string | null
          reconciliation_date?: string
          statement_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      reorder_calculations: {
        Row: {
          assemblies_needing_reorder: number | null
          calculation_date: string | null
          calculation_duration_ms: number | null
          created_at: string | null
          id: string
          items_needing_reorder: number | null
          production_orders_generated: number | null
          purchase_orders_generated: number | null
          total_assemblies_processed: number | null
          total_items_processed: number | null
        }
        Insert: {
          assemblies_needing_reorder?: number | null
          calculation_date?: string | null
          calculation_duration_ms?: number | null
          created_at?: string | null
          id?: string
          items_needing_reorder?: number | null
          production_orders_generated?: number | null
          purchase_orders_generated?: number | null
          total_assemblies_processed?: number | null
          total_items_processed?: number | null
        }
        Update: {
          assemblies_needing_reorder?: number | null
          calculation_date?: string | null
          calculation_duration_ms?: number | null
          created_at?: string | null
          id?: string
          items_needing_reorder?: number | null
          production_orders_generated?: number | null
          purchase_orders_generated?: number | null
          total_assemblies_processed?: number | null
          total_items_processed?: number | null
        }
        Relationships: []
      }
      reorder_triggers: {
        Row: {
          created_at: string | null
          current_quantity: number
          days_until_stockout: number | null
          generated_order_id: string | null
          id: string
          item_id: string
          item_type: string
          order_generated: boolean | null
          processed_at: string | null
          reorder_point: number
          trending_velocity: number | null
          trigger_reason: string
        }
        Insert: {
          created_at?: string | null
          current_quantity: number
          days_until_stockout?: number | null
          generated_order_id?: string | null
          id?: string
          item_id: string
          item_type: string
          order_generated?: boolean | null
          processed_at?: string | null
          reorder_point: number
          trending_velocity?: number | null
          trigger_reason: string
        }
        Update: {
          created_at?: string | null
          current_quantity?: number
          days_until_stockout?: number | null
          generated_order_id?: string | null
          id?: string
          item_id?: string
          item_type?: string
          order_generated?: boolean | null
          processed_at?: string | null
          reorder_point?: number
          trending_velocity?: number | null
          trigger_reason?: string
        }
        Relationships: []
      }
      repair_item_actuals: {
        Row: {
          assembly_id: string | null
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          inventory_item_id: string | null
          is_taxable: boolean | null
          labor_item_id: string | null
          quantity: number
          repair_item_id: string
          total_amount: number
          unit_rate: number
          updated_at: string | null
        }
        Insert: {
          assembly_id?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          inventory_item_id?: string | null
          is_taxable?: boolean | null
          labor_item_id?: string | null
          quantity?: number
          repair_item_id: string
          total_amount?: number
          unit_rate?: number
          updated_at?: string | null
        }
        Update: {
          assembly_id?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          inventory_item_id?: string | null
          is_taxable?: boolean | null
          labor_item_id?: string | null
          quantity?: number
          repair_item_id?: string
          total_amount?: number
          unit_rate?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repair_item_actuals_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_item_actuals_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "backordered_assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_item_actuals_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "backordered_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_item_actuals_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_item_actuals_labor_item_id_fkey"
            columns: ["labor_item_id"]
            isOneToOne: false
            referencedRelation: "labor_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_item_actuals_repair_item_id_fkey"
            columns: ["repair_item_id"]
            isOneToOne: false
            referencedRelation: "repair_items"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_item_estimates: {
        Row: {
          assembly_id: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          inventory_item_id: string | null
          is_taxable: boolean | null
          labor_item_id: string | null
          quantity: number
          repair_item_id: string
          tax_amount: number | null
          tax_rate: number | null
          total_amount: number
          unit_rate: number
          updated_at: string
        }
        Insert: {
          assembly_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          inventory_item_id?: string | null
          is_taxable?: boolean | null
          labor_item_id?: string | null
          quantity?: number
          repair_item_id: string
          tax_amount?: number | null
          tax_rate?: number | null
          total_amount?: number
          unit_rate?: number
          updated_at?: string
        }
        Update: {
          assembly_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          inventory_item_id?: string | null
          is_taxable?: boolean | null
          labor_item_id?: string | null
          quantity?: number
          repair_item_id?: string
          tax_amount?: number | null
          tax_rate?: number | null
          total_amount?: number
          unit_rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "repair_item_estimates_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_item_estimates_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "backordered_assemblies"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_item_photos: {
        Row: {
          created_at: string
          created_by: string
          file_path: string
          id: string
          repair_item_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          file_path: string
          id?: string
          repair_item_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          file_path?: string
          id?: string
          repair_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repair_item_photos_item_fk"
            columns: ["repair_item_id"]
            isOneToOne: false
            referencedRelation: "repair_items"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_item_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          completion_outcome: string | null
          diagnosis_assessment: string | null
          id: string
          notes: string | null
          repair_item_id: string
          status: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          completion_outcome?: string | null
          diagnosis_assessment?: string | null
          id?: string
          notes?: string | null
          repair_item_id: string
          status: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          completion_outcome?: string | null
          diagnosis_assessment?: string | null
          id?: string
          notes?: string | null
          repair_item_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "repair_item_status_history_repair_item_id_fkey"
            columns: ["repair_item_id"]
            isOneToOne: false
            referencedRelation: "repair_items"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_items: {
        Row: {
          completion_outcome: string | null
          created_at: string
          created_by: string
          diagnosis: string | null
          diagnosis_assessment: string | null
          estimated_cost: number | null
          id: string
          item_name: string
          mac_address: string | null
          notes: string | null
          package_id: string
          priority_order: number | null
          problem_reported: string | null
          repairability: string | null
          serial_number: string | null
          status: string
          timer_active: boolean | null
          timer_elapsed_ms: number | null
          timer_last_started: string | null
          timer_user_id: string | null
          total_accumulated_hours: number
          total_accumulated_ms: number
          updated_at: string
        }
        Insert: {
          completion_outcome?: string | null
          created_at?: string
          created_by?: string
          diagnosis?: string | null
          diagnosis_assessment?: string | null
          estimated_cost?: number | null
          id?: string
          item_name: string
          mac_address?: string | null
          notes?: string | null
          package_id: string
          priority_order?: number | null
          problem_reported?: string | null
          repairability?: string | null
          serial_number?: string | null
          status?: string
          timer_active?: boolean | null
          timer_elapsed_ms?: number | null
          timer_last_started?: string | null
          timer_user_id?: string | null
          total_accumulated_hours?: number
          total_accumulated_ms?: number
          updated_at?: string
        }
        Update: {
          completion_outcome?: string | null
          created_at?: string
          created_by?: string
          diagnosis?: string | null
          diagnosis_assessment?: string | null
          estimated_cost?: number | null
          id?: string
          item_name?: string
          mac_address?: string | null
          notes?: string | null
          package_id?: string
          priority_order?: number | null
          problem_reported?: string | null
          repairability?: string | null
          serial_number?: string | null
          status?: string
          timer_active?: boolean | null
          timer_elapsed_ms?: number | null
          timer_last_started?: string | null
          timer_user_id?: string | null
          total_accumulated_hours?: number
          total_accumulated_ms?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "repair_items_package_fk"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "inbound_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_orders: {
        Row: {
          actual_completion: string | null
          assigned_to: string | null
          created_at: string
          created_by: string
          customer_company_id: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          diagnosis: string | null
          estimated_completion: string | null
          id: string
          item_description: string
          priority: string
          problem_description: string
          repair_cost: number | null
          repair_number: string
          status: string
          updated_at: string
          warranty_expiry: string | null
        }
        Insert: {
          actual_completion?: string | null
          assigned_to?: string | null
          created_at?: string
          created_by: string
          customer_company_id?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          diagnosis?: string | null
          estimated_completion?: string | null
          id?: string
          item_description: string
          priority?: string
          problem_description: string
          repair_cost?: number | null
          repair_number: string
          status?: string
          updated_at?: string
          warranty_expiry?: string | null
        }
        Update: {
          actual_completion?: string | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string
          customer_company_id?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          diagnosis?: string | null
          estimated_completion?: string | null
          id?: string
          item_description?: string
          priority?: string
          problem_description?: string
          repair_cost?: number | null
          repair_number?: string
          status?: string
          updated_at?: string
          warranty_expiry?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_repair_orders_customer_company"
            columns: ["customer_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_parts: {
        Row: {
          created_at: string
          id: string
          ordered_date: string | null
          part_name: string
          part_sku: string | null
          quantity: number
          received_date: string | null
          repair_order_id: string
          status: string
          total_cost: number | null
          unit_cost: number | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ordered_date?: string | null
          part_name: string
          part_sku?: string | null
          quantity?: number
          received_date?: string | null
          repair_order_id: string
          status?: string
          total_cost?: number | null
          unit_cost?: number | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ordered_date?: string | null
          part_name?: string
          part_sku?: string | null
          quantity?: number
          received_date?: string | null
          repair_order_id?: string
          status?: string
          total_cost?: number | null
          unit_cost?: number | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repair_parts_repair_order_id_fkey"
            columns: ["repair_order_id"]
            isOneToOne: false
            referencedRelation: "repair_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_time_logs: {
        Row: {
          created_at: string
          created_by: string
          end_time: string | null
          id: string
          notes: string | null
          repair_item_id: string
          start_time: string
          total_hours: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          end_time?: string | null
          id?: string
          notes?: string | null
          repair_item_id: string
          start_time: string
          total_hours?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          end_time?: string | null
          id?: string
          notes?: string | null
          repair_item_id?: string
          start_time?: string
          total_hours?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "repair_time_logs_repair_item_id_fkey"
            columns: ["repair_item_id"]
            isOneToOne: false
            referencedRelation: "repair_items"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_timer_audit: {
        Row: {
          action: string
          created_at: string | null
          id: string
          new_total_hours: number | null
          old_total_hours: number | null
          repair_item_id: string
          session_hours: number | null
          session_ms: number | null
          timer_elapsed_ms: number | null
          total_accumulated_ms: number | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          new_total_hours?: number | null
          old_total_hours?: number | null
          repair_item_id: string
          session_hours?: number | null
          session_ms?: number | null
          timer_elapsed_ms?: number | null
          total_accumulated_ms?: number | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          new_total_hours?: number | null
          old_total_hours?: number | null
          repair_item_id?: string
          session_hours?: number | null
          session_ms?: number | null
          timer_elapsed_ms?: number | null
          total_accumulated_ms?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repair_timer_audit_repair_item_id_fkey"
            columns: ["repair_item_id"]
            isOneToOne: false
            referencedRelation: "repair_items"
            referencedColumns: ["id"]
          },
        ]
      }
      return_items: {
        Row: {
          condition: string
          created_at: string
          created_by: string
          credit_amount: number | null
          id: string
          item_name: string
          item_sku: string | null
          notes: string | null
          original_order_number: string | null
          quantity: number
          restockable: boolean | null
          return_reason: string
          updated_at: string
          warranty_status: string | null
        }
        Insert: {
          condition: string
          created_at?: string
          created_by?: string
          credit_amount?: number | null
          id?: string
          item_name: string
          item_sku?: string | null
          notes?: string | null
          original_order_number?: string | null
          quantity?: number
          restockable?: boolean | null
          return_reason: string
          updated_at?: string
          warranty_status?: string | null
        }
        Update: {
          condition?: string
          created_at?: string
          created_by?: string
          credit_amount?: number | null
          id?: string
          item_name?: string
          item_sku?: string | null
          notes?: string | null
          original_order_number?: string | null
          quantity?: number
          restockable?: boolean | null
          return_reason?: string
          updated_at?: string
          warranty_status?: string | null
        }
        Relationships: []
      }
      role_hierarchy: {
        Row: {
          can_delegate_permissions: boolean
          can_manage_permissions: boolean
          child_role: Database["public"]["Enums"]["app_role"]
          created_at: string
          id: string
          parent_role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          can_delegate_permissions?: boolean
          can_manage_permissions?: boolean
          child_role: Database["public"]["Enums"]["app_role"]
          created_at?: string
          id?: string
          parent_role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          can_delegate_permissions?: boolean
          can_manage_permissions?: boolean
          child_role?: Database["public"]["Enums"]["app_role"]
          created_at?: string
          id?: string
          parent_role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          company_scope: string | null
          created_at: string
          delegation_level: number | null
          granted_at: string | null
          granted_by: string | null
          granted_by_role: Database["public"]["Enums"]["app_role"] | null
          granted_by_user_id: string | null
          id: string
          is_granted: boolean
          max_delegatable: number | null
          permission_id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          company_scope?: string | null
          created_at?: string
          delegation_level?: number | null
          granted_at?: string | null
          granted_by?: string | null
          granted_by_role?: Database["public"]["Enums"]["app_role"] | null
          granted_by_user_id?: string | null
          id?: string
          is_granted?: boolean
          max_delegatable?: number | null
          permission_id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          company_scope?: string | null
          created_at?: string
          delegation_level?: number | null
          granted_at?: string | null
          granted_by?: string | null
          granted_by_role?: Database["public"]["Enums"]["app_role"] | null
          granted_by_user_id?: string | null
          id?: string
          is_granted?: boolean
          max_delegatable?: number | null
          permission_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_company_scope_fkey"
            columns: ["company_scope"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
        ]
      }
      serial_sequence_daily: {
        Row: {
          created_at: string | null
          date: string
          id: string
          last_sequence: number | null
          prefix: string
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          last_sequence?: number | null
          prefix: string
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          last_sequence?: number | null
          prefix?: string
        }
        Relationships: []
      }
      serialized_inventory: {
        Row: {
          allocated_to_order_id: string | null
          allocated_to_order_item_id: string | null
          assembly_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          inventory_item_id: string | null
          notes: string | null
          serial_number: string
          source_po_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          allocated_to_order_id?: string | null
          allocated_to_order_item_id?: string | null
          assembly_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          inventory_item_id?: string | null
          notes?: string | null
          serial_number: string
          source_po_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          allocated_to_order_id?: string | null
          allocated_to_order_item_id?: string | null
          assembly_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          inventory_item_id?: string | null
          notes?: string | null
          serial_number?: string
          source_po_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "serialized_inventory_allocated_to_order_id_fkey"
            columns: ["allocated_to_order_id"]
            isOneToOne: false
            referencedRelation: "customer_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serialized_inventory_allocated_to_order_item_id_fkey"
            columns: ["allocated_to_order_item_id"]
            isOneToOne: false
            referencedRelation: "customer_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serialized_inventory_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serialized_inventory_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "backordered_assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serialized_inventory_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "backordered_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serialized_inventory_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serialized_inventory_source_po_id_fkey"
            columns: ["source_po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      status_history: {
        Row: {
          changed_at: string
          changed_by: string
          id: string
          new_status: string
          notes: string | null
          old_status: string | null
          order_id: string
          order_type: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          id?: string
          new_status: string
          notes?: string | null
          old_status?: string | null
          order_id: string
          order_type: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          id?: string
          new_status?: string
          notes?: string | null
          old_status?: string | null
          order_id?: string
          order_type?: string
        }
        Relationships: []
      }
      store_credit_transactions: {
        Row: {
          amount: number
          check_number: string | null
          company_id: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          source_order_id: string | null
          source_type: string
          transaction_type: string
        }
        Insert: {
          amount: number
          check_number?: string | null
          company_id: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          source_order_id?: string | null
          source_type: string
          transaction_type: string
        }
        Update: {
          amount?: number
          check_number?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          source_order_id?: string | null
          source_type?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_credit_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_credit_transactions_source_order_id_fkey"
            columns: ["source_order_id"]
            isOneToOne: false
            referencedRelation: "orders_awaiting_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_credit_transactions_source_order_id_fkey"
            columns: ["source_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          api_config: Json | null
          api_customer_id: string | null
          api_integration_type: string | null
          contact_person: string | null
          created_at: string
          created_by: string
          default_shipping_carrier: string | null
          default_shipping_method: string | null
          email: string | null
          id: string
          is_active: boolean
          lead_time_days: number | null
          name: string
          notes: string | null
          payment_terms: string | null
          phone: string | null
          shipping_city: string | null
          shipping_country: string | null
          shipping_postal_code: string | null
          shipping_state: string | null
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          api_config?: Json | null
          api_customer_id?: string | null
          api_integration_type?: string | null
          contact_person?: string | null
          created_at?: string
          created_by: string
          default_shipping_carrier?: string | null
          default_shipping_method?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          lead_time_days?: number | null
          name: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_postal_code?: string | null
          shipping_state?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          api_config?: Json | null
          api_customer_id?: string | null
          api_integration_type?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string
          default_shipping_carrier?: string | null
          default_shipping_method?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          lead_time_days?: number | null
          name?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_postal_code?: string | null
          shipping_state?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      supplies_items: {
        Row: {
          created_at: string
          created_by: string
          id: string
          item_name: string
          item_type: string
          notes: string | null
          quantity: number
          supplier: string | null
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          item_name: string
          item_type: string
          notes?: string | null
          quantity?: number
          supplier?: string | null
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          item_name?: string
          item_type?: string
          notes?: string | null
          quantity?: number
          supplier?: string | null
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          setting_key: string
          setting_value: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          setting_key: string
          setting_value: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          setting_key?: string
          setting_value?: string
          updated_at?: string
        }
        Relationships: []
      }
      transaction_lines: {
        Row: {
          account_id: string
          created_at: string
          credit_amount: number | null
          debit_amount: number | null
          description: string | null
          id: string
          transaction_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          credit_amount?: number | null
          debit_amount?: number | null
          description?: string | null
          id?: string
          transaction_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          credit_amount?: number | null
          debit_amount?: number | null
          description?: string | null
          id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts_secure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_lines_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string
          description: string
          id: string
          is_reconciled: boolean
          reference_id: string | null
          reference_number: string | null
          total_amount: number
          transaction_date: string
          transaction_type: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by: string
          description: string
          id?: string
          is_reconciled?: boolean
          reference_id?: string | null
          reference_number?: string | null
          total_amount: number
          transaction_date?: string
          transaction_type: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          is_reconciled?: boolean
          reference_id?: string | null
          reference_number?: string | null
          total_amount?: number
          transaction_date?: string
          transaction_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_transactions_company"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      accounts_secure: {
        Row: {
          account_number: string | null
          account_subtype: Database["public"]["Enums"]["account_subtype"] | null
          account_type: Database["public"]["Enums"]["account_type"] | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          current_balance: number | null
          description: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          updated_at: string | null
        }
        Insert: {
          account_number?: never
          account_subtype?: never
          account_type?: never
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_balance?: never
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          account_number?: never
          account_subtype?: never
          account_type?: never
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_balance?: never
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_accounts_company"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      backordered_assemblies: {
        Row: {
          id: string | null
          quantity_allocated: number | null
          quantity_ats: number | null
          quantity_on_hand: number | null
          quantity_on_order: number | null
          resolution_status: string | null
          sales_description: string | null
          shortage_quantity: number | null
          sku: string | null
        }
        Insert: {
          id?: string | null
          quantity_allocated?: number | null
          quantity_ats?: number | null
          quantity_on_hand?: number | null
          quantity_on_order?: number | null
          resolution_status?: never
          sales_description?: string | null
          shortage_quantity?: never
          sku?: string | null
        }
        Update: {
          id?: string | null
          quantity_allocated?: number | null
          quantity_ats?: number | null
          quantity_on_hand?: number | null
          quantity_on_order?: number | null
          resolution_status?: never
          sales_description?: string | null
          shortage_quantity?: never
          sku?: string | null
        }
        Relationships: []
      }
      backordered_inventory_items: {
        Row: {
          id: string | null
          quantity_allocated: number | null
          quantity_ats: number | null
          quantity_on_hand: number | null
          quantity_on_order: number | null
          resolution_status: string | null
          sales_description: string | null
          shortage_quantity: number | null
          sku: string | null
        }
        Insert: {
          id?: string | null
          quantity_allocated?: number | null
          quantity_ats?: number | null
          quantity_on_hand?: number | null
          quantity_on_order?: number | null
          resolution_status?: never
          sales_description?: string | null
          shortage_quantity?: never
          sku?: string | null
        }
        Update: {
          id?: string | null
          quantity_allocated?: number | null
          quantity_ats?: number | null
          quantity_on_hand?: number | null
          quantity_on_order?: number | null
          resolution_status?: never
          sales_description?: string | null
          shortage_quantity?: never
          sku?: string | null
        }
        Relationships: []
      }
      orders_awaiting_stock: {
        Row: {
          blocked_item_count: number | null
          created_at: string | null
          customer_name: string | null
          days_waiting: number | null
          id: string | null
          order_number: string | null
          status: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      calculate_assembly_actual_lead_time: {
        Args: { assembly_id_param: string }
        Returns: {
          actual_lead_time_days: number
          data_points: number
        }[]
      }
      calculate_assembly_cost: {
        Args: { assembly_id_param: string }
        Returns: number
      }
      calculate_assembly_dynamic_reorder_point:
        | {
            Args: {
              assembly_id: string
              avg_daily_usage?: number
              lead_time_days: number
              usage_variance?: number
            }
            Returns: number
          }
        | {
            Args: { assembly_id_param: string; lead_time_days?: number }
            Returns: number
          }
      calculate_assembly_dynamic_reorder_point_with_actual_lead_time: {
        Args: { assembly_id_param: string }
        Returns: {
          actual_lead_time_days: number
          lead_time_data_points: number
          reorder_point: number
          safety_stock_tier: string
        }[]
      }
      calculate_assembly_lean_pull_reorder_point: {
        Args: {
          analysis_period_days?: number
          assembly_id_param: string
          lead_time_days: number
        }
        Returns: {
          actual_analysis_days: number
          demand_rate: number
          recommended_order_qty: number
          reorder_point: number
          safety_stock: number
        }[]
      }
      calculate_assembly_pull_demand_rate: {
        Args: { analysis_period_days?: number; assembly_id_param: string }
        Returns: number
      }
      calculate_assembly_rolling_averages: {
        Args: { assembly_id_param: string; target_date?: string }
        Returns: {
          annual_avg: number
          quarterly_avg: number
        }[]
      }
      calculate_assembly_statistical_safety_stock: {
        Args: {
          analysis_period_days?: number
          assembly_id_param: string
          lead_time_days: number
        }
        Returns: number
      }
      calculate_assembly_waste_metrics: {
        Args: { target_date?: string }
        Returns: string
      }
      calculate_density: {
        Args: { volume_cubic_inches: number; weight_oz: number }
        Returns: number
      }
      calculate_dynamic_reorder_point:
        | {
            Args: {
              avg_daily_usage?: number
              item_id: string
              lead_time_days: number
              usage_variance?: number
            }
            Returns: number
          }
        | {
            Args: {
              item_id: string
              lead_time_days: number
              spike_threshold?: number
            }
            Returns: number
          }
      calculate_dynamic_reorder_point_with_actual_lead_time: {
        Args: { item_id: string; spike_threshold?: number }
        Returns: {
          actual_lead_time_days: number
          lead_time_data_points: number
          reorder_point: number
          safety_stock_tier: string
        }[]
      }
      calculate_inventory_actual_lead_time: {
        Args: { item_id: string }
        Returns: {
          actual_lead_time_days: number
          data_points: number
        }[]
      }
      calculate_inventory_rolling_averages: {
        Args: { item_id: string; target_date?: string }
        Returns: {
          annual_avg: number
          quarterly_avg: number
          spike_factor: number
        }[]
      }
      calculate_lean_pull_reorder_point: {
        Args: {
          analysis_period_days?: number
          item_id: string
          lead_time_days: number
          minimum_order_quantity?: number
        }
        Returns: {
          actual_analysis_days: number
          demand_rate: number
          moq_coverage_days: number
          recommended_order_qty: number
          reorder_point: number
          safety_stock: number
        }[]
      }
      calculate_lean_pull_reorder_points: { Args: never; Returns: string }
      calculate_pull_demand_rate: {
        Args: { analysis_period_days?: number; item_id: string }
        Returns: number
      }
      calculate_simplified_assembly_reorder_point: {
        Args: { assembly_id_param: string }
        Returns: {
          actual_lead_time_days: number
          lead_time_data_points: number
          reorder_point: number
          safety_stock_tier: string
        }[]
      }
      calculate_simplified_reorder_point: {
        Args: {
          item_id: string
          lead_time_days: number
          spike_threshold?: number
        }
        Returns: {
          actual_lead_time_days: number
          lead_time_data_points: number
          reorder_point: number
          safety_stock_tier: string
        }[]
      }
      calculate_statistical_safety_stock: {
        Args: {
          analysis_period_days?: number
          item_id: string
          lead_time_days: number
        }
        Returns: number
      }
      can_access_field: {
        Args: {
          _action?: string
          _column_name: string
          _table_name: string
          _target_company_id?: string
          _user_id: string
        }
        Returns: boolean
      }
      can_delegate_permission: {
        Args: {
          _delegator_role: Database["public"]["Enums"]["app_role"]
          _delegator_user_id: string
          _permission_name: string
          _target_company_id?: string
          _target_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      can_manage_user: {
        Args: {
          _action: string
          _manager_user_id: string
          _target_user_id: string
        }
        Returns: boolean
      }
      can_role_manage_role: {
        Args: {
          _manager_role: Database["public"]["Enums"]["app_role"]
          _target_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      check_waste_threshold_alerts: {
        Args: { threshold_pct?: number }
        Returns: string
      }
      get_component_cost_trend: {
        Args: { assembly_id_param: string; date_from: string; date_to: string }
        Returns: {
          total_component_cost: number
          trend_date: string
        }[]
      }
      get_current_user_company_id: { Args: never; Returns: string }
      get_next_repair_order_number: { Args: never; Returns: string }
      get_next_serial_sequence: {
        Args: { p_date: string; p_prefix: string }
        Returns: number
      }
      get_order_item_remaining_quantity: {
        Args: { order_item_id: string }
        Returns: number
      }
      get_ready_to_build_production_orders: {
        Args: never
        Returns: {
          created_at: string
          customer_name: string
          id: string
          notes: string
          order_number: string
          priority: string
          status: string
          total_amount: number
        }[]
      }
      get_ready_to_build_subassembly_orders: {
        Args: never
        Returns: {
          created_at: string
          customer_name: string
          id: string
          notes: string
          order_number: string
          priority: string
          status: string
          store_at_point_of_use: boolean
          total_amount: number
        }[]
      }
      get_ready_to_ship_customer_orders: {
        Args: never
        Returns: {
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string
          customer_po: string
          id: string
          notes: string
          order_number: string
          priority: string
          shipping_preference: string
          status: string
          store_at_point_of_use: boolean
          total_amount: number
        }[]
      }
      get_role_hierarchy_path: {
        Args: { _child_role: Database["public"]["Enums"]["app_role"] }
        Returns: {
          depth: number
          role_path: Database["public"]["Enums"]["app_role"][]
        }[]
      }
      has_company_access: {
        Args: { target_company_id: string }
        Returns: boolean
      }
      has_granular_permission: {
        Args: {
          _permission_name: string
          _target_company_id?: string
          _user_id: string
        }
        Returns: boolean
      }
      has_granular_permission_hierarchical: {
        Args: {
          _permission_name: string
          _target_company_id?: string
          _user_id: string
        }
        Returns: boolean
      }
      has_permission:
        | {
            Args: { _permission_name: string; _user_id: string }
            Returns: boolean
          }
        | {
            Args: {
              _permission_name: string
              _target_company_id?: string
              _user_id: string
            }
            Returns: boolean
          }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_owner: { Args: never; Returns: boolean }
      populate_weekly_component_prices: { Args: never; Returns: string }
      recalculate_customer_order_fulfillment: {
        Args: { p_customer_order_id: string }
        Returns: undefined
      }
      recompute_subassembly_requirements: {
        Args: { target_order_id: string }
        Returns: undefined
      }
      resolve_permission_conflicts: {
        Args: {
          _permission_id: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      search_repair_items: {
        Args: { search_term: string }
        Returns: {
          company_email: string
          company_id: string
          company_name: string
          company_phone: string
          completion_outcome: string
          created_at: string
          customer_po: string
          delivered_at: string
          diagnosis: string
          id: string
          item_name: string
          mac_address: string
          outbound_tracking_number: string
          package_id: string
          problem_reported: string
          serial_number: string
          status: string
          tracking_number: string
          updated_at: string
        }[]
      }
      start_repair_timer: {
        Args: { p_repair_item_id: string; p_user_id: string }
        Returns: {
          current_elapsed_ms: number
          message: string
          success: boolean
          total_accumulated_ms: number
        }[]
      }
      stop_repair_timer: {
        Args: {
          p_repair_item_id: string
          p_session_ms: number
          p_user_id: string
        }
        Returns: {
          message: string
          new_total_ms: number
          success: boolean
        }[]
      }
      update_committed_inventory: { Args: never; Returns: undefined }
      update_daily_consumption_rates: { Args: never; Returns: string }
      update_daily_ttm_values: { Args: never; Returns: string }
    }
    Enums: {
      account_subtype:
        | "checking"
        | "credit_card"
        | "inventory"
        | "accounts_receivable"
        | "accounts_payable"
        | "sales"
        | "cost_of_goods_sold"
        | "operating_expenses"
        | "other_income"
        | "other_expenses"
      account_type: "asset" | "liability" | "equity" | "income" | "expense"
      app_role:
        | "admin"
        | "sales_support"
        | "production"
        | "distributor_admin"
        | "distributor_employee"
        | "vendor_admin"
        | "vendor_employee"
        | "car_wash_admin"
        | "car_wash_employee"
        | "accounting"
        | "marketing"
      order_type: "customer" | "assembly_build" | "repair"
      receiving_category:
        | "inventory"
        | "repairs"
        | "supplies"
        | "furniture"
        | "returns"
      shipping_carrier_type: "fedex" | "ups" | "usps"
      shipping_preference: "ship_complete" | "ship_as_available"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_subtype: [
        "checking",
        "credit_card",
        "inventory",
        "accounts_receivable",
        "accounts_payable",
        "sales",
        "cost_of_goods_sold",
        "operating_expenses",
        "other_income",
        "other_expenses",
      ],
      account_type: ["asset", "liability", "equity", "income", "expense"],
      app_role: [
        "admin",
        "sales_support",
        "production",
        "distributor_admin",
        "distributor_employee",
        "vendor_admin",
        "vendor_employee",
        "car_wash_admin",
        "car_wash_employee",
        "accounting",
        "marketing",
      ],
      order_type: ["customer", "assembly_build", "repair"],
      receiving_category: [
        "inventory",
        "repairs",
        "supplies",
        "furniture",
        "returns",
      ],
      shipping_carrier_type: ["fedex", "ups", "usps"],
      shipping_preference: ["ship_complete", "ship_as_available"],
    },
  },
} as const
