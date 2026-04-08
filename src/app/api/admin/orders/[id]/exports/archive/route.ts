import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPhotographerForUser } from "@/lib/photographers";
import { buildOrderExportEntries, sanitizePathSegment } from "@/lib/order-exports";
import { createClient } from "@/lib/supabase/server";
import type { OrderItem, Photographer } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ZipCentralEntry {
  nameBytes: Buffer;
  crc: number;
  size: number;
  offset: number;
  time: number;
  date: number;
}

const crc32Table = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crc32Table[n] = c >>> 0;
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = crc32Table[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(input: Date) {
  const year = Math.max(1980, input.getFullYear());
  const month = input.getMonth() + 1;
  const day = input.getDate();
  const hour = input.getHours();
  const minute = input.getMinutes();
  const second = Math.floor(input.getSeconds() / 2);

  const dosTime = (hour << 11) | (minute << 5) | second;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

function createLocalFileHeader(
  nameBytes: Buffer,
  crc: number,
  size: number,
  dosTime: number,
  dosDate: number
) {
  const header = Buffer.alloc(30 + nameBytes.length);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6); // UTF-8
  header.writeUInt16LE(0, 8); // Store (no compression)
  header.writeUInt16LE(dosTime, 10);
  header.writeUInt16LE(dosDate, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(size, 18);
  header.writeUInt32LE(size, 22);
  header.writeUInt16LE(nameBytes.length, 26);
  header.writeUInt16LE(0, 28);
  nameBytes.copy(header, 30);
  return header;
}

function createCentralDirectoryHeader(entry: ZipCentralEntry) {
  const header = Buffer.alloc(46 + entry.nameBytes.length);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8); // UTF-8
  header.writeUInt16LE(0, 10); // Store (no compression)
  header.writeUInt16LE(entry.time, 12);
  header.writeUInt16LE(entry.date, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.size, 20);
  header.writeUInt32LE(entry.size, 24);
  header.writeUInt16LE(entry.nameBytes.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(entry.offset, 42);
  entry.nameBytes.copy(header, 46);
  return header;
}

function createEndOfCentralDirectory(
  totalEntries: number,
  centralDirectorySize: number,
  centralDirectoryOffset: number
) {
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(totalEntries, 8);
  endRecord.writeUInt16LE(totalEntries, 10);
  endRecord.writeUInt32LE(centralDirectorySize, 12);
  endRecord.writeUInt32LE(centralDirectoryOffset, 16);
  endRecord.writeUInt16LE(0, 20);
  return endRecord;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  const admin = createAdminClient();
  const { data: orderData } = await admin
    .from("orders")
    .select("id, photographer_id, customer_first_name, customer_last_name, customer_name, customer_phone")
    .eq("id", id)
    .eq("photographer_id", photographer.id)
    .maybeSingle();

  if (!orderData) {
    return NextResponse.json({ error: "Ordine non trovato." }, { status: 404 });
  }

  const { data: orderItemsData } = await admin
    .from("order_items")
    .select("*")
    .eq("order_id", id)
    .order("created_at", { ascending: true });

  const orderItems = (orderItemsData as OrderItem[] | null) ?? [];
  if (orderItems.length === 0) {
    return NextResponse.json({ error: "Questo ordine non contiene immagini." }, { status: 400 });
  }

  const entries = buildOrderExportEntries(id, orderItems);
  const customerFirstName = sanitizePathSegment(String(orderData.customer_first_name || ""));
  const customerLastName = sanitizePathSegment(String(orderData.customer_last_name || ""));
  const customerFallbackName = sanitizePathSegment(String(orderData.customer_name || ""));
  const customerPhone = sanitizePathSegment(String(orderData.customer_phone || "").replace(/\D/g, ""));
  const customerLabel =
    `${customerFirstName}${customerLastName}` || customerFallbackName || "Cliente";
  const phoneLabel = customerPhone || "NoTel";
  const orderLabel = `Ordine-${sanitizePathSegment(id)}`;
  const zipBaseName = `${customerLabel}-${phoneLabel}-${orderLabel}`;
  const zipName = `${zipBaseName}.zip`;
  const rootFolder = zipBaseName;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const centralEntries: ZipCentralEntry[] = [];
        let offset = 0;
        let previousStoragePath = "";
        let previousBuffer: Buffer | null = null;

        for (const entry of entries) {
          let fileBuffer: Buffer | null = previousBuffer;
          if (entry.storagePath !== previousStoragePath || !fileBuffer) {
            const { data: fileBlob, error: downloadError } = await admin.storage
              .from("photos")
              .download(entry.storagePath);

            if (downloadError || !fileBlob) {
              throw new Error(`Download fallito per ${entry.storagePath}.`);
            }

            fileBuffer = Buffer.from(await fileBlob.arrayBuffer());
            previousStoragePath = entry.storagePath;
            previousBuffer = fileBuffer;
          }

          const nameBytes = Buffer.from(`${rootFolder}/${entry.outputRelativePath}`, "utf8");
          const { dosTime, dosDate } = getDosDateTime(new Date());
          const fileCrc = crc32(fileBuffer);
          const localHeader = createLocalFileHeader(
            nameBytes,
            fileCrc,
            fileBuffer.length,
            dosTime,
            dosDate
          );

          controller.enqueue(localHeader);
          controller.enqueue(fileBuffer);

          centralEntries.push({
            nameBytes,
            crc: fileCrc,
            size: fileBuffer.length,
            offset,
            time: dosTime,
            date: dosDate,
          });

          offset += localHeader.length + fileBuffer.length;
        }

        const centralOffset = offset;
        let centralSize = 0;

        for (const entry of centralEntries) {
          const centralHeader = createCentralDirectoryHeader(entry);
          controller.enqueue(centralHeader);
          centralSize += centralHeader.length;
          offset += centralHeader.length;
        }

        controller.enqueue(
          createEndOfCentralDirectory(centralEntries.length, centralSize, centralOffset)
        );
        controller.close();
      } catch (error) {
        controller.error(
          error instanceof Error ? error : new Error("Errore durante la creazione archivio ZIP.")
        );
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
      "Cache-Control": "no-store",
    },
  });
}
