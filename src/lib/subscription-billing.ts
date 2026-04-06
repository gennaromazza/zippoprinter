import "server-only";

import type Stripe from "stripe";
import type { Photographer, SubscriptionPlan, TenantSubscription } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe";

function getStripePriceId(plan: SubscriptionPlan) {
  const metadata = plan.metadata || {};
  const raw = typeof metadata.stripe_price_id === "string" ? metadata.stripe_price_id.trim() : "";
  return raw || null;
}

export async function getActivePlans() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("subscription_plans")
    .select("*")
    .eq("is_active", true)
    .order("price_cents", { ascending: true });

  return (data as SubscriptionPlan[] | null) ?? [];
}

export async function getPlanById(planId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("subscription_plans")
    .select("*")
    .eq("id", planId)
    .eq("is_active", true)
    .maybeSingle();

  return (data as SubscriptionPlan | null) ?? null;
}

export async function getLatestTenantSubscription(photographerId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("tenant_subscriptions")
    .select("*")
    .eq("photographer_id", photographerId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as TenantSubscription | null) ?? null;
}

export async function resolveOrCreateStripeCustomer(photographer: Photographer) {
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error("Stripe piattaforma non configurato.");
  }

  const admin = createAdminClient();
  const { data: billing } = await admin
    .from("tenant_billing_accounts")
    .select("stripe_customer_id")
    .eq("photographer_id", photographer.id)
    .maybeSingle();

  if (billing?.stripe_customer_id) {
    return { stripe, customerId: billing.stripe_customer_id };
  }

  const customer = await stripe.customers.create({
    email: photographer.email,
    name: photographer.name || undefined,
    metadata: {
      photographer_id: photographer.id,
    },
  });

  await admin
    .from("tenant_billing_accounts")
    .upsert(
      {
        photographer_id: photographer.id,
        stripe_customer_id: customer.id,
      },
      { onConflict: "photographer_id" }
    );

  return { stripe, customerId: customer.id };
}

export async function createCheckoutSessionForPlan(input: {
  photographer: Photographer;
  plan: SubscriptionPlan;
  correlationId: string;
  origin: string;
}) {
  const { stripe, customerId } = await resolveOrCreateStripeCustomer(input.photographer);
  const priceId = getStripePriceId(input.plan);
  if (!priceId) {
    throw new Error("Piano non configurato: manca metadata.stripe_price_id.");
  }

  const isLifetime = input.plan.billing_mode === "lifetime";

  const session = await stripe.checkout.sessions.create({
    mode: isLifetime ? "payment" : "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${input.origin}/admin/settings?billing=success&correlation=${encodeURIComponent(input.correlationId)}`,
    cancel_url: `${input.origin}/admin/settings?billing=cancelled&correlation=${encodeURIComponent(input.correlationId)}`,
    automatic_tax: { enabled: true },
    tax_id_collection: { enabled: true },
    customer_update: {
      address: "auto",
      name: "auto",
    },
    metadata: {
      photographer_id: input.photographer.id,
      correlation_id: input.correlationId,
      subscription_plan_id: input.plan.id,
      subscription_plan_code: input.plan.code,
      billing_flow: isLifetime ? "lifetime_buyout" : "self_service_checkout",
    },
    ...(isLifetime
      ? {}
      : {
          subscription_data: {
            metadata: {
              photographer_id: input.photographer.id,
              correlation_id: input.correlationId,
              subscription_plan_id: input.plan.id,
              subscription_plan_code: input.plan.code,
            },
          },
        }),
  });

  return {
    sessionId: session.id,
    url: session.url,
    customerId,
    mode: isLifetime ? "payment" : "subscription",
  };
}

function getMainSubscriptionItemId(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];
  return item?.id || null;
}

export async function changeStripeSubscriptionPlan(input: {
  stripeSubscriptionId: string;
  plan: SubscriptionPlan;
}) {
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error("Stripe piattaforma non configurato.");
  }

  const priceId = getStripePriceId(input.plan);
  if (!priceId) {
    throw new Error("Piano non configurato: manca metadata.stripe_price_id.");
  }

  const current = await stripe.subscriptions.retrieve(input.stripeSubscriptionId);
  const itemId = getMainSubscriptionItemId(current);
  if (!itemId) {
    throw new Error("Subscription Stripe senza item aggiornabile.");
  }

  const updated = await stripe.subscriptions.update(input.stripeSubscriptionId, {
    items: [{ id: itemId, price: priceId }],
    proration_behavior: "create_prorations",
  });

  return updated;
}

export async function cancelStripeSubscriptionAtPeriodEnd(stripeSubscriptionId: string) {
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error("Stripe piattaforma non configurato.");
  }

  return stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: true,
  });
}

export async function reactivateStripeSubscription(stripeSubscriptionId: string) {
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error("Stripe piattaforma non configurato.");
  }

  return stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: false,
  });
}
