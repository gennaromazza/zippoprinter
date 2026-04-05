import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Settings as SettingsIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPhotographerForUser } from "@/lib/photographers";
import type { Photographer, PrintFormat } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { PhotographerSettings } from "./photographer-settings";
import { DomainSettingsCard } from "./domain-settings-card";
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
    <div className="min-h-screen px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="glass-panel rounded-[2rem] px-5 py-5 md:px-8">
          <div className="flex items-start gap-4">
            <Link href="/admin">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <p className="section-kicker mb-2">Impostazioni studio</p>
              <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight md:text-4xl">
                <SettingsIcon className="h-7 w-7" />
                Branding e formati
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Aggiorna la presentazione white-label del front-end cliente, il catalogo dei
                formati di stampa e la modalita di checkout del tuo studio.
              </p>
            </div>
          </div>
        </header>

        <main className="mt-6 space-y-6">
          <PhotographerSettings photographer={photographer} />
          <DomainSettingsCard />
          <PrintFormatsManager formats={printFormats} photographerId={photographer?.id || ""} />
        </main>
      </div>
    </div>
  );
}
