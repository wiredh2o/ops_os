import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Timer, Play, Pause, Square, AlertTriangle } from "lucide-react";
import { formatHoursToHrMin, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

interface WasteTrackingInterfaceProps {
  productionOrderItemId: string;
  assemblyId?: string;
  assemblySku?: string;
  initialPlannedQuantity?: number;
  onWasteDataUpdate?: (wasteData: WasteTrackingData) => void;
}

interface WasteTrackingData {
  planned_build_quantity?: number;
  yield_quantity?: number;
  waste_quantity?: number;
  waste_percentage?: number;
  setup_timer_ms?: number;
  build_test_timer_ms?: number;
  setup_completed_at?: string;
  build_completed_at?: string;
  materials_consumed_cost?: number;
  materials_wasted_cost?: number;
  cost_per_good_unit?: number;
}

interface TimerState {
  phase: 'idle' | 'setup' | 'build_test' | 'completed';
  setupMs: number;
  buildTestMs: number;
  isRunning: boolean;
  startTime?: number;
}

export function WasteTrackingInterface({
  productionOrderItemId,
  assemblyId,
  assemblySku,
  initialPlannedQuantity = 1,
  onWasteDataUpdate
}: WasteTrackingInterfaceProps) {
  const [wasteData, setWasteData] = useState<WasteTrackingData>({
    planned_build_quantity: initialPlannedQuantity
  });
  
  const [timer, setTimer] = useState<TimerState>({
    phase: 'idle',
    setupMs: 0,
    buildTestMs: 0,
    isRunning: false
  });

  // Timer effect - updates every second when running
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (timer.isRunning && timer.startTime) {
      interval = setInterval(() => {
        const elapsed = Date.now() - timer.startTime!;
        
        setTimer(prev => ({
          ...prev,
          [timer.phase === 'setup' ? 'setupMs' : 'buildTestMs']: 
            prev[timer.phase === 'setup' ? 'setupMs' : 'buildTestMs'] + elapsed - (prev.startTime ? Date.now() - prev.startTime : 0)
        }));
      }, 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timer.isRunning, timer.startTime, timer.phase]);

  // Start setup phase timer
  const startSetupTimer = () => {
    if (timer.phase !== 'idle') return;
    
    setTimer({
      phase: 'setup',
      setupMs: 0,
      buildTestMs: 0,
      isRunning: true,
      startTime: Date.now()
    });
    toast.success('Setup phase started');
  };

  // Complete setup and start build+test phase
  const completeSetupAndStartBuild = () => {
    if (timer.phase !== 'setup') return;
    
    const setupTime = timer.setupMs + (timer.startTime ? Date.now() - timer.startTime : 0);
    const completedAt = new Date().toISOString();
    
    setWasteData(prev => ({
      ...prev,
      setup_timer_ms: setupTime,
      setup_completed_at: completedAt
    }));
    
    setTimer({
      phase: 'build_test',
      setupMs: setupTime,
      buildTestMs: 0,
      isRunning: true,
      startTime: Date.now()
    });
    
    toast.success('Setup completed, build+test phase started');
  };

  // Complete build+test phase
  const completeBuildTest = () => {
    if (timer.phase !== 'build_test') return;
    
    const buildTestTime = timer.buildTestMs + (timer.startTime ? Date.now() - timer.startTime : 0);
    const completedAt = new Date().toISOString();
    
    const updatedData = {
      ...wasteData,
      build_test_timer_ms: buildTestTime,
      build_completed_at: completedAt
    };
    
    setWasteData(updatedData);
    
    setTimer(prev => ({
      ...prev,
      phase: 'completed',
      buildTestMs: buildTestTime,
      isRunning: false,
      startTime: undefined
    }));
    
    toast.success('Build+test phase completed');
    onWasteDataUpdate?.(updatedData);
  };

  // Pause/resume timer
  const toggleTimer = () => {
    if (timer.phase === 'idle' || timer.phase === 'completed') return;
    
    if (timer.isRunning) {
      // Pause
      const elapsed = timer.startTime ? Date.now() - timer.startTime : 0;
      setTimer(prev => ({
        ...prev,
        isRunning: false,
        startTime: undefined,
        [timer.phase === 'setup' ? 'setupMs' : 'buildTestMs']: 
          prev[timer.phase === 'setup' ? 'setupMs' : 'buildTestMs'] + elapsed
      }));
      toast.info('Timer paused');
    } else {
      // Resume
      setTimer(prev => ({
        ...prev,
        isRunning: true,
        startTime: Date.now()
      }));
      toast.info('Timer resumed');
    }
  };

  // Calculate waste metrics when yield/waste quantities change
  useEffect(() => {
    const { planned_build_quantity, yield_quantity, waste_quantity } = wasteData;
    
    if (planned_build_quantity && (yield_quantity !== undefined || waste_quantity !== undefined)) {
      const actualYield = yield_quantity || 0;
      const actualWaste = waste_quantity || 0;
      const wastePercentage = planned_build_quantity > 0 
        ? (actualWaste / planned_build_quantity) * 100 
        : 0;
      
      setWasteData(prev => ({
        ...prev,
        waste_percentage: wastePercentage
      }));
    }
  }, [wasteData.planned_build_quantity, wasteData.yield_quantity, wasteData.waste_quantity]);

  const handleInputChange = (field: keyof WasteTrackingData, value: number) => {
    const updatedData = {
      ...wasteData,
      [field]: value
    };
    setWasteData(updatedData);
    onWasteDataUpdate?.(updatedData);
  };

  const getCurrentPhaseTime = () => {
    if (!timer.isRunning || !timer.startTime) return 0;
    const elapsed = Date.now() - timer.startTime;
    return timer.phase === 'setup' 
      ? timer.setupMs + elapsed 
      : timer.buildTestMs + elapsed;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Timer className="h-5 w-5" />
          Assembly Waste Tracking
          {assemblySku && <Badge variant="outline">{assemblySku}</Badge>}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Two-Phase Timer Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Production Timing</h3>
          
          <div className="grid grid-cols-2 gap-4">
            {/* Setup Phase */}
            <Card className={`p-4 ${timer.phase === 'setup' ? 'ring-2 ring-primary' : ''}`}>
              <div className="text-center space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Setup Phase</div>
                <div className="text-2xl font-mono">
                  {formatHoursToHrMin((timer.phase === 'setup' ? getCurrentPhaseTime() : timer.setupMs) / 3600000)}
                </div>
                <div className="flex justify-center gap-2">
                  {timer.phase === 'idle' && (
                    <Button size="sm" onClick={startSetupTimer}>
                      <Play className="h-4 w-4 mr-1" />
                      Start Setup
                    </Button>
                  )}
                  {timer.phase === 'setup' && (
                    <>
                      <Button size="sm" variant="outline" onClick={toggleTimer}>
                        {timer.isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button size="sm" onClick={completeSetupAndStartBuild}>
                        <Square className="h-4 w-4 mr-1" />
                        Complete Setup
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>

            {/* Build+Test Phase */}
            <Card className={`p-4 ${timer.phase === 'build_test' ? 'ring-2 ring-primary' : ''}`}>
              <div className="text-center space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Build + Test Phase</div>
                <div className="text-2xl font-mono">
                  {formatHoursToHrMin((timer.phase === 'build_test' ? getCurrentPhaseTime() : timer.buildTestMs) / 3600000)}
                </div>
                <div className="flex justify-center gap-2">
                  {timer.phase === 'build_test' && (
                    <>
                      <Button size="sm" variant="outline" onClick={toggleTimer}>
                        {timer.isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button size="sm" onClick={completeBuildTest}>
                        <Square className="h-4 w-4 mr-1" />
                        Complete Build
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          </div>
        </div>

        <Separator />

        {/* Quantity Tracking Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Quantity & Waste Tracking</h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="planned-quantity">Planned Quantity</Label>
              <Input
                id="planned-quantity"
                type="number"
                value={wasteData.planned_build_quantity || 0}
                onChange={(e) => handleInputChange('planned_build_quantity', parseInt(e.target.value) || 0)}
                min="0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="yield-quantity">Yield Quantity</Label>
              <Input
                id="yield-quantity"
                type="number"
                value={wasteData.yield_quantity || 0}
                onChange={(e) => handleInputChange('yield_quantity', parseInt(e.target.value) || 0)}
                min="0"
                max={wasteData.planned_build_quantity || 0}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="waste-quantity">Waste Quantity</Label>
              <Input
                id="waste-quantity"
                type="number"
                value={wasteData.waste_quantity || 0}
                onChange={(e) => handleInputChange('waste_quantity', parseInt(e.target.value) || 0)}
                min="0"
                max={wasteData.planned_build_quantity || 0}
              />
            </div>

            <div className="space-y-2">
              <Label>Waste Percentage</Label>
              <div className="flex items-center h-10 px-3 py-2 border border-input bg-background rounded-md">
                <span className="text-sm">
                  {wasteData.waste_percentage?.toFixed(1) || '0.0'}%
                </span>
                {wasteData.waste_percentage && wasteData.waste_percentage > 10 && (
                  <AlertTriangle className="h-4 w-4 ml-2 text-destructive" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Cost Impact Section */}
        {wasteData.waste_percentage && wasteData.waste_percentage > 0 && (
          <>
            <Separator />
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Cost Impact</h3>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="consumed-cost">Materials Consumed Cost</Label>
                  <Input
                    id="consumed-cost"
                    type="number"
                    step="0.0001"
                    value={wasteData.materials_consumed_cost || 0}
                    onChange={(e) => handleInputChange('materials_consumed_cost', parseFloat(e.target.value) || 0)}
                    min="0"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="wasted-cost">Materials Wasted Cost</Label>
                  <Input
                    id="wasted-cost"
                    type="number"
                    step="0.0001"
                    value={wasteData.materials_wasted_cost || 0}
                    onChange={(e) => handleInputChange('materials_wasted_cost', parseFloat(e.target.value) || 0)}
                    min="0"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Cost Per Good Unit</Label>
                  <div className="flex items-center h-10 px-3 py-2 border border-input bg-background rounded-md">
                    <span className="text-sm">
                      {formatCurrency((wasteData.materials_consumed_cost || 0) / Math.max(wasteData.yield_quantity || 1, 1))}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Status Summary */}
        <div className="flex flex-wrap gap-2">
          <Badge variant={timer.phase === 'completed' ? 'default' : 'secondary'}>
            Phase: {timer.phase.replace('_', ' ').toUpperCase()}
          </Badge>
          {wasteData.waste_percentage && (
            <Badge variant={wasteData.waste_percentage > 10 ? 'destructive' : wasteData.waste_percentage > 5 ? 'secondary' : 'default'}>
              Waste: {wasteData.waste_percentage.toFixed(1)}%
            </Badge>
          )}
          {timer.setupMs > 0 && (
            <Badge variant="outline">
              Setup: {formatHoursToHrMin(timer.setupMs / 3600000)}
            </Badge>
          )}
          {timer.buildTestMs > 0 && (
            <Badge variant="outline">
              Build: {formatHoursToHrMin(timer.buildTestMs / 3600000)}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}