import { environment } from "../config/environment.js";
import type { ApiResponse } from "../types/api.js";

export class ApiClientError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

const apiRequest = async <TData, TMeta = Record<string, never>>(
  path: string,
  options: RequestInit,
): Promise<ApiResponse<TData, TMeta>> => {
  const response = await fetch(`${environment.apiBaseUrl}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      Accept: "application/json",
      ...options.headers,
    },
  });
  const payload = (await response.json()) as ApiResponse<TData, TMeta>;

  if (!response.ok || !payload.success) {
    throw new ApiClientError(
      response.status,
      payload.error?.code ?? "REQUEST_FAILED",
      payload.error?.message ?? "The request could not be completed",
    );
  }

  return payload;
};

export const apiGet = async <TData, TMeta = Record<string, never>>(
  path: string,
  signal?: AbortSignal,
): Promise<ApiResponse<TData, TMeta>> => {
  const requestOptions: RequestInit = {
    method: "GET",
  };

  if (signal) {
    requestOptions.signal = signal;
  }

  return apiRequest<TData, TMeta>(path, requestOptions);
};

export const apiPost = async <TData, TBody, TMeta = Record<string, never>>(
  path: string,
  body: TBody,
  signal?: AbortSignal,
): Promise<ApiResponse<TData, TMeta>> => {
  const requestOptions: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };

  if (signal) {
    requestOptions.signal = signal;
  }

  return apiRequest<TData, TMeta>(path, requestOptions);
};

export const apiPatch = async <TData, TBody, TMeta = Record<string, never>>(
  path: string,
  body: TBody,
): Promise<ApiResponse<TData, TMeta>> =>
  apiRequest<TData, TMeta>(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const apiDelete = async <TData, TMeta = Record<string, never>>(
  path: string,
): Promise<ApiResponse<TData, TMeta>> => apiRequest<TData, TMeta>(path, { method: "DELETE" });
