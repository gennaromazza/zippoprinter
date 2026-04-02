import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Settings as SettingsIcon, Plus, Pencil, Trash2 } from "lucide-react";
import { PrintFormatsManager } from "./print-formats-manager";
import { PhotographerSettings } from "./photographer-settings";

export default async function SettingsPage() {
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

  const { data: printFormats } = await supabase
    .from("print_formats")
    .select("*")
    .eq("photographer_id", photographer?.id)
    .order("sort_order", { ascending: true });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="bg-primary p-2 rounded-lg">
                <SettingsIcon className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-xl font-bold">Impostazioni</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Photographer Info */}
        <PhotographerSettings photographer={photographer} />

        {/* Print Formats */}
        <PrintFormatsManager formats={printFormats || []} photographerId={photographer?.id} />
      </main>
    </div>
  );
}
