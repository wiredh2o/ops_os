import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { AlertTriangle, TrendingUp, TrendingDown, DollarSign, Clock, RefreshCw } from "lucide-react";
import { useAssemblyWasteTracking } from "@/hooks/useAssemblyWasteTracking";
import { format, subDays, startOfWeek, endOfWeek } from "date-fns";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";

interface AssemblyOption {
  id: string;
  sku: string;
}

export function WasteAnalyticsDashboard() {
  const [selectedAssemblyId, setSelectedAssemblyId] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('30d');
  const [assemblies, setAssemblies] = useState<AssemblyOption[]>([]);
  const [componentCostTrend, setComponentCostTrend] = useState<any[]>([]);
  
  const {
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
  } = useAssemblyWasteTracking();

  // Calculate date range
  const getDateRange = () => {
    const today = new Date();
    const days = parseInt(dateRange.replace('d', ''));
    return {
      from: format(subDays(today, days), 'yyyy-MM-dd'),
      to: format(today, 'yyyy-MM-dd')
    };
  };

  // Fetch assemblies for dropdown
  useEffect(() => {
    const fetchAssemblies = async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data, error } = await supabase
          .from('assemblies')
          .select('id, sku')
          .order('sku');
          
        if (error) throw error;
        setAssemblies(data || []);
      } catch (error) {
        console.error('Error fetching assemblies:', error);
      }
    };
    
    fetchAssemblies();
  }, []);

  // Fetch data when filters change
  useEffect(() => {
    const { from, to } = getDateRange();
    const assemblyId = selectedAssemblyId === 'all' ? undefined : selectedAssemblyId;
    
    fetchWasteMetrics(assemblyId, from, to);
    fetchWasteAlerts('active');
    
    // Fetch component cost trend if specific assembly selected
    if (assemblyId) {
      getComponentCostTrend(assemblyId, from, to).then(setComponentCostTrend);
    } else {
      setComponentCostTrend([]);
    }
  }, [selectedAssemblyId, dateRange]);

  // Calculate summary statistics
  const summaryStats = {
    totalWasteEvents: wasteMetrics.length,
    avgWastePercentage: wasteMetrics.length > 0 
      ? wasteMetrics.reduce((sum, m) => sum + m.waste_percentage, 0) / wasteMetrics.length 
      : 0,
    totalWasteQuantity: wasteMetrics.reduce((sum, m) => sum + m.total_waste_quantity, 0),
    totalYieldQuantity: wasteMetrics.reduce((sum, m) => sum + m.total_yield_quantity, 0),
    activeAlerts: wasteAlerts.filter(a => a.alert_status === 'active').length
  };

  // Prepare chart data
  const wasteChartData = wasteMetrics.map(metric => ({
    date: format(new Date(metric.analysis_date), 'MM/dd'),
    wastePercentage: metric.waste_percentage,
    setupTime: metric.setup_time_per_unit,
    buildTime: metric.build_time_per_unit,
    totalQuantity: metric.total_planned_quantity,
    yieldQuantity: metric.total_yield_quantity,
    wasteQuantity: metric.total_waste_quantity
  }));

  const costTrendData = componentCostTrend.map(trend => ({
    date: format(new Date(trend.trend_date), 'MM/dd'),
    cost: trend.total_component_cost
  }));

  const handleRefreshData = async () => {
    await triggerWasteCalculation();
    const { from, to } = getDateRange();
    const assemblyId = selectedAssemblyId === 'all' ? undefined : selectedAssemblyId;
    await fetchWasteMetrics(assemblyId, from, to);
  };

  return (
    <div className="space-y-6">
      {/* Header with Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Assembly Waste Analytics</h2>
          <p className="text-muted-foreground">Monitor waste rates, cost trends, and process efficiency</p>
        </div>
        
        <div className="flex gap-2">
          <Select value={selectedAssemblyId} onValueChange={setSelectedAssemblyId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select Assembly" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assemblies</SelectItem>
              {assemblies.map(assembly => (
                <SelectItem key={assembly.id} value={assembly.id}>
                  {assembly.sku}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 Days</SelectItem>
              <SelectItem value="30d">30 Days</SelectItem>
              <SelectItem value="90d">90 Days</SelectItem>
            </SelectContent>
          </Select>
          
          <Button onClick={handleRefreshData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Waste Rate</p>
                <p className="text-2xl font-bold">{summaryStats.avgWastePercentage.toFixed(1)}%</p>
              </div>
              <TrendingDown className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Waste</p>
                <p className="text-2xl font-bold">{summaryStats.totalWasteQuantity}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Yield</p>
                <p className="text-2xl font-bold">{summaryStats.totalYieldQuantity}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Waste Events</p>
                <p className="text-2xl font-bold">{summaryStats.totalWasteEvents}</p>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Alerts</p>
                <p className="text-2xl font-bold">{summaryStats.activeAlerts}</p>
              </div>
              <AlertTriangle className={`h-8 w-8 ${summaryStats.activeAlerts > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="trends" className="space-y-4">
        <TabsList>
          <TabsTrigger value="trends">Waste Trends</TabsTrigger>
          <TabsTrigger value="cost-analysis">Cost Analysis</TabsTrigger>
          <TabsTrigger value="alerts">Active Alerts</TabsTrigger>
          <TabsTrigger value="efficiency">Time Efficiency</TabsTrigger>
        </TabsList>

        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Waste Percentage Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={wasteChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value: number, name: string) => [
                      `${value.toFixed(1)}%`,
                      'Waste Percentage'
                    ]}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="wastePercentage" 
                    stroke="hsl(var(--destructive))" 
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quantity Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={wasteChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="yieldQuantity" fill="hsl(var(--primary))" name="Yield" />
                  <Bar dataKey="wasteQuantity" fill="hsl(var(--destructive))" name="Waste" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cost-analysis" className="space-y-4">
          {selectedAssemblyId !== 'all' ? (
            <Card>
              <CardHeader>
                <CardTitle>Component Cost Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={costTrendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value: number) => [formatCurrency(value), 'Component Cost']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="cost" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6">
                <div className="text-center text-muted-foreground">
                  <DollarSign className="h-12 w-12 mx-auto mb-4" />
                  <p>Select a specific assembly to view component cost trends</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <div className="space-y-4">
            {wasteAlerts.length === 0 ? (
              <Card>
                <CardContent className="p-6">
                  <div className="text-center text-muted-foreground">
                    <AlertTriangle className="h-12 w-12 mx-auto mb-4" />
                    <p>No active waste alerts</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              wasteAlerts.map(alert => (
                <Card key={alert.id}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="destructive">
                            {alert.alert_status.toUpperCase()}
                          </Badge>
                          <span className="font-medium">
                            {alert.assembly?.sku} - Waste Threshold Exceeded
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <p>Current waste rate: {alert.current_waste_rate.toFixed(1)}%</p>
                          <p>Historical average: {alert.historical_average.toFixed(1)}%</p>
                          <p>Variance: +{alert.variance_amount.toFixed(1)}%</p>
                          <p>Alert date: {format(new Date(alert.alert_date), 'PPP')}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {alert.alert_status === 'active' && (
                          <>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => acknowledgeAlert(alert.id)}
                            >
                              Acknowledge
                            </Button>
                            <Button 
                              size="sm"
                              onClick={() => resolveAlert(alert.id)}
                            >
                              Resolve
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="efficiency" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Setup Time per Unit</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={wasteChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value: number) => [`${value.toFixed(2)} hrs`, 'Setup Time/Unit']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="setupTime" 
                      stroke="hsl(var(--secondary))" 
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Build Time per Unit</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={wasteChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value: number) => [`${value.toFixed(2)} hrs`, 'Build Time/Unit']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="buildTime" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}