import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Package, AlertTriangle, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PendingSerialsDashboardWidgetProps {
  onNavigate?: () => void;
}

export function PendingSerialsDashboardWidget({ onNavigate }: PendingSerialsDashboardWidgetProps) {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchCount();
    
    // Set up realtime subscription
    const channel = supabase
      .channel('pending-serials-count')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'customer_order_items',
          filter: 'serial_pending=eq.true',
        },
        () => {
          fetchCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchCount = async () => {
    try {
      const { count: pendingCount, error } = await supabase
        .from('customer_order_items')
        .select('*', { count: 'exact', head: true })
        .eq('serial_pending', true);

      if (error) throw error;
      setCount(pendingCount || 0);
    } catch (err) {
      console.error('Error fetching pending serials count:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => {
    if (onNavigate) {
      onNavigate();
    } else {
      navigate('/pending-serials');
    }
  };

  if (loading || count === 0) {
    return null;
  }

  return (
    <Card 
      className="border-destructive/30 bg-destructive/5 cursor-pointer hover:bg-destructive/10 transition-colors"
      onClick={handleClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-destructive/10 rounded-full">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">
                  Pending Serial Numbers
                </p>
                <Badge variant="destructive" className="text-xs">
                  {count}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Items awaiting vendor serial assignment
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm">
            View
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
