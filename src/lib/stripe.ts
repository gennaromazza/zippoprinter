import "server-only";

import Stripe from "stripe";
import type { TenantBillingAccount } from "@/lib/types";

let stripeClient: Stripe | null | undefined;
const stripeConnectClientCache = new Map<string, Stripe>();

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

export function getConnectedStripeClientForTenant(
  billingAccount: Pick<TenantBillingAccount, "stripe_connect_account_id" | "connect_status">
) {
  const platform = getStripeClient();
  if (!platform) {
    return null;
  }

  if (billingAccount.connect_status !== "connected" || !billingAccount.stripe_connect_account_id) {
    return null;
  }

  const connectedAccountId = billingAccount.stripe_connect_account_id;
  const cached = stripeConnectClientCache.get(connectedAccountId);
  if (cached) {
    return cached;
  }

  const scoped = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    appInfo: {
      name: "ZippoPrinter",
    },
    stripeAccount: connectedAccountId,
  });

  stripeConnectClientCache.set(connectedAccountId, scoped);
  return scoped;
}

export function getConnectedStripeClientByAccountId(connectedAccountId: string | null | undefined) {
  const platform = getStripeClient();
  if (!platform || !connectedAccountId) {
    return null;
  }

  const cached = stripeConnectClientCache.get(connectedAccountId);
  if (cached) {
    return cached;
  }

  const scoped = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    appInfo: {
      name: "ZippoPrinter",
    },
    stripeAccount: connectedAccountId,
  });
  stripeConnectClientCache.set(connectedAccountId, scoped);
  return scoped;
}

export function getStripeWebhookSecrets() {
  return {
    orderWebhookSecret: (process.env.STRIPE_WEBHOOK_SECRET || "").trim(),
    platformWebhookSecret: (process.env.STRIPE_PLATFORM_WEBHOOK_SECRET || "").trim(),
  };
}
