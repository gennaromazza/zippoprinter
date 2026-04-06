"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPhotographerForUser } from "@/lib/photographers";
import { getDepositAmountCents } from "@/lib/payments";
import { revalidatePath } from "next/cache";
import { isSameOriginRequest } from "@/lib/request-security";

const VALID_ORDER_STATUSES = new Set([
  "pending",
  "paid",
  "printing",
  "ready",
  "completed",
  "cancelled",
]);

/** Allowed forward transitions: key = current status, value = set of valid next statuses */
const ALLOWED_TRANSITIONS: Record<string, Set<string>> = {
  pending: new Set(["paid", "printing", "cancelled"]),
  paid: new Set(["printing", "cancelled"]),
  printing: new Set(["ready", "cancelled"]),
  ready: new Set(["completed", "cancelled"]),
  completed: new Set([]),
  cancelled: new Set([]),
};

async function getAuthenticatedPhotographer() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return getCurrentPhotographerForUser(user);
}

async function verifyOrderOwnership(orderId: string, photographerId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .eq("photographer_id", photographerId)
    .maybeSingle();
  return Boolean(data);
}

function revalidateOrderViews(orderId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
}

export async function recordOrderPayment(orderId: string) {
  if (!(await isSameOriginRequest())) {
    return;
  }
  const photographer = await getAuthenticatedPhotographer();
  if (!photographer || !(await verifyOrderOwnership(orderId, photographer.id))) {
    return;
  }
  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("total_cents")
    .eq("id", orderId)
    .eq("photographer_id", photographer.id)
    .single();

  if (!order) {
    return;
  }

  const { error } = await supabase
    .from("orders")
    .update({
      status: "paid",
      payment_status: "paid",
      amount_paid_cents: order.total_cents,
      amount_due_cents: 0,
      paid_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  if (!error) {
    revalidateOrderViews(orderId);
  }
}

export async function recordOrderDeposit(orderId: string) {
  if (!(await isSameOriginRequest())) {
    return;
  }
  const photographer = await getAuthenticatedPhotographer();
  if (!photographer || !(await verifyOrderOwnership(orderId, photographer.id))) {
    return;
  }
  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, photographer_id, total_cents, amount_paid_cents, amount_due_cents, payment_mode_snapshot, payment_status, status"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order) {
    return;
  }

  if (order.payment_mode_snapshot !== "deposit_plus_studio") {
    return;
  }

  const totalCents = order.total_cents || 0;
  const amountPaidCents = order.amount_paid_cents || 0;
  const amountDueCents =
    order.amount_due_cents ?? Math.max(totalCents - amountPaidCents, 0);

  if (amountDueCents <= 0) {
    return;
  }

  const { data: depositSettings } = await supabase
    .from("photographers")
    .select("deposit_type, deposit_value")
    .eq("id", order.photographer_id)
    .maybeSingle();

  const suggestedDeposit = getDepositAmountCents(totalCents, depositSettings || null);
  const appliedDepositCents = Math.min(amountDueCents, suggestedDeposit);
  const nextAmountPaidCents = amountPaidCents + appliedDepositCents;
  const nextAmountDueCents = Math.max(totalCents - nextAmountPaidCents, 0);

  const { error } = await supabase
    .from("orders")
    .update({
      payment_status: nextAmountDueCents > 0 ? "partial" : "paid",
      amount_paid_cents: nextAmountPaidCents,
      amount_due_cents: nextAmountDueCents,
      status: nextAmountDueCents === 0 ? "paid" : order.status,
      paid_at: nextAmountDueCents === 0 ? new Date().toISOString() : null,
    })
    .eq("id", orderId);

  if (!error) {
    revalidateOrderViews(orderId);
  }
}

export async function deleteOrderPhotos(orderId: string, storagePaths: string[]) {
  if (!(await isSameOriginRequest())) {
    return;
  }
  const photographer = await getAuthenticatedPhotographer();
  if (!photographer || !(await verifyOrderOwnership(orderId, photographer.id))) {
    return;
  }

  // Validate that all storage paths belong to this photographer's namespace
  const safePrefix = `${photographer.id}/`;
  const safePaths = storagePaths.filter(
    (p) => p.startsWith(safePrefix) && !p.includes("..")
  );

  const supabase = await createClient();
  const adminClient = createAdminClient();
  
  // Delete from storage
  if (safePaths.length > 0) {
    const { error: storageError } = await adminClient.storage
      .from("photos")
      .remove(safePaths);

    if (storageError) {
      console.error("Error deleting photos from storage:", storageError);
    }
  }

  // Delete order items from database
  await supabase
    .from("order_items")
    .delete()
    .eq("order_id", orderId);

  // Update order status
  await supabase
    .from("orders")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", orderId);

  revalidateOrderViews(orderId);
}

export async function updateOrderStatus(orderId: string, status: string) {
  if (!(await isSameOriginRequest())) {
    return;
  }
  if (!VALID_ORDER_STATUSES.has(status)) {
    return;
  }
  const photographer = await getAuthenticatedPhotographer();
  if (!photographer || !(await verifyOrderOwnership(orderId, photographer.id))) {
    return;
  }
  const supabase = await createClient();

  // Fetch current status to enforce forward-only transitions
  const { data: currentOrder } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .eq("photographer_id", photographer.id)
    .maybeSingle();

  if (!currentOrder) {
    return;
  }

  const allowedNext = ALLOWED_TRANSITIONS[currentOrder.status];
  if (!allowedNext || !allowedNext.has(status)) {
    return;
  }

  const updates: {
    status: string;
    ready_at?: string;
    completed_at?: string;
  } = { status };

  if (status === "printing") {
    const { data: order } = await supabase
      .from("orders")
      .select("payment_mode_snapshot, payment_status, amount_paid_cents")
      .eq("id", orderId)
      .maybeSingle();

    const paymentMode = order?.payment_mode_snapshot || "pay_in_store";
    const paymentStatus = order?.payment_status || "unpaid";
    const amountPaidCents = order?.amount_paid_cents || 0;
    const canStartPrinting =
      paymentMode === "pay_in_store" ||
      paymentStatus === "paid" ||
      paymentStatus === "partial" ||
      paymentStatus === "not_required" ||
      amountPaidCents > 0;

    if (!canStartPrinting) {
      return;
    }
  }

  if (status === "ready") {
    updates.ready_at = new Date().toISOString();
  }
  if (status === "completed") {
    updates.completed_at = new Date().toISOString();
  }

  await supabase
    .from("orders")
    .update(updates)
    .eq("id", orderId);

  revalidateOrderViews(orderId);
}
