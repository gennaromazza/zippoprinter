"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Upload, X, Image as ImageIcon, ShoppingCart, Loader2, Check } from "lucide-react";

interface Photo {
  id: string;
  file: File;
  preview: string;
  formatId: string;
  quantity: number;
  uploading?: boolean;
  uploaded?: boolean;
  storagePath?: string;
}

interface Format {
  id: string;
  name: string;
  width_cm: number;
  height_cm: number;
  price_cents: number;
}

interface UploadFormProps {
  formats: Format[];
  photographerId?: string;
}

export function UploadForm({ formats, photographerId }: UploadFormProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"upload" | "cart" | "checkout" | "success">("upload");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newPhotos = files.map((file) => ({
      id: Math.random().toString(36).substring(7),
      file,
      preview: URL.createObjectURL(file),
      formatId: formats[0]?.id || "",
      quantity: 1,
    }));
    setPhotos((prev) => [...prev, ...newPhotos]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => {
      const photo = prev.find((p) => p.id === id);
      if (photo) {
        URL.revokeObjectURL(photo.preview);
      }
      return prev.filter((p) => p.id !== id);
    });
  };

  const updatePhoto = (id: string, updates: Partial<Photo>) => {
    setPhotos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
  };

  const getTotal = () => {
    return photos.reduce((total, photo) => {
      const format = formats.find((f) => f.id === photo.formatId);
      return total + (format?.price_cents || 0) * photo.quantity;
    }, 0);
  };

  const handleUpload = async () => {
    setLoading(true);
    
    // Create order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        photographer_id: photographerId,
        customer_email: customerEmail,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        status: "pending",
        total_cents: getTotal(),
      })
      .select()
      .single();

    if (orderError || !order) {
      alert("Errore nella creazione dell'ordine");
      setLoading(false);
      return;
    }

    // Upload photos and create order items
    const orderItems = [];
    
    for (const photo of photos) {
      const fileExt = photo.file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const storagePath = `${photographerId}/${order.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("photos")
        .upload(storagePath, photo.file);

      if (uploadError) {
        console.error("Upload error:", uploadError);
        continue;
      }

      const format = formats.find((f) => f.id === photo.formatId);
      
      orderItems.push({
        order_id: order.id,
        print_format_id: photo.formatId,
        format_name: format?.name || "Unknown",
        format_price_cents: format?.price_cents || 0,
        quantity: photo.quantity,
        storage_path: storagePath,
        original_filename: photo.file.name,
      });
    }

    // Insert order items
    if (orderItems.length > 0) {
      await supabase.from("order_items").insert(orderItems);
    }

    setLoading(false);
    setStep("success");
  };

  const getCartItems = () => {
    return photos.map((photo) => {
      const format = formats.find((f) => f.id === photo.formatId);
      return {
        ...photo,
        format,
        subtotal: (format?.price_cents || 0) * photo.quantity,
      };
    });
  };

  if (step === "success") {
    return (
      <div className="text-center py-12">
        <div className="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
          <Check className="h-10 w-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold mb-4">Ordine Inviato!</h2>
        <p className="text-gray-600 mb-6">
          Il tuo ordine è stato inviato correttamente. <br />
          Riceverai una email di conferma.
        </p>
        <p className="text-sm text-gray-500">
          Verrai contattato tramite WhatsApp quando le stampe saranno pronte.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Customer Info */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-4">I tuoi dati</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="tua@email.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Nome (opzionale)</Label>
            <Input
              id="name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Mario Rossi"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Telefono (opzionale)</Label>
            <Input
              id="phone"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="333 1234567"
            />
          </div>
        </div>
      </div>

      {/* Upload Area */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-4">Carica le tue foto</h2>
        
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          id="photo-upload"
        />
        
        <label
          htmlFor="photo-upload"
          className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 transition-colors"
        >
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <Upload className="w-10 h-10 text-gray-400 mb-3" />
            <p className="mb-2 text-sm text-gray-500">
              <span className="font-semibold">Clicca per caricare</span> le tue foto
            </p>
            <p className="text-xs text-gray-400">PNG, JPG fino a 10MB</p>
          </div>
        </label>

        {/* Photo Grid */}
        {photos.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            {photos.map((photo) => (
              <div key={photo.id} className="relative group">
                <img
                  src={photo.preview}
                  alt="Preview"
                  className="w-full aspect-square object-cover rounded-lg"
                />
                <button
                  onClick={() => removePhoto(photo.id)}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="mt-2 space-y-2">
                  <select
                    value={photo.formatId}
                    onChange={(e) => updatePhoto(photo.id, { formatId: e.target.value })}
                    className="w-full text-sm border rounded p-1"
                  >
                    {formats.map((format) => (
                      <option key={format.id} value={format.id}>
                        {format.name} - €{(format.price_cents / 100).toFixed(2)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={photo.quantity}
                    onChange={(e) => updatePhoto(photo.id, { quantity: parseInt(e.target.value) })}
                    className="w-full text-sm border rounded p-1"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>Quantità: {n}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cart Summary */}
      {photos.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Riepilogo</h2>
            <span className="text-2xl font-bold">
              €{(getTotal() / 100).toFixed(2)}
            </span>
          </div>
          <p className="text-gray-600 mb-4">
            {photos.length} foto da stampare
          </p>
          <Button 
            className="w-full" 
            size="lg"
            disabled={!customerEmail}
            onClick={() => setShowCheckout(true)}
          >
            <ImageIcon className="w-4 h-4 mr-2" />
            Procedi all'Ordine
          </Button>
        </div>
      )}

      {/* Checkout Dialog */}
      <Dialog open={showCheckout} onOpenChange={setShowCheckout}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Conferma Ordine</DialogTitle>
            <DialogDescription>
              Controlla i dettagli prima di inviare l'ordine
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium mb-2">Dati Cliente</h3>
              <p>Email: {customerEmail}</p>
              {customerName && <p>Nome: {customerName}</p>}
              {customerPhone && <p>Telefono: {customerPhone}</p>}
            </div>

            <div className="max-h-60 overflow-y-auto">
              <h3 className="font-medium mb-2">Foto selezionate</h3>
              {getCartItems().map((item) => (
                <div key={item.id} className="flex justify-between py-2 border-b">
                  <div className="flex items-center gap-3">
                    <img src={item.preview} alt="" className="w-12 h-12 object-cover rounded" />
                    <div>
                      <p className="text-sm">{item.file.name}</p>
                      <p className="text-xs text-gray-500">
                        {item.format?.name} x{item.quantity}
                      </p>
                    </div>
                  </div>
                  <p className="font-medium">€{(item.subtotal / 100).toFixed(2)}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-between text-lg font-bold pt-4 border-t">
              <span>Totale</span>
              <span>€{(getTotal() / 100).toFixed(2)}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCheckout(false)}>
              Annulla
            </Button>
            <Button onClick={handleUpload} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Invio in corso...
                </>
              ) : (
                <>
                  Invia Ordine
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
