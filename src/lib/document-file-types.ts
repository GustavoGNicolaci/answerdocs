export const SUPPORTED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const SUPPORTED_IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
] as const;

export const DOCUMENT_FILE_ACCEPT = [
  "application/pdf",
  "text/plain",
  ...SUPPORTED_IMAGE_MIME_TYPES,
  ".pdf",
  ".txt",
  ...SUPPORTED_IMAGE_EXTENSIONS,
].join(",");

export const IMAGE_NO_TEXT_ERROR =
  "We couldn\u2019t find any text in this image. Please upload an image with readable text so I can analyze it.";

export type SupportedImageMimeType =
  (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];

export function isSupportedImageMimeType(
  value: string | undefined,
): value is SupportedImageMimeType {
  return SUPPORTED_IMAGE_MIME_TYPES.includes(
    value as SupportedImageMimeType,
  );
}

export function hasSupportedImageExtension(filename: string) {
  const lowerName = filename.toLowerCase();
  return SUPPORTED_IMAGE_EXTENSIONS.some((extension) =>
    lowerName.endsWith(extension),
  );
}

export function getImageMimeTypeFromFilename(
  filename: string,
): SupportedImageMimeType | null {
  const lowerName = filename.toLowerCase();

  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lowerName.endsWith(".webp")) return "image/webp";

  return null;
}

export function resolveImageMimeType(input: {
  mimeType?: string;
  filename: string;
}) {
  if (isSupportedImageMimeType(input.mimeType)) return input.mimeType;

  return getImageMimeTypeFromFilename(input.filename);
}
