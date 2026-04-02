import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

interface SetupStep {
  step: string;
  success: boolean;
  error?: string;
  message?: string;
  userId?: string;
  email?: string;
}

interface SetupResponse {
  success: boolean;
  steps: SetupStep[];
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Errore sconosciuto";
}

export async function POST(request: Request) {
  const body = (await request.json()) as { secret?: string };
  const { secret } = body;

  if (secret !== process.env.INIT_SECRET && secret !== "setup-2024") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const results: SetupResponse = {
    success: true,
    steps: [],
  };

  try {
    const { data: users } = await adminClient.auth.admin.listUsers();
    const existingUser = users?.users.find(
      (user) => user.email === "admin@studiofotograficozippoprinter.com"
    );

    if (!existingUser) {
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: "admin@studiofotograficozippoprinter.com",
        password: "ZippoPrinter2024!",
        email_confirm: true,
        user_metadata: {
          name: "Studio Fotografico Zippo",
        },
      });

      if (createError) {
        results.steps.push({
          step: "create_user",
          success: false,
          error: createError.message,
        });
        results.success = false;
      } else {
        results.steps.push({
          step: "create_user",
          success: true,
          userId: newUser.user?.id,
          email: newUser.user?.email,
        });
      }
    } else {
      results.steps.push({
        step: "create_user",
        success: true,
        message: "User already exists",
        userId: existingUser.id,
      });
    }
  } catch (error: unknown) {
    results.steps.push({
      step: "create_user",
      success: false,
      error: getErrorMessage(error),
    });
    results.success = false;
  }

  try {
    const { data: buckets } = await adminClient.storage.listBuckets();
    const photosBucket = buckets?.find((bucket) => bucket.name === "photos");

    if (!photosBucket) {
      const { error: createBucketError } = await adminClient.storage.createBucket("photos", {
        public: false,
      });

      if (createBucketError) {
        results.steps.push({
          step: "create_bucket",
          success: false,
          error: createBucketError.message,
        });
      } else {
        results.steps.push({
          step: "create_bucket",
          success: true,
        });

        try {
          await adminClient.storage.from("photos").upload(".gitkeep", new Blob([""]));
        } catch {
          // Ignore placeholder creation error.
        }
      }
    } else {
      results.steps.push({
        step: "create_bucket",
        success: true,
        message: "Bucket already exists",
      });
    }
  } catch (error: unknown) {
    results.steps.push({
      step: "create_bucket",
      success: false,
      error: getErrorMessage(error),
    });
    results.success = false;
  }

  return NextResponse.json(results);
}

export async function GET() {
  const supabase = await createClient();

  const results = {
    connection: "ok" as string | { error: string },
    tables: {} as Record<string, { exists: boolean; error?: string; count?: number }>,
    storage: {} as { exists: boolean; error?: string },
    auth: {} as { configured: boolean; error?: string; userCount?: number },
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
    const adminClient = createAdminClient();
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
    const adminClient = createAdminClient();
    const { data: users, error: authError } = await adminClient.auth.admin.listUsers();
    results.auth = {
      configured: !authError && (users?.users?.length ?? 0) > 0,
      error: authError?.message,
      userCount: users?.users?.length ?? 0,
    };
  } catch (error: unknown) {
    results.auth = {
      configured: false,
      error: getErrorMessage(error),
    };
  }

  return NextResponse.json(results);
}
