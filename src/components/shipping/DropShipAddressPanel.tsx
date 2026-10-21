import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AddressSelector } from './AddressSelector';
import { AddAddressForm } from './AddAddressForm';
import { EditAddressForm } from './EditAddressForm';
import type { DropShipAddress } from '@/lib/drop-ship';

interface Props {
  /** Distributor that owns the drop-ship addresses. */
  ownerCompanyId: string;
  selectedId: string | null;
  onSelect: (address: DropShipAddress) => void;
}

type FormAddress = { name: string; address: string; city: string; state: string; zip: string; country: string; signature_required: boolean; is_taxable?: boolean; usps_eligible?: boolean; email?: string | null; phone?: string | null };

const toRow = (a: FormAddress) => ({
  recipient_name: a.name, address: a.address, city: a.city, state: a.state, zip: a.zip, country: 'US',
  signature_required: a.signature_required, is_taxable: a.is_taxable !== false, usps_eligible: a.usps_eligible === true,
  email: a.email?.trim() || null, phone: a.phone?.trim() || null,
});

/** Saved, reusable distributor drop-ship addresses (never linked to a car-wash account). */
export function DropShipAddressPanel({ ownerCompanyId, selectedId, onSelect }: Props) {
  const { toast } = useToast();
  const [addresses, setAddresses] = useState<DropShipAddress[]>([]);
  const [mode, setMode] = useState<'list' | 'add' | DropShipAddress>('list');

  const load = async () => {
    const { data, error } = await supabase.from('drop_ship_addresses' as any).select('*').eq('owner_company_id', ownerCompanyId).eq('is_active', true).order('recipient_name');
    if (error) { toast({ title: 'Could not load drop-ship addresses', description: error.message, variant: 'destructive' }); return; }
    setAddresses((data || []) as unknown as DropShipAddress[]);
  };
  useEffect(() => { setMode('list'); load(); }, [ownerCompanyId]);

  const asSelectorAddress = (a: DropShipAddress) => ({ ...a, name: a.recipient_name, drop_ship: true });
  const selected = addresses.find(a => a.id === selectedId) || null;

  if (mode === 'add') return (
    <AddAddressForm dropShip onCancel={() => setMode('list')} onSave={async (a) => {
      const { data, error } = await supabase.from('drop_ship_addresses' as any).insert({ ...toRow(a), owner_company_id: ownerCompanyId }).select('*').single();
      if (error) { toast({ title: 'Could not save drop-ship address', description: error.message, variant: 'destructive' }); return; }
      await load(); setMode('list'); onSelect(data as unknown as DropShipAddress);
    }} />
  );

  if (mode !== 'list') return (
    <EditAddressForm dropShip address={{ ...mode, name: mode.recipient_name }} isDefault={false} canDelete
      onCancel={() => setMode('list')}
      onSave={async (a) => {
        const { data, error } = await supabase.from('drop_ship_addresses' as any).update(toRow(a)).eq('id', mode.id).select('*').single();
        if (error) { toast({ title: 'Could not update drop-ship address', description: error.message, variant: 'destructive' }); return; }
        await load(); setMode('list'); if (selectedId === mode.id) onSelect(data as unknown as DropShipAddress);
      }}
      onDelete={async (id) => {
        // Retire instead of deleting so past orders keep their saved address copy.
        const { error } = await supabase.from('drop_ship_addresses' as any).update({ is_active: false }).eq('id', id);
        if (error) { toast({ title: 'Could not remove drop-ship address', description: error.message, variant: 'destructive' }); return; }
        await load(); setMode('list');
      }} />
  );

  return (
    <AddressSelector dropShip hideContinue
      addresses={addresses.map(asSelectorAddress)}
      selectedAddress={selected ? asSelectorAddress(selected) : null}
      defaultAddressId={null}
      companyName=""
      onSelect={(a) => { const match = addresses.find(x => x.id === a.id); if (match) onSelect(match); }}
      onSetDefault={() => {}}
      onAddAddress={() => setMode('add')}
      onEditAddress={(a) => { const match = addresses.find(x => x.id === a.id); if (match) setMode(match); }} />
  );
}
