import "server-only";

import Stripe from "stripe";
import type { TenantBillingAccount } from "@/lib/types";

let stripeClient: Stripe | null | undefined;
let stripeClientKey: string | null = null;
const stripeConnectClientCache = new Map<string, Stripe>();

function getConnectCacheKey(stripeSecretKey: string, connectedAccountId: string) {
  return `${stripeSecretKey}:${connectedAccountId}`;
}

function getStripeSecretKey() {
  const key = (process.env.STRIPE_SECRET_KEY || "").trim();
  return key || null;
}

export function getStripeClient() {
  const stripeSecretKey = getStripeSecretKey();
  if (!stripeSecretKey) {
    stripeClient = null;
    stripeClientKey = null;
    stripeConnectClientCache.clear();
    return stripeClient;
  }

  if (stripeClient && stripeClientKey === stripeSecretKey) {
    return stripeClient;
  }

  if (stripeClientKey && stripeClientKey !== stripeSecretKey) {
    stripeConnectClientCache.clear();
  }

  stripeClient = new Stripe(stripeSecretKey, {
    appInfo: {
      name: "ZippoPrinter",
    },
  });
  stripeClientKey = stripeSecretKey;

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

  if (!stripeSecretKey) {
    return null;
  }

  const connectedAccountId = billingAccount.stripe_connect_account_id;
  const cacheKey = getConnectCacheKey(stripeSecretKey, connectedAccountId);
  const cached = stripeConnectClientCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const scoped = new Stripe(stripeSecretKey, {
    appInfo: {
      name: "ZippoPrinter",
    },
    stripeAccount: connectedAccountId,
  });

  stripeConnectClientCache.set(cacheKey, scoped);
  return scoped;
}

export function getConnectedStripeClientByAccountId(connectedAccountId: string | null | undefined) {
  const platform = getStripeClient();
  const stripeSecretKey = getStripeSecretKey();
  if (!platform || !connectedAccountId) {
    return null;
  }

  if (!stripeSecretKey) {
    return null;
  }

  const cacheKey = getConnectCacheKey(stripeSecretKey, connectedAccountId);
  const cached = stripeConnectClientCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const scoped = new Stripe(stripeSecretKey, {
    appInfo: {
      name: "ZippoPrinter",
    },
    stripeAccount: connectedAccountId,
  });
  stripeConnectClientCache.set(cacheKey, scoped);
  return scoped;
}

export function getStripeWebhookSecrets() {
  return {
    orderWebhookSecret: (process.env.STRIPE_WEBHOOK_SECRET || "").trim(),
    platformWebhookSecret: (process.env.STRIPE_PLATFORM_WEBHOOK_SECRET || "").trim(),
  };
}
