export function normalizeFilename(filename: string) {
  return filename
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildStoragePath({
  photographerId,
  clientId,
  originalFilename,
}: {
  photographerId: string;
  clientId: string;
  originalFilename: string;
}) {
  const extension = originalFilename.split(".").pop() || "jpg";
  const safeBase = normalizeFilename(originalFilename.replace(/\.[^.]+$/, "")) || clientId;
  const fileName = `${Date.now()}-${clientId}-${safeBase}.${extension}`;
  return `${photographerId}/incoming/${fileName}`;
}
