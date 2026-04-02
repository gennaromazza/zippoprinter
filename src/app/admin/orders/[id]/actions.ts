"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function markOrderReady(orderId: string) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from("orders")
    .update({ 
      status: "ready",
      ready_at: new Date().toISOString()
    })
    .eq("id", orderId);

  if (!error) {
    revalidatePath("/admin");
    revalidatePath(`/admin/orders/${orderId}`);
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
  const { error: itemsError } = await supabase
    .from("order_items")
    .delete()
    .eq("order_id", orderId);

  // Update order status
  await supabase
    .from("orders")
    .update({ status: "completed" })
    .eq("id", orderId);

  revalidatePath("/admin");
  revalidatePath(`/admin/orders/${orderId}`);
}

export async function updateOrderStatus(orderId: string, status: string) {
  const supabase = await createClient();
  
  const updates: any = { status };
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

  revalidatePath("/admin");
  revalidatePath(`/admin/orders/${orderId}`);
}
