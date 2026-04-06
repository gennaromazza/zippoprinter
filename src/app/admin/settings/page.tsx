import { redirect } from "next/navigation";
import { Settings as SettingsIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPhotographerForUser } from "@/lib/photographers";
import type { Photographer, PrintFormat } from "@/lib/types";
import { PhotographerSettings } from "./photographer-settings";
import { DomainSettingsPanel } from "./domain-settings-panel";
import { PrintFormatsManager } from "./print-formats-manager";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const photographer = (await getCurrentPhotographerForUser(user)) as Photographer | null;

  if (!photographer) {
    redirect("/admin");
  }

  const { data: printFormatsData } = await supabase
    .from("print_formats")
    .select("*")
    .eq("photographer_id", photographer?.id)
    .order("sort_order", { ascending: true });

  const printFormats = (printFormatsData as PrintFormat[] | null) ?? [];

  return (
    <div className="px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <p className="section-kicker"><SettingsIcon className="h-3.5 w-3.5" />Impostazioni</p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Branding e formati</h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Presentazione white-label, catalogo formati di stampa e modalita di checkout.
          </p>
        </header>

        <div className="space-y-6">
          <PhotographerSettings photographer={photographer} />
          <DomainSettingsPanel />
          <PrintFormatsManager formats={printFormats} photographerId={photographer?.id || ""} />
        </div>
      </div>
    </div>
  );
}
