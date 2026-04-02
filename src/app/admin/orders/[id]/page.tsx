import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Package, Download, MessageCircle, Trash2, Check } from "lucide-react";
import { markOrderReady, deleteOrderPhotos } from "./actions";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: photographer } = await supabase
    .from("photographers")
    .select("*")
    .eq("email", user.email)
    .single();

  const { data: order } = await supabase
    .from("orders")
    .select(`
      *,
      order_items (*)
    `)
    .eq("id", id)
    .eq("photographer_id", photographer?.id)
    .single();

  if (!order) {
    notFound();
  }

  const orderItems = order?.order_items || [];
  const itemsWithUrls = await Promise.all(
    (orderItems as any[]).map(async (item) => {
      const { data: urlData } = await supabase.storage
        .from("photos")
        .createSignedUrl(item.storage_path, 3600);
      return { ...item, signedUrl: urlData?.signedUrl };
    })
  );

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    paid: "bg-blue-100 text-blue-800",
    printing: "bg-purple-100 text-purple-800",
    ready: "bg-green-100 text-green-800",
    completed: "bg-gray-100 text-gray-800",
    cancelled: "bg-red-100 text-red-800",
  };

  const statusLabels: Record<string, string> = {
    pending: "In attesa",
    paid: "Pagato",
    printing: "In stampa",
    ready: "Pronto",
    completed: "Completato",
    cancelled: "Annullato",
  };

  const whatsappMessage = encodeURIComponent(
    `Ciao! Le tue stampe sono pronte per il ritiro! 🎉`
  );
  const whatsappUrl = photographer?.whatsapp_number
    ? `https://wa.me/${photographer.whatsapp_number.replace(/\D/g, "")}?text=${whatsappMessage}`
    : "#";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/orders">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="bg-primary p-2 rounded-lg">
                <Package className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Dettaglio Ordine</h1>
                <p className="text-sm text-gray-500">
                  {new Date(order.created_at).toLocaleDateString("it-IT")}
                </p>
              </div>
            </div>
          </div>
          <span className={`px-4 py-2 rounded-full text-sm font-medium ${statusColors[order.status]}`}>
            {statusLabels[order.status]}
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Info Cliente */}
          <Card>
            <CardHeader>
              <CardTitle>Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">Email</p>
                <p className="font-medium">{order.customer_email}</p>
              </div>
              {order.customer_name && (
                <div>
                  <p className="text-sm text-gray-500">Nome</p>
                  <p className="font-medium">{order.customer_name}</p>
                </div>
              )}
              {order.customer_phone && (
                <div>
                  <p className="text-sm text-gray-500">Telefono</p>
                  <p className="font-medium">{order.customer_phone}</p>
                </div>
              )}
              {photographer?.whatsapp_number && (
                <a 
                  href={whatsappUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 w-full mt-4 px-4 py-2 border border-input bg-background rounded-lg text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <MessageCircle className="h-4 w-4" />
                  Avvisa su WhatsApp
                </a>
              )}
            </CardContent>
          </Card>

          {/* Riepilogo Ordine */}
          <Card>
            <CardHeader>
              <CardTitle>Riepilogo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">Totale</p>
                <p className="text-2xl font-bold">
                  €{(order.total_cents / 100).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Foto</p>
                <p className="font-medium">{order.order_items?.length || 0} foto</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Data ordine</p>
                <p className="font-medium">
                  {new Date(order.created_at).toLocaleDateString("it-IT", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              {order.paid_at && (
                <div>
                  <p className="text-sm text-gray-500">Pagato il</p>
                  <p className="font-medium">
                    {new Date(order.paid_at).toLocaleDateString("it-IT")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Azioni */}
          <Card>
            <CardHeader>
              <CardTitle>Azioni</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {order.status === "paid" && (
                <form action={markOrderReady.bind(null, order.id)}>
                  <Button className="w-full">
                    <Check className="h-4 w-4 mr-2" />
                    Segna come Pronto
                  </Button>
                </form>
              )}
              {(order.status === "paid" || order.status === "printing") && (
                <form action={deleteOrderPhotos.bind(null, order.id, itemsWithUrls.map((i: any) => i.storage_path))}>
                  <Button variant="destructive" className="w-full">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Elimina Foto
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Foto */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Foto da Stampare</CardTitle>
            <CardDescription>
              {itemsWithUrls.length} foto - Clicca per ingrandire
            </CardDescription>
          </CardHeader>
          <CardContent>
            {itemsWithUrls.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Nessuna foto in questo ordine</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {itemsWithUrls.map((item: any) => (
                  <div key={item.id} className="relative group">
                    <img
                      src={item.signedUrl || ""}
                      alt={item.original_filename}
                      className="w-full aspect-square object-cover rounded-lg border"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-2 rounded-b-lg">
                      <p className="text-xs truncate">{item.format_name}</p>
                      <p className="text-xs">x{item.quantity}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
