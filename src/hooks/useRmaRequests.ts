import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { readQueuePages } from '@/lib/queue-data';

export function useRmaRequests(receivableOnly = false) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['rma-requests', user?.id, receivableOnly],
    enabled: Boolean(user),
    queryFn: () => readQueuePages((from, to) => {
      let query = supabase.from('rma_requests').select('*').order('created_at', { ascending: false }).order('id');
      if (receivableOnly) query = query.in('status', ['issued', 'in_transit']);
      return query.range(from, to);
    }),
    refetchInterval: 30000,
  });
}