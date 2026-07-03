export const MAX_UPLOAD_FILE_MB = 20;
export const MAX_UPLOAD_FILE_BYTES = MAX_UPLOAD_FILE_MB * 1024 * 1024;

export function isUploadFileTooLarge(sizeBytes: number) {
  return sizeBytes > MAX_UPLOAD_FILE_BYTES;
}
