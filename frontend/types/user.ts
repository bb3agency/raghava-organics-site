export type UserRole = "CUSTOMER" | "ADMIN" | string;

export interface User {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  role?: UserRole;
  permissions?: string[];
}

export interface AuthSession {
  accessToken: string;
  user: User;
  permissions?: string[];
}
