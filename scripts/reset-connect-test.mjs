import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const projectRoot = process.cwd();
const dryRun = process.argv.includes("--dry-run");

loadEnvFile(path.join(projectRoot, ".env.local"));
loadEnvFile(path.join(projectRoot, ".env.vercel.local"));

const requiredEnv = [
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing required env: ${key}`);
    process.exit(1);
  }
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  appInfo: {
    name: "ZippoPrinter Reset Connect Test",
  },
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

async function main() {
  console.log(`Starting Connect reset${dryRun ? " (dry run)" : ""}...`);
  console.log(`Stripe mode: ${process.env.STRIPE_SECRET_KEY.startsWith("sk_test_") ? "test" : "live"}`);
  void stripe;

  const { data: billingAccounts, error } = await supabase
    .from("tenant_billing_accounts")
    .select("id, photographer_id, stripe_connect_account_id");

  if (error) {
    throw new Error(error.message);
  }

  const rows = billingAccounts || [];
  console.log(`Found ${rows.length} billing account rows.`);

  const connectedRows = rows.filter((row) => row.stripe_connect_account_id);
  if (connectedRows.length === 0) {
    console.log("No Stripe Connect account ids found. Nothing to reset.");
    return;
  }

  console.log("Existing Stripe Connect account ids:");
  for (const row of connectedRows) {
    console.log(`- photographer=${row.photographer_id} account=${row.stripe_connect_account_id}`);
  }

  if (dryRun) {
    console.log("Dry run completed. No database updates were applied.");
    return;
  }

  const now = new Date().toISOString();
  for (const row of rows) {
    const { error: updateError } = await supabase
      .from("tenant_billing_accounts")
      .update({
        stripe_connect_account_id: null,
        connect_status: "not_connected",
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        onboarding_completed_at: null,
        updated_at: now,
      })
      .eq("id", row.id);

    if (updateError) {
      throw new Error(
        `Failed to reset billing row ${row.id} for photographer ${row.photographer_id}: ${updateError.message}`
      );
    }
  }

  console.log(`Reset completed successfully for ${rows.length} billing rows.`);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([\w.-]+)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, value] = match;
    if (process.env[key] !== undefined) {
      continue;
    }

    const normalizedValue = value.replace(/^['"]|['"]$/g, "");
    process.env[key] = normalizedValue;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
