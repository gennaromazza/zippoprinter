import { NextResponse } from "next/server";
import { registerCouponRedemption, validateCoupon, type CouponRecord } from "@/lib/coupons";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCheckoutAmounts, getPhotographerPaymentMode, prefersOnlinePayment, requiresOnlinePayment } from "@/lib/payments";
import { getUnitPriceForQuantity } from "@/lib/pricing";
import { isMissingCouponSchemaError, isMissingPaymentSchemaError } from "@/lib/schema-compat";
import { getConnectedStripeClientForTenant, getStripeClient } from "@/lib/stripe";
import { canUseOnlinePayments, getTenantBillingContext } from "@/lib/tenant-billing";
import { normalizeFilename } from "@/lib/uploads";
import { rateLimit } from "@/lib/rate-limit";
import type { Photographer, PrintFormat } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ManifestItem {
  clientId: string;
  formatId: string;
  quantity: number;
  originalFilename: string;
  storagePath?: string;
}

interface CouponValidationResponse {
  valid: boolean;
  coupon?: CouponRecord;
  discountCents: number;
  message: string;
}

interface CustomerProfileRecord {
  id: string;
}

const MIN_QUANTITY = 1;
const MAX_QUANTITY = 10;
const MAX_MANIFEST_ITEMS = 300;
const MAX_FILENAME_LENGTH = 120;
const MAX_PHOTO_BYTES = 30 * 1024 * 1024;
const MIN_PHONE_LENGTH = 6;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function hasPathTraversal(value: string) {
  return value.includes("..");
}

