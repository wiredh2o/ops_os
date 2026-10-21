import { z } from 'zod';
import type { Database } from '@/integrations/supabase/types';

export type RmaRequest = Database['public']['Tables']['rma_requests']['Row'];
export const RMA_REQUEST_ROLES = ['car_wash_admin', 'car_wash_employee', 'distributor_admin', 'distributor_employee'] as const;
export const RMA_REVIEW_ROLES = ['admin', 'sales_support', 'tech_support'] as const;
export const canRequestRma = (roles: readonly string[]) => roles.some(role => (RMA_REQUEST_ROLES as readonly string[]).includes(role));
export const canReviewRma = (roles: readonly string[]) => roles.some(role => (RMA_REVIEW_ROLES as readonly string[]).includes(role));
export const canReceiveRma = (roles: readonly string[]) => canReviewRma(roles) || roles.includes('production');
export const canAddRmaTracking = (status: string) => ['issued', 'in_transit'].includes(status);
export const RMA_LABEL_CARRIERS = ['ups', 'fedex'] as const;
export const rmaItemSchema = z.object({
  item_name: z.string().trim().min(1).max(255),
  quantity: z.coerce.number().int().min(1).max(1000),
  serial_number: z.string().trim().max(255).optional(),
  mac_address: z.string().trim().max(255).optional(),
});
export const rmaRequestSchema = z.object({
  items: z.array(rmaItemSchema).min(1).max(100),
  problem: z.string().trim().min(1).max(10000),
  returnAddress: z.string().trim().max(2000),
  customerPo: z.string().trim().max(255),
});
export type RmaItem = z.infer<typeof rmaItemSchema>;
export function getRmaItems(value: unknown): RmaItem[] {
  const result = z.array(rmaItemSchema).safeParse(value);
  return result.success ? result.data : [];
}
export function rmaIntakeNotes(rma: RmaRequest): string {
  return [rma.rma_number, rma.problem_reported, ...getRmaItems(rma.items).map(item =>
    `${item.quantity} x ${item.item_name}${item.serial_number ? ` | Serial: ${item.serial_number}` : ''}${item.mac_address ? ` | MAC: ${item.mac_address}` : ''}`)].join('\n');
}
export const rmaStatusLabel = (status: string) => ({ requested: 'Awaiting approval', appointment_invited: 'Tech-support appointment invited', issued: 'RMA issued', in_transit: 'Return in transit', received: 'Received — repair processing' }[status] || status);