// Shipping carrier and method options for purchase orders

export const SHIPPING_CARRIERS = [
  { value: 'fedex', label: 'FedEx' },
  { value: 'ups', label: 'UPS' },
  { value: 'usps', label: 'USPS' },
] as const;

export const SHIPPING_METHODS: Record<string, { value: string; label: string }[]> = {
  fedex: [
    { value: 'ground', label: 'Ground' },
    { value: 'express_saver', label: 'Express Saver (3 Day)' },
    { value: '2day', label: '2 Day' },
    { value: 'priority_overnight', label: 'Priority Overnight' },
  ],
  ups: [
    { value: 'ground', label: 'Ground' },
    { value: '3day_select', label: '3 Day Select' },
    { value: '2nd_day_air', label: '2nd Day Air' },
    { value: 'next_day_air', label: 'Next Day Air' },
  ],
  usps: [
    { value: 'ground_advantage', label: 'Ground Advantage' },
    { value: 'priority_mail', label: 'Priority Mail' },
    { value: 'priority_express', label: 'Priority Express' },
  ],
};

export const getShippingMethodsForCarrier = (carrier: string | null | undefined) => {
  if (!carrier) return [];
  return SHIPPING_METHODS[carrier.toLowerCase()] || [];
};

export const getCarrierLabel = (carrier: string | null | undefined): string => {
  if (!carrier) return '';
  const found = SHIPPING_CARRIERS.find(c => c.value === carrier.toLowerCase());
  return found?.label || carrier;
};

export const getMethodLabel = (carrier: string | null | undefined, method: string | null | undefined): string => {
  if (!carrier || !method) return '';
  const methods = getShippingMethodsForCarrier(carrier);
  const found = methods.find(m => m.value === method.toLowerCase());
  return found?.label || method;
};

// Calculate ship by date: order_date + lead_time_days - 4 calendar days
export const calculateShipByDate = (orderDate: Date, leadTimeDays: number): Date => {
  const expectedDelivery = new Date(orderDate);
  expectedDelivery.setDate(expectedDelivery.getDate() + leadTimeDays);
  
  const shipByDate = new Date(expectedDelivery);
  shipByDate.setDate(shipByDate.getDate() - 4);
  
  return shipByDate;
};
