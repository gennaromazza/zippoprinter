import { notFound } from "next/navigation";
import { StorefrontPage } from "@/components/storefront-page";
import { getCurrentPhotographerForUser, getStorefrontByPhotographerId } from "@/lib/photographers";
import { getConnectedStripeClientForTenant } from "@/lib/stripe";
import { canUseOnlinePayments, getTenantBillingContext } from "@/lib/tenant-billing";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function StudioPage({
  params,
}: {
  params: Promise<{ photographerId: string }>;
}) {
  const { photographerId } = await params;
  const storefront = await getStorefrontByPhotographerId(photographerId);

  if (!storefront) {
    notFound();
  }

  const billingContext = await getTenantBillingContext(photographerId);
  const connectClient = getConnectedStripeClientForTenant(
    billingContext.billingAccount || { stripe_connect_account_id: null, connect_status: "not_connected" }
  );
  const connectReady =
    Boolean(connectClient) &&
    billingContext.billingAccount?.connect_status === "connected" &&
    canUseOnlinePayments(billingContext);
  const legacyFallback =
    process.env.ENABLE_LEGACY_STRIPE_FALLBACK === "true" &&
    (billingContext.billingAccount?.legacy_checkout_enabled ?? true);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const currentPhotographer = user
    ? await getCurrentPhotographerForUser(user)
    : null;
  const showAdminCta = currentPhotographer?.id === photographerId;

  return (
    <main className="min-h-screen px-4 pb-12 pt-4 md:px-8 md:pb-16 md:pt-6">
      <StorefrontPage
        photographer={storefront.photographer}
        formats={storefront.formats}
        stripeEnabled={connectReady || legacyFallback}
        showAdminCta={showAdminCta}
      />
    </main>
  );
}
