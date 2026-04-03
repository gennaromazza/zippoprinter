import type { OrderItem } from "./types";

export interface OrderExportEntry {
  storagePath: string;
  formatName: string;
  sourceFilename: string;
  copyIndex: number;
  quantity: number;
  formatFolder: string;
  outputFileName: string;
  outputRelativePath: string;
}

export interface OrderExportEntryWithUrl extends OrderExportEntry {
  signedUrl: string;
}

function toCsvValue(value: string | number) {
  const stringValue = String(value ?? "");
  const escaped = stringValue.replace(/"/g, "\"\"");
  return `"${escaped}"`;
}

export function sanitizePathSegment(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "item";
}

function splitFilename(sourceFilename: string, fallbackName: string) {
  const candidate = sourceFilename || fallbackName;
  const cleanName = candidate.split("/").pop() || fallbackName;
  const extension = cleanName.includes(".") ? cleanName.split(".").pop() || "" : "";
  const base = extension ? cleanName.slice(0, -(extension.length + 1)) : cleanName;
  return {
    base: sanitizePathSegment(base) || fallbackName,
    extension: extension ? sanitizePathSegment(extension).toLowerCase() : "",
  };
}

export function buildOrderExportEntries(orderId: string, orderItems: OrderItem[]): OrderExportEntry[] {
  const sortedItems = [...orderItems].sort((a, b) => {
    const formatCompare = a.format_name.localeCompare(b.format_name, "it");
    if (formatCompare !== 0) {
      return formatCompare;
    }

    const filenameCompare = (a.original_filename || "").localeCompare(b.original_filename || "", "it");
    if (filenameCompare !== 0) {
      return filenameCompare;
    }

    return a.id.localeCompare(b.id);
  });

  const uniqueFormats = [...new Set(sortedItems.map((item) => item.format_name))];
  const formatFolderMap = new Map(
    uniqueFormats.map((format, index) => [
      format,
      `${String(index + 1).padStart(2, "0")}-${sanitizePathSegment(format)}`,
    ])
  );

  const entries: OrderExportEntry[] = [];
  for (const item of sortedItems) {
    const fallbackName = `${orderId}-${item.id}`;
    const filename = splitFilename(item.original_filename || "", fallbackName);
    const formatFolder = formatFolderMap.get(item.format_name) || "99-format";
    const extensionSuffix = filename.extension ? `.${filename.extension}` : "";
    const safeQuantity = Math.min(Math.max(item.quantity || 1, 1), 999);

    for (let copyIndex = 1; copyIndex <= safeQuantity; copyIndex += 1) {
      const outputFileName = `${filename.base}__copy-${String(copyIndex).padStart(2, "0")}${extensionSuffix}`;
      entries.push({
        storagePath: item.storage_path,
        formatName: item.format_name,
        sourceFilename: item.original_filename || `${filename.base}${extensionSuffix}`,
        copyIndex,
        quantity: safeQuantity,
        formatFolder,
        outputFileName,
        outputRelativePath: `${formatFolder}/${outputFileName}`,
      });
    }
  }

  return entries;
}

export function buildManifestCsv(entries: OrderExportEntryWithUrl[]) {
  const header = [
    "index",
    "format_name",
    "source_filename",
    "storage_path",
    "copy_index",
    "quantity",
    "output_relative_path",
    "signed_url",
  ];

  const rows = entries.map((entry, index) =>
    [
      index + 1,
      entry.formatName,
      entry.sourceFilename,
      entry.storagePath,
      entry.copyIndex,
      entry.quantity,
      entry.outputRelativePath,
      entry.signedUrl,
    ]
      .map(toCsvValue)
      .join(",")
  );

  return `${header.join(",")}\n${rows.join("\n")}\n`;
}

export function buildLinksText(entries: OrderExportEntryWithUrl[]) {
  return `${entries.map((entry) => entry.signedUrl).join("\n")}\n`;
}

export function buildAria2Text(entries: OrderExportEntryWithUrl[]) {
  return `${entries
    .map((entry) => `${entry.signedUrl}\n  dir=${entry.formatFolder}\n  out=${entry.outputFileName}`)
    .join("\n\n")}\n`;
}
