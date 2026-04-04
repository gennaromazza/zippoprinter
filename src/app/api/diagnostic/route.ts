import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Errore sconosciuto";
}

function resolveInitSecret(request: Request) {
  const headerSecret = request.headers.get("x-init-secret");
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");
  return (headerSecret || querySecret || "").trim();
}

function hasValidInitSecret(request: Request) {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_SETUP_ENDPOINTS !== "true") {
    return false;
  }

  const expected = (process.env.INIT_SECRET || "").trim();
  if (!expected) {
    return false;
  }
  return resolveInitSecret(request) === expected;
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_SETUP_ENDPOINTS !== "true") {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !hasValidInitSecret(request)) {
    const status =
      process.env.NODE_ENV === "production" && process.env.ENABLE_SETUP_ENDPOINTS !== "true"
        ? 404
        : 401;
    return NextResponse.json({ error: "Unauthorized" }, { status });
  }

  const adminClient = createAdminClient();
  const results = {
    connection: "ok",
    tables: {} as Record<string, { exists: boolean; error?: string; count?: number }>,
    storage: {} as { exists: boolean; error?: string },
    auth: {} as { configured: boolean; error?: string },
  };

  const tables = ["photographers", "print_formats", "orders", "order_items", "customers"];

  for (const table of tables) {
    try {
      const { count, error } = await adminClient
        .from(table)
        .select("*", { count: "exact", head: true });

      results.tables[table] = {
        exists: !error,
        count: count ?? 0,
        error: error?.message,
      };
    } catch (error: unknown) {
      results.tables[table] = {
        exists: false,
        error: getErrorMessage(error),
      };
    }
  }

  try {
    const { data: buckets, error: storageError } = await adminClient.storage.listBuckets();
    const photosBucket = buckets?.find((bucket) => bucket.name === "photos");
    results.storage = {
      exists: !!photosBucket,
      error: storageError?.message,
    };
  } catch (error: unknown) {
    results.storage = {
      exists: false,
      error: getErrorMessage(error),
    };
  }

  try {
    const { data: users, error: authError } = await adminClient.auth.admin.listUsers();
    results.auth = {
      configured: !authError && (users?.users?.length ?? 0) > 0,
      error: authError?.message,
    };
  } catch (error: unknown) {
    results.auth = {
      configured: false,
      error: getErrorMessage(error),
    };
  }

  return NextResponse.json(results);
}
