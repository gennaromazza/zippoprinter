import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "./upload-form";

export default async function HomePage() {
  let formats = [];
  let photographer = null;
  let error = null;

  try {
    const supabase = await createClient();

    const { data: formatsData, error: formatsError } = await supabase
      .from("print_formats")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (formatsError) {
      console.error("Formats error:", formatsError);
    } else {
      formats = formatsData || [];
    }

    const { data: photographerData, error: photographerError } = await supabase
      .from("photographers")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (photographerError) {
      console.error("Photographer error:", photographerError);
    } else {
      photographer = photographerData;
    }
  } catch (e) {
    console.error("Supabase connection error:", e);
    error = "Errore di connessione al database";
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center">
          <h1 
            className="text-3xl font-bold"
            style={{ color: photographer?.brand_color || "#000" }}
          >
            {photographer?.name || "Stampa Foto"}
          </h1>
          <p className="mt-2 text-gray-600">
            {photographer?.custom_welcome_text || 
              "Carica le tue foto e scegli il formato di stampa che preferisci!"}
          </p>
        </div>
      </header>

      {/* Upload Section */}
      <section className="max-w-4xl mx-auto px-4 py-12">
        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-600">{error}</p>
            <p className="text-sm text-gray-500 mt-2">
              Verifica che il database Supabase sia configurato correttamente.
            </p>
          </div>
        ) : (
          <UploadForm formats={formats} photographerId={photographer?.id} />
        )}
      </section>

      {/* Footer */}
      <footer className="mt-12 py-6 text-center text-sm text-gray-500">
        <p>Powered by ZippoPrinter</p>
      </footer>
    </main>
  );
}
