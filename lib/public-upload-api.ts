// Separate from lib/api.ts on purpose: request() there attaches a Clerk
// bearer token and redirects to /sign-in on 401, neither of which applies
// on the public /upload/[token] page - there's no Clerk session here, and
// the token itself (not a Clerk session) is what authorizes these calls.

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class PublicUploadApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, init);
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      message = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? body);
    } catch {
      // ignore, use status text
    }
    throw new PublicUploadApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function json(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export interface UploadLinkInfo {
  client_name: string;
  organization_name: string;
}

export interface UploadBatchCreated {
  batch_id: number;
  status: string;
}

export interface InitUploadItemResult {
  item_id: number;
  upload_url: string;
  method: string;
  headers: Record<string, string>;
}

export interface UploadItemStatusOut {
  item_id: number;
  filename: string;
  status:
    | "awaiting_upload"
    | "uploaded"
    | "queued"
    | "processing"
    | "completed"
    | "failed";
  error: string | null;
}

export interface UploadBatchStatusOut {
  batch_id: number;
  status: string;
  file_count: number;
  items: UploadItemStatusOut[];
}

export const getUploadLinkInfo = (token: string) =>
  request<UploadLinkInfo>(`/public/uploads/${token}`);

export const createUploadBatch = (token: string) =>
  request<UploadBatchCreated>(`/public/uploads/${token}/batches`, {
    method: "POST",
  });

export const initUploadItem = (
  token: string,
  batchId: number,
  file: File
) =>
  request<InitUploadItemResult>(`/public/uploads/${token}/batches/${batchId}/items`, {
    ...json("POST", {
      filename: file.name,
      content_type: file.type || null,
      size_bytes: file.size,
    }),
  });

export const completeUploadItem = (
  token: string,
  batchId: number,
  itemId: number
) =>
  request<{ item_id: number; status: string }>(
    `/public/uploads/${token}/batches/${batchId}/items/${itemId}/complete`,
    { method: "POST" }
  );

export const finalizeUploadBatch = (token: string, batchId: number) =>
  request<void>(`/public/uploads/${token}/batches/${batchId}/finalize`, {
    method: "POST",
  });

export const getUploadBatchStatus = (token: string, batchId: number) =>
  request<UploadBatchStatusOut>(`/public/uploads/${token}/batches/${batchId}`);

// XHR (not fetch) because we need upload progress events, which fetch's
// duplex-stream API doesn't expose cleanly in browsers yet - PUTs the file
// bytes straight to the R2 presigned URL, not through our own API.
export function uploadFileToR2(
  uploadUrl: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (fraction: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed (network error)"));
    xhr.send(file);
  });
}
