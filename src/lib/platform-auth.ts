import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PlatformAdmin, PlatformAdminRole } from "@/lib/types";

export interface PlatformAdminContext {
  userId: string;
  userEmail: string | null;
  admin: PlatformAdmin;
}

const ROLE_RANK: Record<PlatformAdminRole, number> = {
  owner_readonly: 1,
  owner_support: 2,
  owner_admin: 3,
};

function normalizeEmail(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

async function syncPlatformAdminEmailFromAuth(input: {
  adminClient: ReturnType<typeof createAdminClient>;
  admin: PlatformAdmin;
  authEmail: string | null | undefined;
}) {
  const { adminClient, admin, authEmail } = input;

  if (!authEmail) {
    return admin;
  }

  if (normalizeEmail(admin.email) === normalizeEmail(authEmail)) {
    return admin;
  }

  const { data: updated } = await adminClient
    .from("platform_admins")
    .update({ email: authEmail })
    .eq("id", admin.id)
    .select("*")
    .maybeSingle();

  return (updated as PlatformAdmin | null) || { ...admin, email: authEmail };
}

export function isPlatformDashboardEnabled() {
  if (process.env.ENABLE_PLATFORM_DASHBOARD === "true") {
    return true;
  }

  return process.env.NODE_ENV !== "production";
}

export async function getPlatformAdminContext() {
  if (!isPlatformDashboardEnabled()) {
    return { status: 404 as const, error: "Platform dashboard disabled." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 401 as const, error: "Unauthorized" };
  }

  const adminClient = createAdminClient();
  const { data } = await adminClient
    .from("platform_admins")
    .select("*")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!data) {
    return { status: 403 as const, error: "Forbidden" };
  }
  const syncedAdmin = await syncPlatformAdminEmailFromAuth({
    adminClient,
    admin: data as PlatformAdmin,
    authEmail: user.email,
  });

  return {
    status: 200 as const,
    context: {
      userId: user.id,
      userEmail: user.email || null,
      admin: syncedAdmin,
    },
  };
}

export function hasPlatformRole(
  role: PlatformAdminRole | null | undefined,
  minimum: PlatformAdminRole
) {
  if (!role) {
    return false;
  }
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export async function isPlatformAdminUser(userId: string, userEmail?: string | null) {
  if (!isPlatformDashboardEnabled()) {
    return false;
  }

  const adminClient = createAdminClient();
  const { data } = await adminClient
    .from("platform_admins")
    .select("*")
    .eq("auth_user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (data && userEmail) {
    await syncPlatformAdminEmailFromAuth({
      adminClient,
      admin: data as PlatformAdmin,
      authEmail: userEmail,
    });
  }

  return Boolean(data?.id);
}
