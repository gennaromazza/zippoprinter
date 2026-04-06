import "server-only";

import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/tenant-billing";
import type {
  ConnectStatus,
  StripeConnectStatusCard,
  TenantBillingAccount,
} from "@/lib/types";

interface StripeConnectStateInput {
  stripeConnectAccountId?: string | null;
  detailsSubmitted?: boolean | null;
  chargesEnabled?: boolean | null;
  payoutsEnabled?: boolean | null;
  requirementsCurrentlyDue?: number | null;
  requirementsDisabledReason?: string | null;
}

export interface StripeConnectSyncResult {
  connectStatus: ConnectStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  onboardingCompletedAt: string | null;
  requirementsCurrentlyDue: number;
  requirementsDisabledReason: string | null;
  statusCard: StripeConnectStatusCard;
}

export function getStripeConnectSetupUrl() {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (key.startsWith("sk_test_")) {
    return "https://dashboard.stripe.com/test/connect";
  }
  return "https://dashboard.stripe.com/connect";
}

export function getStripeConnectStatusCard(
  input: StripeConnectStateInput
): StripeConnectStatusCard {
  const hasAccount = Boolean(input.stripeConnectAccountId);
  const detailsSubmitted = Boolean(input.detailsSubmitted);
  const chargesEnabled = Boolean(input.chargesEnabled);
  const payoutsEnabled = Boolean(input.payoutsEnabled);
  const requirementsCurrentlyDue = Math.max(0, input.requirementsCurrentlyDue || 0);
  const requirementsDisabledReason = input.requirementsDisabledReason || null;

  if (chargesEnabled && payoutsEnabled) {
    return {
      tone: "green",
      title: "Account attivo: sei pronto a ricevere ordini",
      message: "Stripe Express e configurato correttamente e il checkout online puo incassare sul tuo studio.",
      actionLabel: null,
      requirementsCurrentlyDue,
      requirementsDisabledReason,
    };
  }

  if (!hasAccount || !detailsSubmitted) {
    return {
      tone: "red",
      title: "Pagamenti disattivati: clicca qui per configurare Stripe",
      message: "Completa l'onboarding Stripe Express per attivare gli incassi online dalla dashboard del fotografo.",
      actionLabel: "Configura Stripe",
      requirementsCurrentlyDue,
      requirementsDisabledReason,
    };
  }

  return {
    tone: "orange",
    title: "Configurazione incompleta: Stripe richiede ulteriori documenti",
    message:
      requirementsCurrentlyDue > 0
        ? `Ci sono ancora ${requirementsCurrentlyDue} dati o documenti richiesti da completare su Stripe.`
        : requirementsDisabledReason
          ? "Stripe richiede una verifica aggiuntiva prima di riattivare pagamenti e accrediti."
          : "Apri di nuovo Stripe per completare i controlli richiesti e riattivare i pagamenti.",
    actionLabel: "Completa su Stripe",
    requirementsCurrentlyDue,
    requirementsDisabledReason,
  };
}

export function mapStripeAccountToConnectStatus(account: Stripe.Account): ConnectStatus {
  const hasDisabledReason = Boolean(account.requirements?.disabled_reason);

  if (hasDisabledReason) {
    return "disabled";
  }

  if (account.charges_enabled && account.payouts_enabled) {
    return "connected";
  }

  if (account.details_submitted) {
    return "restricted";
  }

  return "pending";
}

export function getStripeConnectSyncResult(
  account: Stripe.Account,
  existingBillingAccount?: Pick<
    TenantBillingAccount,
    "stripe_connect_account_id" | "onboarding_completed_at"
  > | null
): StripeConnectSyncResult {
  const connectStatus = mapStripeAccountToConnectStatus(account);
  const chargesEnabled = Boolean(account.charges_enabled);
  const payoutsEnabled = Boolean(account.payouts_enabled);
  const detailsSubmitted = Boolean(account.details_submitted);
  const requirementsCurrentlyDue = account.requirements?.currently_due?.length || 0;
  const requirementsDisabledReason = account.requirements?.disabled_reason || null;
  const onboardingCompletedAt =
    chargesEnabled && payoutsEnabled
      ? existingBillingAccount?.onboarding_completed_at || new Date().toISOString()
      : null;

  return {
    connectStatus,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    onboardingCompletedAt,
    requirementsCurrentlyDue,
    requirementsDisabledReason,
    statusCard: getStripeConnectStatusCard({
      stripeConnectAccountId:
        existingBillingAccount?.stripe_connect_account_id || account.id || null,
      detailsSubmitted,
      chargesEnabled,
      payoutsEnabled,
      requirementsCurrentlyDue,
      requirementsDisabledReason,
    }),
  };
}

export async function syncStripeConnectAccountForPhotographer(input: {
  photographerId: string;
  account: Stripe.Account;
  actorUserId?: string | null;
}) {
  const admin = createAdminClient();
  const { data: existingBilling } = await admin
    .from("tenant_billing_accounts")
    .select("stripe_connect_account_id, onboarding_completed_at")
    .eq("photographer_id", input.photographerId)
    .maybeSingle();

  const syncResult = getStripeConnectSyncResult(
    input.account,
    (existingBilling as Pick<
      TenantBillingAccount,
      "stripe_connect_account_id" | "onboarding_completed_at"
    > | null) ?? null
  );

  await admin
    .from("tenant_billing_accounts")
    .upsert(
      {
        photographer_id: input.photographerId,
        stripe_connect_account_id: input.account.id,
        connect_status: syncResult.connectStatus,
        charges_enabled: syncResult.chargesEnabled,
        payouts_enabled: syncResult.payoutsEnabled,
        details_submitted: syncResult.detailsSubmitted,
        onboarding_completed_at: syncResult.onboardingCompletedAt,
      },
      { onConflict: "photographer_id" }
    );

  if (input.actorUserId !== undefined) {
    await writeAuditLog({
      photographerId: input.photographerId,
      actorUserId: input.actorUserId,
      action: "connect_status_synced",
      resourceType: "tenant_billing_accounts",
      resourceId: input.account.id,
      details: {
        connectStatus: syncResult.connectStatus,
        chargesEnabled: syncResult.chargesEnabled,
        payoutsEnabled: syncResult.payoutsEnabled,
        requirementsCurrentlyDue: syncResult.requirementsCurrentlyDue,
        requirementsDisabledReason: syncResult.requirementsDisabledReason,
      },
    });
  }

  return syncResult;
}

export async function syncStripeConnectAccountByAccountId(input: {
  connectAccountId: string;
  account: Stripe.Account;
}) {
  const admin = createAdminClient();
  const { data: billingAccount } = await admin
    .from("tenant_billing_accounts")
    .select("photographer_id")
    .eq("stripe_connect_account_id", input.connectAccountId)
    .maybeSingle();

  if (!billingAccount?.photographer_id) {
    return null;
  }

  return syncStripeConnectAccountForPhotographer({
    photographerId: billingAccount.photographer_id,
    account: input.account,
  });
}
