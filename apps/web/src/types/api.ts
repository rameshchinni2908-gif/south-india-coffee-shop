export interface ApiErrorBody {
  code: string;
  message: string;
}

export interface ApiResponse<TData, TMeta = Record<string, never>> {
  success: boolean;
  data: TData;
  meta: TMeta;
  error: ApiErrorBody | null;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
