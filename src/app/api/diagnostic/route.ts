import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Errore sconosciuto";
}

export async function GET() {
  const supabase = await createClient();

  const results = {
    connection: "ok",
    tables: {} as Record<string, { exists: boolean; error?: string; count?: number }>,
    storage: {} as { exists: boolean; error?: string },
    auth: {} as { configured: boolean; error?: string },
  };

  const tables = ["photographers", "print_formats", "orders", "order_items", "customers"];

  for (const table of tables) {
    try {
      const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });

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
    const { data: buckets, error: storageError } = await supabase.storage.listBuckets();
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
    const { data: users, error: authError } = await supabase.auth.admin.listUsers();
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
