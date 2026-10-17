import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AssemblyWasteMetrics {
  id: string;
  assembly_id: string;
  analysis_date: string;
  total_planned_quantity: number;
  total_yield_quantity: number;
  total_waste_quantity: number;
  waste_percentage: number;
  materials_efficiency: number;
  setup_time_per_unit: number;
  build_time_per_unit: number;
  component_cost_trend: number;
}

export interface AssemblyWasteAlert {
  id: string;
  assembly_id: string;
  alert_date: string;
  current_waste_rate: number;
  historical_average: number;
  threshold_percentage: number;
  variance_amount: number;
  alert_status: 'active' | 'acknowledged' | 'resolved';
  acknowledged_by?: string;
  acknowledged_at?: string;
  assembly?: {
    sku: string;
    description?: string;
  };
}

export interface ComponentCostTrend {
  trend_date: string;
  total_component_cost: number;
}

export function useAssemblyWasteTracking() {
  const [wasteMetrics, setWasteMetrics] = useState<AssemblyWasteMetrics[]>([]);
  const [wasteAlerts, setWasteAlerts] = useState<AssemblyWasteAlert[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch waste metrics for a specific assembly or all assemblies
  const fetchWasteMetrics = async (assemblyId?: string, dateFrom?: string, dateTo?: string) => {
    setLoading(true);
    try {
      let query = supabase
        .from('assembly_waste_analytics')
        .select('*')
        .order('analysis_date', { ascending: false });

      if (assemblyId) {
        query = query.eq('assembly_id', assemblyId);
      }

      if (dateFrom) {
        query = query.gte('analysis_date', dateFrom);
      }

      if (dateTo) {
        query = query.lte('analysis_date', dateTo);
      }

      const { data, error } = await query;

      if (error) throw error;
      setWasteMetrics(data || []);
    } catch (error) {
      console.error('Error fetching waste metrics:', error);
      toast.error('Failed to fetch waste metrics');
    } finally {
      setLoading(false);
    }
  };

  // Fetch active waste alerts
  const fetchWasteAlerts = async (status?: 'active' | 'acknowledged' | 'resolved') => {
    setLoading(true);
    try {
      let query = supabase
        .from('assembly_waste_alerts')
        .select(`
          *,
          assembly:assemblies(sku, description)
        `)
        .order('alert_date', { ascending: false });

      if (status) {
        query = query.eq('alert_status', status);
      }

      const { data, error } = await query;

      if (error) throw error;
      setWasteAlerts((data || []).map(alert => ({
        ...alert,
        alert_status: alert.alert_status as 'active' | 'acknowledged' | 'resolved',
        assembly: Array.isArray(alert.assembly) ? alert.assembly[0] : alert.assembly
      })) as AssemblyWasteAlert[]);
    } catch (error) {
      console.error('Error fetching waste alerts:', error);
      toast.error('Failed to fetch waste alerts');
    } finally {
      setLoading(false);
    }
  };

  // Get component cost trend for an assembly
  const getComponentCostTrend = async (
    assemblyId: string, 
    dateFrom: string, 
    dateTo: string
  ): Promise<ComponentCostTrend[]> => {
    try {
      const { data, error } = await supabase.rpc('get_component_cost_trend', {
        assembly_id_param: assemblyId,
        date_from: dateFrom,
        date_to: dateTo
      });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching component cost trend:', error);
      toast.error('Failed to fetch component cost trend');
      return [];
    }
  };

  // Acknowledge a waste alert
  const acknowledgeAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('assembly_waste_alerts')
        .update({
          alert_status: 'acknowledged',
          acknowledged_by: (await supabase.auth.getUser()).data.user?.id,
          acknowledged_at: new Date().toISOString()
        })
        .eq('id', alertId);

      if (error) throw error;
      
      toast.success('Alert acknowledged');
      await fetchWasteAlerts(); // Refresh alerts
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      toast.error('Failed to acknowledge alert');
    }
  };

  // Resolve a waste alert
  const resolveAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('assembly_waste_alerts')
        .update({
          alert_status: 'resolved'
        })
        .eq('id', alertId);

      if (error) throw error;
      
      toast.success('Alert resolved');
      await fetchWasteAlerts(); // Refresh alerts
    } catch (error) {
      console.error('Error resolving alert:', error);
      toast.error('Failed to resolve alert');
    }
  };

  // Trigger waste metrics calculation for a specific date
  const triggerWasteCalculation = async (targetDate?: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('daily-waste-monitoring', {
        body: { target_date: targetDate }
      });

      if (error) throw error;
      
      toast.success('Waste calculation completed');
      await fetchWasteMetrics(); // Refresh metrics
      return data;
    } catch (error) {
      console.error('Error triggering waste calculation:', error);
      toast.error('Failed to trigger waste calculation');
      throw error;
    }
  };

  // Trigger weekly component price update
  const triggerPriceUpdate = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('weekly-component-price-update');

      if (error) throw error;
      
      toast.success('Component prices updated');
      return data;
    } catch (error) {
      console.error('Error updating component prices:', error);
      toast.error('Failed to update component prices');
      throw error;
    }
  };

  return {
    wasteMetrics,
    wasteAlerts,
    loading,
    fetchWasteMetrics,
    fetchWasteAlerts,
    getComponentCostTrend,
    acknowledgeAlert,
    resolveAlert,
    triggerWasteCalculation,
    triggerPriceUpdate
  };
}