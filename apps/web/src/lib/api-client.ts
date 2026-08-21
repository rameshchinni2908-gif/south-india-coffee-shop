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

export const apiGet = async <TData, TMeta = Record<string, never>>(
  path: string,
  signal?: AbortSignal,
): Promise<ApiResponse<TData, TMeta>> => {
  const requestOptions: RequestInit = {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  };

  if (signal) {
    requestOptions.signal = signal;
  }

  const response = await fetch(`${environment.apiBaseUrl}${path}`, requestOptions);

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

export const apiPost = async <TData, TBody, TMeta = Record<string, never>>(
  path: string,
  body: TBody,
  signal?: AbortSignal,
): Promise<ApiResponse<TData, TMeta>> => {
  const requestOptions: RequestInit = {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };

  if (signal) {
    requestOptions.signal = signal;
  }

  const response = await fetch(`${environment.apiBaseUrl}${path}`, requestOptions);
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
