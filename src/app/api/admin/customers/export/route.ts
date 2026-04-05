import { NextResponse } from "next/server";
import { getAuthenticatedPhotographerContext } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CustomerRow {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  phone: string | null;
  created_at: string | null;
}

interface OrderRow {
  customer_id: string | null;
  total_cents: number | null;
  created_at: string | null;
}

interface CustomerStats {
  totalOrders: number;
  totalSpentCents: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
}

function escapeCsvCell(value: string) {
  if (value.includes(",") || value.includes("\"") || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
}

function toIsoDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function formatEuroCents(cents: number) {
  return (cents / 100).toFixed(2);
}

export async function GET() {
  const { user, photographer } = await getAuthenticatedPhotographerContext();
  if (!user) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }
  if (!photographer) {
    return NextResponse.json({ error: "Profilo studio non trovato." }, { status: 404 });
  }

  const admin = createAdminClient();

  const [{ data: customersData, error: customersError }, { data: ordersData, error: ordersError }] =
    await Promise.all([
      admin
        .from("customers")
        .select("id, email, first_name, last_name, name, phone, created_at")
        .eq("photographer_id", photographer.id)
        .order("created_at", { ascending: false }),
      admin
        .from("orders")
        .select("customer_id, total_cents, created_at")
        .eq("photographer_id", photographer.id)
        .not("customer_id", "is", null),
    ]);

  if (customersError) {
    return NextResponse.json(
      { error: "Impossibile esportare la mailing list clienti." },
      { status: 500 }
    );
  }
  if (ordersError) {
    return NextResponse.json(
      { error: "Impossibile aggregare lo storico ordini clienti." },
      { status: 500 }
    );
  }

  const customers = (customersData as CustomerRow[] | null) ?? [];
  const orders = (ordersData as OrderRow[] | null) ?? [];
  const statsByCustomer = new Map<string, CustomerStats>();

  for (const order of orders) {
    if (!order.customer_id) continue;
    const existing = statsByCustomer.get(order.customer_id) ?? {
      totalOrders: 0,
      totalSpentCents: 0,
      firstOrderAt: null,
      lastOrderAt: null,
    };

    existing.totalOrders += 1;
    existing.totalSpentCents += Number(order.total_cents || 0);

    const createdAt = toIsoDate(order.created_at);
    if (createdAt) {
      if (!existing.firstOrderAt || createdAt < existing.firstOrderAt) {
        existing.firstOrderAt = createdAt;
      }
      if (!existing.lastOrderAt || createdAt > existing.lastOrderAt) {
        existing.lastOrderAt = createdAt;
      }
    }

    statsByCustomer.set(order.customer_id, existing);
  }

  const header = [
    "email",
    "first_name",
    "last_name",
    "full_name",
    "phone",
    "total_orders",
    "total_spent_eur",
    "first_order_at",
    "last_order_at",
    "customer_created_at",
  ];

  const rows = customers.map((customer) => {
    const stats = statsByCustomer.get(customer.id);
    const fullName =
      `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || (customer.name || "");

    return [
      customer.email || "",
      customer.first_name || "",
      customer.last_name || "",
      fullName,
      customer.phone || "",
      String(stats?.totalOrders ?? 0),
      formatEuroCents(stats?.totalSpentCents ?? 0),
      stats?.firstOrderAt || "",
      stats?.lastOrderAt || "",
      toIsoDate(customer.created_at),
    ];
  });

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => escapeCsvCell(String(cell))).join(","))
    .join("\r\n");

  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"clienti-mailing-list.csv\"",
      "Cache-Control": "no-store",
    },
  });
}
