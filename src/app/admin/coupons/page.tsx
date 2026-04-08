import { redirect } from "next/navigation";
import { BadgePercent } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPhotographerForUser } from "@/lib/photographers";
import { isMissingCouponSchemaError } from "@/lib/schema-compat";
import type { Photographer } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CouponsManager, type CouponRow } from "./coupons-manager";

export default async function AdminCouponsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const photographer = (await getCurrentPhotographerForUser(user)) as Photographer | null;
  if (!photographer) {
    redirect("/admin");
  }

  const { data, error } = await supabase
    .from("coupons")
    .select(
      "id, code, status, discount_mode, discount_value, min_order_cents, max_redemptions, redemptions_count, valid_until"
    )
    .eq("photographer_id", photographer.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const coupons = (data as CouponRow[] | null) ?? [];
  const schemaMissing = Boolean(error && isMissingCouponSchemaError(error.message));

  return (
    <div className="px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <p className="section-kicker"><BadgePercent className="h-3.5 w-3.5" />Promozioni</p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Coupon studio</h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Da qui puoi creare, mettere in pausa, riattivare ed eliminare coupon direttamente dal pannello admin.
          </p>
        </header>

        {schemaMissing ? (
          <Card className="border-amber-300 bg-amber-50">
            <CardHeader>
              <CardTitle>Schema coupon non aggiornato</CardTitle>
              <CardDescription>
                Esegui la migration <span className="font-semibold">019_coupons_v1.sql</span> su Supabase per abilitare la gestione completa.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        <Card className="border-[color:var(--border)] bg-white">
          <CardHeader>
            <CardTitle>Elenco coupon</CardTitle>
            <CardDescription>
              {coupons.length === 0
                ? "Nessun coupon trovato per questo studio."
                : `${coupons.length} coupon caricati.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CouponsManager
              photographerId={photographer.id}
              initialCoupons={coupons}
              schemaMissing={schemaMissing}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
