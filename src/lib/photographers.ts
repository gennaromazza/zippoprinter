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

    const { data: photographersData } = await admin
      .from("photographers")
      .select("*")
      .order("created_at", { ascending: true });

    const photographers = (photographersData as Photographer[] | null) ?? [];

    const linkedPhotographer = photographers.find(
      (photographer) => photographer.auth_user_id === user.id
    );

    if (linkedPhotographer) {
      return ensurePhotographerHasActiveAccess(admin, linkedPhotographer);
    }

    if (user.email) {
      const emailMatchedPhotographer = photographers.find(
        (photographer) => photographer.email.toLowerCase() === user.email?.toLowerCase()
      );

      if (emailMatchedPhotographer) {
        if (Object.prototype.hasOwnProperty.call(emailMatchedPhotographer, "auth_user_id") && !emailMatchedPhotographer.auth_user_id) {
          const { data: claimedByEmail } = await admin
            .from("photographers")
            .update({ auth_user_id: user.id })
            .eq("id", emailMatchedPhotographer.id)
            .is("auth_user_id", null)
            .select("*")
            .maybeSingle();

          return ensurePhotographerHasActiveAccess(
            admin,
            (claimedByEmail || {
              ...emailMatchedPhotographer,
              auth_user_id: user.id,
            }) as Photographer
          );
        }

        return ensurePhotographerHasActiveAccess(admin, emailMatchedPhotographer);
      }
    }

    if (photographers.length !== 1) {
      return null;
    }

    const [onlyPhotographer] = photographers;

    if (!Object.prototype.hasOwnProperty.call(onlyPhotographer, "auth_user_id")) {
      return ensurePhotographerHasActiveAccess(admin, onlyPhotographer);
    }

    if (onlyPhotographer.auth_user_id) {
      return null;
    }

    const { data: claimedPhotographer } = await admin
      .from("photographers")
      .update({ auth_user_id: user.id })
      .eq("id", onlyPhotographer.id)
      .is("auth_user_id", null)
      .select("*")
      .maybeSingle();

    return ensurePhotographerHasActiveAccess(
      admin,
      (claimedPhotographer || {
        ...onlyPhotographer,
        auth_user_id: user.id,
      }) as Photographer
    );
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

  const { data: formatsData } = await admin
    .from("print_formats")
    .select("*")
    .eq("photographer_id", photographerId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  return {
    photographer: photographerData as Photographer,
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
