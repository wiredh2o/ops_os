import { loadStripe, Stripe } from '@stripe/stripe-js';

let stripePromiseCache: { [key: string]: Promise<Stripe | null> } = {};

export const getStripe = (publishableKey: string): Promise<Stripe | null> => {
  if (!publishableKey) {
    return Promise.resolve(null);
  }
  
  if (!stripePromiseCache[publishableKey]) {
    stripePromiseCache[publishableKey] = loadStripe(publishableKey);
  }
  
  return stripePromiseCache[publishableKey];
};

export const clearStripeCache = () => {
  stripePromiseCache = {};
};
