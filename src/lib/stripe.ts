import "server-only";

import Stripe from "stripe";

let stripeClient: Stripe | null | undefined;

export function getStripeClient() {
  if (stripeClient !== undefined) {
    return stripeClient;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    stripeClient = null;
    return stripeClient;
  }

  stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
    appInfo: {
      name: "ZippoPrinter",
    },
  });

  return stripeClient;
}
