import "server-only";

import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Photographer, PrintFormat } from "@/lib/types";

export interface StorefrontData {
  photographer: Photographer;
  formats: PrintFormat[];
}

export interface PublicStudioSummary extends Photographer {
  active_format_count: number;
}

function normalizeEmail(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

async function syncPhotographerEmailFromAuth(
  admin: ReturnType<typeof createAdminClient>,
  photographer: Photographer,
  authEmail: string | null | undefined
) {
  if (!authEmail) {
    return photographer;
  }

  if (normalizeEmail(photographer.email) === normalizeEmail(authEmail)) {
    return photographer;
  }

  const { data: updated } = await admin
    .from("photographers")
    .update({ email: authEmail })
    .eq("id", photographer.id)
    .select("*")
    .maybeSingle();

  return (updated as Photographer | null) || { ...photographer, email: authEmail };
}

async function ensurePhotographerHasActiveAccess(
  admin: ReturnType<typeof createAdminClient>,
  photographer: Photographer | null
) {
  if (!photographer) {
    return null;
  }

  const { data: billingData } = await admin
    .from("tenant_billing_accounts")
    .select("access_status")
    .eq("photographer_id", photographer.id)
    .maybeSingle();

  if (billingData?.access_status && billingData.access_status !== "active") {
    return null;
  }

  return photographer;
}

export const getCurrentPhotographerForUser = cache(
  async (user: Pick<User, "id" | "email">): Promise<Photographer | null> => {
    const admin = createAdminClient();

    // 1. Direct lookup by auth_user_id (most common path for linked users)
    const { data: linkedData } = await admin
      .from("photographers")
      .select("*")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (linkedData) {
      const synced = await syncPhotographerEmailFromAuth(admin, linkedData as Photographer, user.email);
      return ensurePhotographerHasActiveAccess(admin, synced);
    }

    // 2. Fallback: match by email and claim if unclaimed
    if (user.email) {
      const { data: emailData } = await admin
        .from("photographers")
        .select("*")
        .ilike("email", user.email)
        .is("auth_user_id", null)
        .maybeSingle();

      if (emailData) {
        const { data: claimedByEmail } = await admin
          .from("photographers")
          .update({ auth_user_id: user.id })
          .eq("id", emailData.id)
          .is("auth_user_id", null)
          .select("*")
          .maybeSingle();

        const synced = await syncPhotographerEmailFromAuth(
          admin,
          (claimedByEmail || { ...emailData, auth_user_id: user.id }) as Photographer,
          user.email
        );

        return ensurePhotographerHasActiveAccess(
          admin,
          synced
        );
      }

      // Email exists but already claimed by another user
      const { data: emailOwnedData } = await admin
        .from("photographers")
        .select("*")
        .ilike("email", user.email)
        .maybeSingle();

      if (emailOwnedData) {
        const synced = await syncPhotographerEmailFromAuth(
          admin,
          emailOwnedData as Photographer,
          user.email
        );
        return ensurePhotographerHasActiveAccess(admin, synced);
      }
    }

    return null;
  }
);

export async function getStorefrontByPhotographerId(
  photographerId: string
): Promise<StorefrontData | null> {
  const admin = createAdminClient();

  const { data: photographerData } = await admin
    .from("photographers")
    .select("*")
    .eq("id", photographerId)
    .maybeSingle();

  if (!photographerData) {
    return null;
  }

  // Block storefront for suspended/blocked studios
  const checkedPhotographer = await ensurePhotographerHasActiveAccess(
    admin,
    photographerData as Photographer
  );
  if (!checkedPhotographer) {
    return null;
  }

  const { data: formatsData } = await admin
    .from("print_formats")
    .select("*")
    .eq("photographer_id", photographerId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  return {
    photographer: checkedPhotographer,
    formats: (formatsData as PrintFormat[] | null) ?? [],
  };
}

export async function getPublicStudios(): Promise<PublicStudioSummary[]> {
  const admin = createAdminClient();

  const { data: photographersData } = await admin
    .from("photographers")
    .select("*")
    .order("created_at", { ascending: true });

  const photographers = (photographersData as Photographer[] | null) ?? [];

  if (photographers.length === 0) {
    return [];
  }

  const { data: formatsData } = await admin
    .from("print_formats")
    .select("photographer_id, is_active");

  const formats = (formatsData as Array<Pick<PrintFormat, "photographer_id" | "is_active">> | null) ?? [];

  return photographers.map((photographer) => ({
    ...photographer,
    active_format_count: formats.filter(
      (format) => format.photographer_id === photographer.id && format.is_active
    ).length,
  }));
}
