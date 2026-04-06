import "server-only";

import Stripe from "stripe";
import type { TenantBillingAccount } from "@/lib/types";

let stripeClient: Stripe | null | undefined;
const stripeConnectClientCache = new Map<string, Stripe>();

function getStripeSecretKey() {
  const key = (process.env.STRIPE_SECRET_KEY || "").trim();
  return key || null;
}

export function getStripeClient() {
  if (stripeClient !== undefined) {
    return stripeClient;
  }

  const stripeSecretKey = getStripeSecretKey();
  if (!stripeSecretKey) {
    stripeClient = null;
    return stripeClient;
  }

  stripeClient = new Stripe(stripeSecretKey, {
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
  const stripeSecretKey = getStripeSecretKey();
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

  if (!stripeSecretKey) {
    return null;
  }

  const scoped = new Stripe(stripeSecretKey, {
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
  const stripeSecretKey = getStripeSecretKey();
  if (!platform || !connectedAccountId) {
    return null;
  }

  const cached = stripeConnectClientCache.get(connectedAccountId);
  if (cached) {
    return cached;
  }

  if (!stripeSecretKey) {
    return null;
  }

  const scoped = new Stripe(stripeSecretKey, {
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
