import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PlatformAdmin } from "@/lib/types";

export interface PlatformAdminContext {
  userId: string;
  userEmail: string | null;
  admin: PlatformAdmin;
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

  return {
    status: 200 as const,
    context: {
      userId: user.id,
      userEmail: user.email || null,
      admin: data as PlatformAdmin,
    },
  };
}

export async function isPlatformAdminUser(userId: string) {
  if (!isPlatformDashboardEnabled()) {
    return false;
  }

  const adminClient = createAdminClient();
  const { data } = await adminClient
    .from("platform_admins")
    .select("id")
    .eq("auth_user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  return Boolean(data?.id);
}
