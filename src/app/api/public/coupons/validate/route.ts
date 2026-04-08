import { NextResponse } from "next/server";
import { validateCoupon } from "@/lib/coupons";
import { getPhotographerPaymentMode } from "@/lib/payments";
import { isMissingCouponSchemaError } from "@/lib/schema-compat";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Photographer } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      photographerId?: string;
      couponCode?: string;
      orderTotalCents?: number;
      customerEmail?: string;
    };

    const photographerId = String(body.photographerId || "").trim();
    const couponCode = String(body.couponCode || "").trim();
    const orderTotalCents = Math.max(0, Math.round(Number(body.orderTotalCents || 0)));
    const customerEmail = String(body.customerEmail || "").trim().toLowerCase();

    if (!photographerId || !couponCode) {
      return NextResponse.json({ valid: false, error: "Dati coupon incompleti." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: photographerData, error: photographerError } = await admin
      .from("photographers")
      .select("id, payment_mode")
      .eq("id", photographerId)
      .maybeSingle();

    if (photographerError || !photographerData) {
      return NextResponse.json({ valid: false, error: "Studio non trovato." }, { status: 404 });
    }

    const paymentMode = getPhotographerPaymentMode(photographerData as Photographer);
    const validation = await validateCoupon({
      admin,
      photographerId,
      couponCode,
      orderTotalCents,
      customerEmail,
      paymentMode,
    });

    if (!validation.valid) {
      return NextResponse.json(
        {
          valid: false,
          code: validation.code,
          discountCents: 0,
          errorCode: validation.errorCode,
          message: validation.message,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      valid: true,
      code: validation.code,
      discountCents: validation.discountCents,
      message: validation.message,
      coupon: {
        id: validation.coupon?.id,
        discountMode: validation.coupon?.discount_mode,
        discountValue: validation.coupon?.discount_value,
      },
    });
  } catch (error) {
    if (error instanceof Error && isMissingCouponSchemaError(error.message)) {
      return NextResponse.json(
        {
          valid: false,
          error: "Schema coupon non aggiornato. Esegui la migration 019_coupons_v1.sql.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        valid: false,
        error: error instanceof Error ? error.message : "Errore validazione coupon.",
      },
      { status: 500 }
    );
  }
}
