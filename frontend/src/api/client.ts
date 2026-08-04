import type { ApiErrorBody } from "../types";

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

function authorizationHeaders(): HeadersInit {
  const token = localStorage.getItem("speaking-lab-token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiError(response: Response): Promise<ApiError> {
  const data = (await response.json().catch(() => ({}))) as ApiErrorBody;
  const detail = Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail;
  return new ApiError(
    response.status,
    data.error?.code || "REQUEST_FAILED",
    data.error?.message || detail || "请求失败",
  );
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isForm = options.body instanceof FormData;
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...authorizationHeaders(),
      ...options.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  if (!response.ok) throw await apiError(response);
  return response.json() as Promise<T>;
}

export function mediaUrl(path: string): string {
  if (path.startsWith("http")) return path;
  if (path.startsWith("/recordings/")) return `${API_URL}${path}`;
  return `${API_URL.replace(/\/api\/v1\/?$/, "")}${path}`;
}

export async function fetchMedia(path: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch(mediaUrl(path), {
    headers: authorizationHeaders(),
    signal,
  });
  if (!response.ok) throw await apiError(response);
  return response.blob();
}

export async function downloadMedia(path: string, filename: string): Promise<void> {
  const blob = await fetchMedia(path);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}
