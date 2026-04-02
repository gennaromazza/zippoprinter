"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export function PhotographerSettings({ photographer }: { photographer: any }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const formData = new FormData(e.currentTarget);
    
    const { error } = await supabase
      .from("photographers")
      .update({
        name: formData.get("name"),
        phone: formData.get("phone"),
        whatsapp_number: formData.get("whatsapp"),
        brand_color: formData.get("brand_color"),
        custom_welcome_text: formData.get("welcome_text"),
      })
      .eq("id", photographer.id);

    setLoading(false);
    
    if (error) {
      setMessage("Errore nel salvataggio");
    } else {
      setMessage("Salvataggio completato!");
      router.refresh();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Informazioni Studio</CardTitle>
        <CardDescription>
          Le informazioni del tuo studio fotografico
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome Studio</Label>
              <Input
                id="name"
                name="name"
                defaultValue={photographer?.name || ""}
                placeholder="Studio Fotografico Zippo"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefono</Label>
              <Input
                id="phone"
                name="phone"
                defaultValue={photographer?.phone || ""}
                placeholder="+39 333 1234567"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="whatsapp">Numero WhatsApp</Label>
              <Input
                id="whatsapp"
                name="whatsapp"
                defaultValue={photographer?.whatsapp_number || ""}
                placeholder="393331234567 (solo numeri)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand_color">Colore Brand</Label>
              <div className="flex gap-2">
                <Input
                  id="brand_color"
                  name="brand_color"
                  type="color"
                  defaultValue={photographer?.brand_color || "#000000"}
                  className="w-16 h-10 p-1"
                />
                <Input
                  name="brand_color_hex"
                  defaultValue={photographer?.brand_color || "#000000"}
                  className="flex-1"
                  pattern="^#[0-9A-Fa-f]{6}$"
                />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="welcome_text">Testo di Benvenuto (pagina cliente)</Label>
            <textarea
              id="welcome_text"
              name="welcome_text"
              defaultValue={photographer?.custom_welcome_text || ""}
              placeholder="Carica le tue foto e scegli il formato di stampa che preferisci!"
              className="w-full min-h-[100px] px-3 py-2 border rounded-md"
            />
          </div>
          <div className="flex items-center gap-4">
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salva Modifiche
            </Button>
            {message && (
              <span className={message.includes("Errore") ? "text-red-500" : "text-green-500"}>
                {message}
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
