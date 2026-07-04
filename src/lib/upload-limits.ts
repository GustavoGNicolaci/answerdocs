export const MAX_UPLOAD_FILE_MB = 20;
export const MAX_UPLOAD_FILE_BYTES = MAX_UPLOAD_FILE_MB * 1024 * 1024;
export const MAX_IMAGE_UPLOAD_MB = 8;
export const MAX_IMAGE_UPLOAD_BYTES = MAX_IMAGE_UPLOAD_MB * 1024 * 1024;

export function isUploadFileTooLarge(
  sizeBytes: number,
  maxBytes = MAX_UPLOAD_FILE_BYTES,
) {
  return sizeBytes > maxBytes;
}
