import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildStoragePath } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UploadRequestItem {
  clientId: string;
  originalFilename: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      photographerId?: string;
      files?: UploadRequestItem[];
    };

    const photographerId = String(body.photographerId || "");
    const files = Array.isArray(body.files) ? body.files : [];

    if (!photographerId || files.length === 0) {
      return NextResponse.json({ error: "Dati upload incompleti." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: photographer } = await admin
      .from("photographers")
      .select("id")
      .eq("id", photographerId)
      .maybeSingle();

    if (!photographer) {
      return NextResponse.json({ error: "Studio fotografico non trovato." }, { status: 404 });
    }

    const uploads = await Promise.all(
      files.map(async (file) => {
        const storagePath = buildStoragePath({
          photographerId,
          clientId: file.clientId,
          originalFilename: file.originalFilename,
        });

        const { data, error } = await admin.storage.from("photos").createSignedUploadUrl(storagePath);

        if (error || !data?.token) {
          throw new Error("Non e stato possibile preparare l'upload delle immagini.");
        }

        return {
          clientId: file.clientId,
          storagePath,
          token: data.token,
        };
      })
    );

    return NextResponse.json({ uploads });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Errore durante la preparazione dell'upload.",
      },
      { status: 500 }
    );
  }
}
