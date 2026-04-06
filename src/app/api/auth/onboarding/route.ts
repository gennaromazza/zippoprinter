import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("photographers")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ photographerId: existing.id, exists: true });
  }

  return NextResponse.json({ exists: false });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const body = await request.json();
  const studioName = typeof body.studioName === "string" ? body.studioName.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : null;
  const whatsapp = typeof body.whatsapp === "string" ? body.whatsapp.trim() : null;

  if (!studioName) {
    return NextResponse.json(
      { error: "Il nome dello studio è obbligatorio" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Check if user already has a photographer record
  const { data: existing } = await admin
    .from("photographers")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ photographerId: existing.id, alreadyExists: true });
  }

  // Also check by email
  const { data: emailExisting } = await admin
    .from("photographers")
    .select("id, auth_user_id")
    .eq("email", user.email!)
    .maybeSingle();

  if (emailExisting) {
    // Claim the existing record if not yet linked
    if (!emailExisting.auth_user_id) {
      await admin
        .from("photographers")
        .update({ auth_user_id: user.id, name: studioName })
        .eq("id", emailExisting.id);
    }
    return NextResponse.json({
      photographerId: emailExisting.id,
      alreadyExists: true,
    });
  }

  // Create new photographer
  // password_hash is NOT NULL legacy column from pre-Supabase-Auth era;
  // auth is now handled by Supabase Auth via auth_user_id.
  const { data: newPhotographer, error: insertError } = await admin
    .from("photographers")
    .insert({
      email: user.email!,
      auth_user_id: user.id,
      name: studioName,
      phone,
      whatsapp_number: whatsapp,
      password_hash: "supabase_auth",
    })
    .select("id")
    .single();

  if (insertError || !newPhotographer) {
    return NextResponse.json(
      { error: "Errore durante la creazione dello studio" },
      { status: 500 }
    );
  }

  const photographerId = newPhotographer.id;

  // Create billing account
  await admin.from("tenant_billing_accounts").insert({
    photographer_id: photographerId,
    connect_status: "not_connected",
    charges_enabled: false,
    payouts_enabled: false,
    details_submitted: false,
    legacy_checkout_enabled: false,
    access_status: "active",
  });

  // Create entitlements (trial)
  await admin.from("tenant_entitlements").insert({
    photographer_id: photographerId,
    can_accept_online_payments: true,
    can_use_custom_domain: true,
  });

  // Create trial subscription
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);

  await admin.from("tenant_subscriptions").insert({
    photographer_id: photographerId,
    status: "trialing",
    provider: "manual",
    is_lifetime: false,
    cancel_at_period_end: false,
    trial_end: trialEnd.toISOString(),
  });

  return NextResponse.json({ photographerId, alreadyExists: false });
}
