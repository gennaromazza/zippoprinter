import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPhotographerForUser } from "@/lib/photographers";
import { createClient } from "@/lib/supabase/server";
import { isSameOriginRequest } from "@/lib/request-security";
import type { Photographer } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BG_BYTES = 6 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const BUCKET_NAME = "studio-assets";

function resolveExtension(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

export async function POST(request: Request) {
  if (!(await isSameOriginRequest())) {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }

  const photographer = (await getCurrentPhotographerForUser(user)) as Photographer | null;
  if (!photographer) {
    return NextResponse.json({ error: "Profilo studio non trovato." }, { status: 404 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File sfondo mancante." }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Formato non supportato. Usa JPG, PNG o WEBP." },
        { status: 400 }
      );
    }

    if (file.size <= 0 || file.size > MAX_BG_BYTES) {
      return NextResponse.json(
        { error: "Il file sfondo supera il limite massimo di 6MB." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { data: buckets } = await admin.storage.listBuckets();
    const bucketExists = buckets?.some((bucket) => bucket.name === BUCKET_NAME);

    if (!bucketExists) {
      const { error: bucketError } = await admin.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: `${MAX_BG_BYTES}`,
        allowedMimeTypes: Array.from(ALLOWED_MIME_TYPES),
      });
      if (bucketError) {
        throw new Error(bucketError.message);
      }
    }

    const extension = resolveExtension(file.type);
    const safeBaseName = (file.name || "background")
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "background";
    const storagePath = `storefront-backgrounds/${photographer.id}/${Date.now()}-${safeBaseName}.${extension}`;

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await admin.storage
      .from(BUCKET_NAME)
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data: publicData } = admin.storage.from(BUCKET_NAME).getPublicUrl(storagePath);
    return NextResponse.json({
      url: publicData.publicUrl,
      storagePath,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Errore upload sfondo storefront.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
