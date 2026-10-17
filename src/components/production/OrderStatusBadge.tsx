import React from 'react';
import { Badge } from '@/components/ui/badge';

interface OrderStatusBadgeProps {
  status: string;
  type: 'production' | 'repair' | 'repair_item';
}

export const OrderStatusBadge: React.FC<OrderStatusBadgeProps> = ({ status, type }) => {
  const getStatusConfig = () => {
    const configs = {
      production: {
        pending: { label: 'Pending', className: 'bg-status-pending text-black' },
        in_progress: { label: 'In Progress', className: 'bg-status-progress text-white' },
        quality_check: { label: 'Quality Check', className: 'bg-status-warning text-white' },
        completed: { label: 'Completed', className: 'bg-status-complete text-white' },
        label_staged: { label: 'Label Staged', className: 'bg-indigo-500 text-white' },
        awaiting_pickup: { label: 'Awaiting Pickup', className: 'bg-purple-600 text-white' },
        ready_for_pickup: { label: 'Ready for Pick-Up', className: 'bg-teal-600 text-white' },
        picked_up: { label: 'Picked Up', className: 'bg-emerald-600 text-white' },
        in_transit: { label: 'In Transit', className: 'bg-cyan-600 text-white' },
        delivered: { label: 'Delivered', className: 'bg-emerald-600 text-white' },
        cancelled: { label: 'Cancelled', className: 'bg-status-error text-white' },
      },
      repair: {
        received: { label: 'Received', className: 'bg-status-pending text-black' },
        diagnosed: { label: 'Diagnosed', className: 'bg-status-progress text-white' },
        parts_ordered: { label: 'Parts Ordered', className: 'bg-status-warning text-white' },
        in_repair: { label: 'In Repair', className: 'bg-status-progress text-white' },
        quality_check: { label: 'Quality Check', className: 'bg-status-warning text-white' },
        completed: { label: 'Completed', className: 'bg-status-complete text-white' },
        label_staged: { label: 'Label Staged', className: 'bg-indigo-500 text-white' },
        awaiting_pickup: { label: 'Awaiting Pickup', className: 'bg-purple-600 text-white' },
        ready_for_pickup: { label: 'Ready for Pick-Up', className: 'bg-teal-600 text-white' },
        picked_up: { label: 'Picked Up', className: 'bg-emerald-600 text-white' },
        in_transit: { label: 'In Transit', className: 'bg-cyan-600 text-white' },
        delivered: { label: 'Delivered', className: 'bg-emerald-600 text-white' },
        cancelled: { label: 'Cancelled', className: 'bg-status-error text-white' },
      },
      repair_item: {
        // Repair phase
        logged: { label: 'Logged', className: 'bg-muted text-muted-foreground' },
        diagnosed: { label: 'Diagnosed', className: 'bg-blue-500 text-white' },
        in_repair: { label: 'In Repair', className: 'bg-amber-500 text-white' },
        completed: { label: 'Completed', className: 'bg-green-500 text-white' },
        // Shipping phase
        queued_for_shipping: { label: 'Queued for Shipping', className: 'bg-amber-600 text-white' },
        label_staged: { label: 'Label Staged', className: 'bg-indigo-500 text-white' },
        awaiting_pickup: { label: 'Awaiting Pickup', className: 'bg-purple-600 text-white' },
        in_transit: { label: 'In Transit', className: 'bg-cyan-600 text-white' },
        delivered: { label: 'Delivered', className: 'bg-emerald-600 text-white' },
        // Legacy
        invoiced: { label: 'Invoiced', className: 'bg-slate-500 text-white' },
      }
    };

    const typeConfig = configs[type] || configs.production;
    return typeConfig[status as keyof typeof typeConfig] || { 
      label: status, 
      className: 'bg-muted text-muted-foreground' 
    };
  };

  const config = getStatusConfig();

  return (
    <Badge className={config.className}>
      {config.label}
    </Badge>
  );
};