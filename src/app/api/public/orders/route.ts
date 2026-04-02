import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCheckoutAmounts, getPhotographerPaymentMode, requiresOnlinePayment } from "@/lib/payments";
import { isMissingPaymentSchemaError } from "@/lib/schema-compat";
import { getStripeClient } from "@/lib/stripe";
import { normalizeFilename } from "@/lib/uploads";
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

export async function POST(request: Request) {
  const admin = createAdminClient();
  let createdOrderId: string | null = null;
  const uploadedStoragePaths: string[] = [];

  try {
    const contentType = request.headers.get("content-type") || "";
    const isMultipart = contentType.includes("multipart/form-data");
    let photographerId = "";
    let customerEmail = "";
    let customerName = "";
    let customerPhone = "";
    let manifestInput = "[]";
    let formData: FormData | null = null;

    if (isMultipart) {
      formData = await request.formData();
      photographerId = String(formData.get("photographerId") || "");
      customerEmail = String(formData.get("customerEmail") || "").trim();
      customerName = String(formData.get("customerName") || "").trim();
      customerPhone = String(formData.get("customerPhone") || "").trim();
      manifestInput = String(formData.get("manifest") || "[]");
    } else {
      const body = (await request.json()) as {
        photographerId?: string;
        customerEmail?: string;
        customerName?: string;
        customerPhone?: string;
        manifest?: ManifestItem[];
      };

      photographerId = String(body.photographerId || "");
      customerEmail = String(body.customerEmail || "").trim();
      customerName = String(body.customerName || "").trim();
      customerPhone = String(body.customerPhone || "").trim();
      manifestInput = JSON.stringify(body.manifest || []);
    }

    let manifest: ManifestItem[] = [];

    try {
      manifest = JSON.parse(manifestInput) as ManifestItem[];
    } catch {
      return NextResponse.json({ error: "Manifest ordine non valido." }, { status: 400 });
    }

    if (!photographerId || !customerEmail || manifest.length === 0) {
      return NextResponse.json({ error: "Dati ordine incompleti." }, { status: 400 });
    }

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

      if (!format) {
        throw new Error("Uno dei formati selezionati non e disponibile.");
      }

      return {
        ...item,
        format,
        subtotal: format.price_cents * item.quantity,
      };
    });

    const totalCents = lineItems.reduce((sum, item) => sum + item.subtotal, 0);
    const paymentPlan = getCheckoutAmounts(totalCents, photographer);
    const paymentMode = getPhotographerPaymentMode(photographer);

    const baseOrderPayload = {
      photographer_id: photographerId,
      customer_email: customerEmail,
      customer_name: customerName || null,
      customer_phone: customerPhone || null,
      status: "pending",
      total_cents: totalCents,
    };

    let createOrderResponse = await admin
      .from("orders")
      .insert({
        ...baseOrderPayload,
        payment_status: paymentMode === "pay_in_store" ? "not_required" : "unpaid",
        payment_mode_snapshot: paymentMode,
        amount_paid_cents: 0,
        amount_due_cents: totalCents,
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
        format_price_cents: item.format.price_cents,
        quantity: item.quantity,
        storage_path: storagePath,
        original_filename: item.originalFilename,
      });
    }

    const { error: itemsError } = await admin.from("order_items").insert(orderItems);

    if (itemsError) {
      throw new Error("Non e stato possibile salvare le immagini dell'ordine.");
    }

    if (!requiresOnlinePayment(paymentMode)) {
      return NextResponse.json({
        mode: paymentMode,
        orderId: createdOrder.id,
        paymentRequired: false,
        paymentStatus: "not_required",
      });
    }

    const stripe = getStripeClient();

    if (!stripe) {
      throw new Error("Stripe non e configurato per questo ambiente.");
    }

    const origin = getRequestOrigin(request);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: customerEmail,
      success_url: `${origin}/studio/${photographerId}/checkout/success?order=${createdOrder.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/studio/${photographerId}/checkout/cancelled?order=${createdOrder.id}`,
      metadata: {
        order_id: createdOrder.id,
        photographer_id: photographerId,
        payment_mode: paymentMode,
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
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", createdOrder.id);

    if (checkoutError && !isMissingPaymentSchemaError(checkoutError.message)) {
      throw new Error("Sessione di pagamento creata ma non salvata correttamente.");
    }

    return NextResponse.json({
      mode: paymentMode,
      orderId: createdOrder.id,
      paymentRequired: true,
      checkoutUrl: session.url,
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