function getRequestOrigin(request: Request) {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");

  if (forwardedHost) {
    return `${forwardedProto || "http"}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}

function toSafeQuantity(input: number) {
  if (!Number.isFinite(input)) {
    return null;
  }

  const rounded = Math.round(input);
  if (rounded < MIN_QUANTITY || rounded > MAX_QUANTITY) {
    return null;
  }

  return rounded;
}

export async function POST(request: Request) {
  const admin = createAdminClient();
  let createdOrderId: string | null = null;
  const uploadedStoragePaths: string[] = [];

  try {
    // Basic bot/CSRF mitigation: require an Origin or Referer header (browsers always send one)
    const requestHeaderOrigin = request.headers.get("origin");
    const referer = request.headers.get("referer");
    if (!requestHeaderOrigin && !referer) {
      return NextResponse.json({ error: "Richiesta non valida." }, { status: 403 });
    }

    const rl = rateLimit(request, { key: "public-orders", limit: 10, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "Troppi tentativi. Riprova tra un minuto." }, { status: 429 });
    }

    const contentType = request.headers.get("content-type") || "";
    const isMultipart = contentType.includes("multipart/form-data");
    let photographerId = "";
    let customerEmail = "";
    let customerFirstName = "";
    let customerLastName = "";
    let customerPhone = "";
    let privacyAccepted = false;
    let idempotencyKey = "";
    let couponCode = "";
    let manifestInput = "[]";
    let formData: FormData | null = null;

    if (isMultipart) {
      formData = await request.formData();
      photographerId = String(formData.get("photographerId") || "");
      customerEmail = String(formData.get("customerEmail") || "").trim();
      customerFirstName = String(formData.get("customerFirstName") || "").trim();
      customerLastName = String(formData.get("customerLastName") || "").trim();
      customerPhone = String(formData.get("customerPhone") || "").trim();
      privacyAccepted = String(formData.get("privacyAccepted") || "").toLowerCase() === "true";
      idempotencyKey = String(formData.get("idempotencyKey") || "").trim();
      couponCode = String(formData.get("couponCode") || "").trim();
      manifestInput = String(formData.get("manifest") || "[]");
    } else {
      const body = (await request.json()) as {
        photographerId?: string;
        customerEmail?: string;
        customerFirstName?: string;
        customerLastName?: string;
        customerPhone?: string;
        privacyAccepted?: boolean;
        idempotencyKey?: string;
        couponCode?: string;
        manifest?: ManifestItem[];
      };

      photographerId = String(body.photographerId || "");
      customerEmail = String(body.customerEmail || "").trim();
      customerFirstName = String(body.customerFirstName || "").trim();
      customerLastName = String(body.customerLastName || "").trim();
      customerPhone = String(body.customerPhone || "").trim();
      privacyAccepted = Boolean(body.privacyAccepted);
      idempotencyKey = String(body.idempotencyKey || "").trim();
      couponCode = String(body.couponCode || "").trim();
      manifestInput = JSON.stringify(body.manifest || []);
    }

    let manifest: ManifestItem[] = [];

    try {
      manifest = JSON.parse(manifestInput) as ManifestItem[];
    } catch {
      return NextResponse.json({ error: "Manifest ordine non valido." }, { status: 400 });
    }

    if (
      !photographerId ||
      !customerEmail ||
      !customerFirstName ||
      !customerLastName ||
      !customerPhone ||
      manifest.length === 0
    ) {
      return NextResponse.json({ error: "Dati ordine incompleti." }, { status: 400 });
    }
    if (customerPhone.replace(/\s+/g, "").length < MIN_PHONE_LENGTH) {
      return NextResponse.json({ error: "Numero di telefono non valido." }, { status: 400 });
    }
    if (!EMAIL_REGEX.test(customerEmail)) {
      return NextResponse.json({ error: "Indirizzo email non valido." }, { status: 400 });
    }
    if (manifest.length > MAX_MANIFEST_ITEMS) {
      return NextResponse.json(
        { error: `Puoi inviare massimo ${MAX_MANIFEST_ITEMS} immagini per ordine.` },
        { status: 400 }
      );
    }
    if (!privacyAccepted) {
      return NextResponse.json(
        {
          error: "Devi confermare la privacy policy prima di inviare l'ordine.",
        },
        { status: 400 }
      );
    }

    const seenClientIds = new Set<string>();
    for (const item of manifest) {
      if (!item.clientId || !item.formatId) {
        return NextResponse.json({ error: "Manifest ordine non valido." }, { status: 400 });
      }
      if (seenClientIds.has(item.clientId)) {
        return NextResponse.json({ error: "Manifest ordine non valido." }, { status: 400 });
      }
      seenClientIds.add(item.clientId);
      const originalFilename = String(item.originalFilename || "").trim();
      if (!originalFilename || originalFilename.length > MAX_FILENAME_LENGTH) {
        return NextResponse.json({ error: "Nome file non valido." }, { status: 400 });
      }
      if (!isMultipart) {
        const storagePath = String(item.storagePath || "");
        if (!storagePath) {
          return NextResponse.json({ error: "Percorso file mancante." }, { status: 400 });
        }
        if (hasPathTraversal(storagePath)) {
          return NextResponse.json({ error: "Percorso file non valido." }, { status: 400 });
        }
        const expectedPrefix = `${photographerId}/incoming/`;
        if (!storagePath.startsWith(expectedPrefix)) {
          return NextResponse.json({ error: "Percorso file non valido." }, { status: 400 });
        }
      }
    }

    const customerName = `${customerFirstName} ${customerLastName}`.trim();

    const { data: photographerData } = await admin
      .from("photographers")
      .select("*")
      .eq("id", photographerId)
      .maybeSingle();

    const photographer = photographerData as Photographer | null;

    if (!photographer) {
      return NextResponse.json({ error: "Studio fotografico non trovato." }, { status: 404 });
    }

    const { data: formatsData } = await admin
      .from("print_formats")
      .select("*")
      .eq("photographer_id", photographerId)
      .eq("is_active", true);

    const formats = (formatsData as PrintFormat[] | null) ?? [];
    const formatMap = new Map(formats.map((format) => [format.id, format]));

    const lineItems = manifest.map((item) => {
      const format = formatMap.get(item.formatId);
      const safeQuantity = toSafeQuantity(Number(item.quantity));

      if (!format) {
        throw new Error("Uno dei formati selezionati non e disponibile.");
      }
      if (!safeQuantity) {
        throw new Error("Quantita non valida: ogni foto deve avere una quantita tra 1 e 10.");
      }

      const unitPriceCents = getUnitPriceForQuantity(format, safeQuantity);

      return {
        ...item,
        quantity: safeQuantity,
        format,
        unitPriceCents,
        subtotal: unitPriceCents * safeQuantity,
      };
    });

    const totalCents = lineItems.reduce((sum, item) => sum + item.subtotal, 0);
    if (totalCents <= 0) {
      throw new Error("Totale ordine non valido.");
    }
    const paymentMode = getPhotographerPaymentMode(photographer);
    let appliedCoupon: CouponRecord | null = null;
    let couponDiscountCents = 0;
    if (couponCode) {
      const couponValidation = (await validateCoupon({
        admin,
        photographerId,
        couponCode,
        orderTotalCents: totalCents,
        customerEmail,
        paymentMode,
      })) as CouponValidationResponse;

      if (!couponValidation.valid || !couponValidation.coupon) {
        throw new Error(couponValidation.message || "Coupon non valido.");
      }

      appliedCoupon = couponValidation.coupon;
      couponDiscountCents = Math.max(0, couponValidation.discountCents || 0);
    }

    const finalTotalCents = Math.max(totalCents - couponDiscountCents, 0);
    if (finalTotalCents <= 0) {
      throw new Error("Totale ordine non valido dopo applicazione coupon.");
    }

    const billingContext = await getTenantBillingContext(photographerId);
    const connectClient = getConnectedStripeClientForTenant(
      billingContext.billingAccount || { stripe_connect_account_id: null, connect_status: "not_connected" }
    );
    const connectReady =
      Boolean(connectClient) &&
      billingContext.billingAccount?.connect_status === "connected" &&
      canUseOnlinePayments(billingContext);
    const legacyFallbackEnabled =
      process.env.ENABLE_LEGACY_STRIPE_FALLBACK === "true" &&
      (billingContext.billingAccount?.legacy_checkout_enabled ?? true);
    const billingMode = connectReady ? "connect" : legacyFallbackEnabled ? "legacy_fallback" : "disabled";
    const stripeAvailable = connectReady || legacyFallbackEnabled;
    const paymentPlan = getCheckoutAmounts(finalTotalCents, photographer, { stripeAvailable });

    if (requiresOnlinePayment(paymentMode) && paymentPlan.dueNowCents <= 0) {
      throw new Error("Configurazione pagamento non valida: importo online uguale a zero.");
    }
    if (requiresOnlinePayment(paymentMode) && !connectReady && !legacyFallbackEnabled) {
      throw new Error(
        "Questo studio non ha ancora completato la configurazione pagamenti online."
      );
    }
    if (prefersOnlinePayment(paymentMode) && paymentPlan.dueNowCents > 0 && !connectReady && !legacyFallbackEnabled) {
      throw new Error(
        "Questo studio non ha ancora completato la configurazione pagamenti online."
      );
    }

    let customerId: string | null = null;

    const customerUpsertPayload = {
      photographer_id: photographerId,
      email: customerEmail,
      first_name: customerFirstName,
      last_name: customerLastName,
      name: customerName,
      phone: customerPhone || null,
    };

    const { data: existingCustomer } = await admin
      .from("customers")
      .select("id")
      .eq("photographer_id", photographerId)
      .ilike("email", customerEmail)
      .maybeSingle();

    if (existingCustomer) {
      const { data: updatedCustomer, error: customerUpdateError } = await admin
        .from("customers")
        .update(customerUpsertPayload)
        .eq("id", existingCustomer.id)
        .select("id")
        .single();

      if (customerUpdateError || !updatedCustomer) {
        throw new Error(customerUpdateError?.message || "Non e stato possibile aggiornare l'anagrafica cliente.");
      }

      customerId = (updatedCustomer as CustomerProfileRecord).id;
    } else {
      const { data: createdCustomer, error: customerInsertError } = await admin
        .from("customers")
        .insert(customerUpsertPayload)
        .select("id")
        .single();

      if (customerInsertError || !createdCustomer) {
        throw new Error(customerInsertError?.message || "Non e stato possibile creare l'anagrafica cliente.");
      }

      customerId = (createdCustomer as CustomerProfileRecord).id;
    }

    // Idempotency check: if the client re-submits the same order, return the existing one
    if (idempotencyKey) {
      const { data: existingOrder } = await admin
        .from("orders")
        .select("id, status")
        .eq("photographer_id", photographerId)
        .eq("customer_email", customerEmail)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (existingOrder) {
        return NextResponse.json({ orderId: existingOrder.id, paymentRequired: false });
      }
    }

    const baseOrderPayload = {
      photographer_id: photographerId,
      customer_id: customerId,
      customer_email: customerEmail,
      customer_name: customerName || null,
      customer_first_name: customerFirstName || null,
      customer_last_name: customerLastName || null,
      customer_phone: customerPhone || null,
      status: "pending",
      total_cents: finalTotalCents,
      total_before_discount_cents: totalCents,
      coupon_id: appliedCoupon?.id || null,
      coupon_code: appliedCoupon?.code || null,
      coupon_discount_cents: couponDiscountCents,
      ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    };

    const baseOrderPayloadWithoutCoupons = {
      photographer_id: photographerId,
      customer_id: customerId,
      customer_email: customerEmail,
      customer_name: customerName || null,
      customer_first_name: customerFirstName || null,
      customer_last_name: customerLastName || null,
      customer_phone: customerPhone || null,
      status: "pending",
      total_cents: finalTotalCents,
      ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    };

    let createOrderResponse = await admin
      .from("orders")
      .insert({
        ...baseOrderPayload,
        payment_status: paymentMode === "pay_in_store" ? "not_required" : "unpaid",
        payment_mode_snapshot: paymentMode,
        amount_paid_cents: 0,
        amount_due_cents: finalTotalCents,
      })
      .select("id")
      .single();

    if (createOrderResponse.error && isMissingPaymentSchemaError(createOrderResponse.error.message)) {
      createOrderResponse = await admin
        .from("orders")
        .insert(baseOrderPayload)
        .select("id")
        .single();
    }

    if (createOrderResponse.error && isMissingCouponSchemaError(createOrderResponse.error.message)) {
      if (couponDiscountCents > 0) {
        throw new Error("Schema coupon non aggiornato. Esegui la migration 019_coupons_v1.sql.");
      }

      createOrderResponse = await admin
        .from("orders")
        .insert({
          ...baseOrderPayloadWithoutCoupons,
          payment_status: paymentMode === "pay_in_store" ? "not_required" : "unpaid",
          payment_mode_snapshot: paymentMode,
          amount_paid_cents: 0,
          amount_due_cents: finalTotalCents,
        })
        .select("id")
        .single();
    }

    const { data: createdOrder, error: orderError } = createOrderResponse;

    if (orderError || !createdOrder) {
      throw new Error(orderError?.message || "Non e stato possibile creare l'ordine.");
    }

    createdOrderId = createdOrder.id;

    const orderItems: Array<{
      order_id: string;
      print_format_id: string;
      format_name: string;
      format_price_cents: number;
      quantity: number;
      storage_path: string;
      original_filename: string;
    }> = [];

    for (const item of lineItems) {
      let storagePath = item.storagePath || "";

      if (isMultipart) {
        const fileEntry = formData?.get(`file:${item.clientId}`);

        if (!(fileEntry instanceof File)) {
          throw new Error("Una o piu immagini non sono state ricevute correttamente.");
        }
        if (!ALLOWED_IMAGE_TYPES.has(fileEntry.type)) {
          throw new Error("Formato immagine non supportato.");
        }
        if (fileEntry.size <= 0 || fileEntry.size > MAX_PHOTO_BYTES) {
          throw new Error("Una o piu immagini superano i limiti consentiti.");
        }

        const extension = fileEntry.name.split(".").pop() || "jpg";
        const safeBase = normalizeFilename(fileEntry.name.replace(/\.[^.]+$/, "")) || item.clientId;
        const fileName = `${Date.now()}-${item.clientId}-${safeBase}.${extension}`;
        storagePath = `${photographerId}/${createdOrder.id}/${fileName}`;
        const fileBuffer = Buffer.from(await fileEntry.arrayBuffer());

        const { error: uploadError } = await admin.storage.from("photos").upload(storagePath, fileBuffer, {
          contentType: fileEntry.type || "application/octet-stream",
          upsert: false,
        });

        if (uploadError) {
          throw new Error("Caricamento immagini non riuscito.");
        }
      }

      if (!storagePath) {
        throw new Error("Una o piu immagini non sono state caricate correttamente.");
      }

      uploadedStoragePaths.push(storagePath);
      orderItems.push({
        order_id: createdOrder.id,
        print_format_id: item.format.id,
        format_name: item.format.name,
        format_price_cents: item.unitPriceCents,
        quantity: item.quantity,
        storage_path: storagePath,
        original_filename: item.originalFilename,
      });
    }

    const { error: itemsError } = await admin.from("order_items").insert(orderItems);

    if (itemsError) {
      throw new Error("Non e stato possibile salvare le immagini dell'ordine.");
    }

    if (!requiresOnlinePayment(paymentMode) && !prefersOnlinePayment(paymentMode)) {
      if (appliedCoupon && couponDiscountCents > 0) {
        await registerCouponRedemption({
          admin,
          coupon: appliedCoupon,
          orderId: createdOrder.id,
          photographerId,
          customerEmail,
          discountAppliedCents: couponDiscountCents,
        });
      }

      return NextResponse.json({
        mode: paymentMode,
        orderId: createdOrder.id,
        paymentRequired: false,
        paymentStatus: "not_required",
        connectReady,
        billingMode,
        fallbackUsed: false,
        capabilities: {
          onlinePaymentsEnabled: canUseOnlinePayments(billingContext),
          customDomainEnabled: Boolean(billingContext.entitlements?.can_use_custom_domain),
        },
      });
    }

    // deposit_plus_studio without Stripe: fall back to in-store deposit collection
    if (prefersOnlinePayment(paymentMode) && !connectReady && !legacyFallbackEnabled) {
      if (appliedCoupon && couponDiscountCents > 0) {
        await registerCouponRedemption({
          admin,
          coupon: appliedCoupon,
          orderId: createdOrder.id,
          photographerId,
          customerEmail,
          discountAppliedCents: couponDiscountCents,
        });
      }

      return NextResponse.json({
        mode: paymentMode,
        orderId: createdOrder.id,
        paymentRequired: false,
        paymentStatus: "unpaid",
        connectReady,
        billingMode,
        fallbackUsed: false,
        capabilities: {
          onlinePaymentsEnabled: canUseOnlinePayments(billingContext),
          customDomainEnabled: Boolean(billingContext.entitlements?.can_use_custom_domain),
        },
      });
    }

    const stripe = connectReady ? connectClient : getStripeClient();
    const fallbackUsed = !connectReady;

    if (!stripe) {
      throw new Error("Stripe non e configurato per questo ambiente.");
    }

    const requestOrigin = getRequestOrigin(request);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: customerEmail,
      success_url: `${requestOrigin}/studio/${photographerId}/checkout/success?order=${createdOrder.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${requestOrigin}/studio/${photographerId}/checkout/cancelled?order=${createdOrder.id}`,
      metadata: {
        order_id: createdOrder.id,
        photographer_id: photographerId,
        payment_mode: paymentMode,
        billing_mode: billingMode,
        connected_account_id: billingContext.billingAccount?.stripe_connect_account_id || "",
        coupon_code: appliedCoupon?.code || "",
        coupon_discount_cents: String(couponDiscountCents),
      },
      payment_intent_data: {
        metadata: {
          order_id: createdOrder.id,
          photographer_id: photographerId,
          payment_mode: paymentMode,
          billing_mode: billingMode,
          connected_account_id: billingContext.billingAccount?.stripe_connect_account_id || "",
          coupon_code: appliedCoupon?.code || "",
          coupon_discount_cents: String(couponDiscountCents),
        },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: paymentPlan.dueNowCents,
            product_data: {
              name:
                paymentMode === "deposit_plus_studio"
                  ? `Acconto ordine ${photographer.name || "studio fotografico"}`
                  : `Ordine stampe ${photographer.name || "studio fotografico"}`,
              description: paymentPlan.description,
            },
          },
        },
      ],
    });

    const { error: checkoutError } = await admin
      .from("orders")
      .update({
        stripe_checkout_session_id: session.id,
        stripe_connected_account_id: connectReady
          ? billingContext.billingAccount?.stripe_connect_account_id || null
          : null,
      })
      .eq("id", createdOrder.id);

    if (checkoutError && !isMissingPaymentSchemaError(checkoutError.message)) {
      throw new Error("Sessione di pagamento creata ma non salvata correttamente.");
    }

    if (appliedCoupon && couponDiscountCents > 0) {
      await registerCouponRedemption({
        admin,
        coupon: appliedCoupon,
        orderId: createdOrder.id,
        photographerId,
        customerEmail,
        discountAppliedCents: couponDiscountCents,
      });
    }

    return NextResponse.json({
      mode: paymentMode,
      orderId: createdOrder.id,
      paymentRequired: true,
      checkoutUrl: session.url,
      connectReady,
      billingMode,
      fallbackUsed,
      capabilities: {
        onlinePaymentsEnabled: canUseOnlinePayments(billingContext),
        customDomainEnabled: Boolean(billingContext.entitlements?.can_use_custom_domain),
      },
    });
  } catch (error) {
    if (uploadedStoragePaths.length > 0) {
      await createAdminClient().storage.from("photos").remove(uploadedStoragePaths);
    }

    if (createdOrderId) {
      await createAdminClient().from("orders").delete().eq("id", createdOrderId);
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Si e verificato un errore durante la preparazione dell'ordine.",
      },
      { status: 500 }
    );
  }
}
