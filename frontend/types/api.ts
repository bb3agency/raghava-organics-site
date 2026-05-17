export interface ApiErrorBody {
  code: string;
  message: string;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
  error?: ApiErrorBody;
}

export interface HealthStatus {
  status: string;
  db?: string;
  database?: string;
  redis: string;
}
