"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

function revalidateOrderViews(orderId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
}

export async function recordOrderPayment(orderId: string) {
  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("total_cents")
    .eq("id", orderId)
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

export async function deleteOrderPhotos(orderId: string, storagePaths: string[]) {
  const supabase = await createClient();
  const adminClient = createAdminClient();
  
  // Delete from storage
  if (storagePaths.length > 0) {
    const { error: storageError } = await adminClient.storage
      .from("photos")
      .remove(storagePaths);

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
  const supabase = await createClient();
  const updates: {
    status: string;
    paid_at?: string;
    ready_at?: string;
    completed_at?: string;
  } = { status };
  if (status === "printing") {
    updates.paid_at = new Date().toISOString();
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
