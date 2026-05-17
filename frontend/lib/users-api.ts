import { apiClient } from "@/lib/api";
import type { User } from "@/types/user";

export interface UserAddress {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  createdAt?: string;
  updatedAt?: string;
}

export async function getCurrentUser(accessToken: string): Promise<User> {
  return apiClient<User>("/users/me", {
    method: "GET",
    accessToken,
  });
}

export async function getMyAddresses(accessToken: string): Promise<UserAddress[]> {
  return apiClient<UserAddress[]>("/users/me/addresses", {
    method: "GET",
    accessToken,
  });
}

export async function getMyOrders(accessToken: string): Promise<
  Array<{
    id: string;
    orderNumber: string;
    status: string;
    paymentMode: "PREPAID" | "COD";
    total: number;
    createdAt: string;
    invoice?: { hasPdf?: boolean } | null;
  }>
> {
  return apiClient<
    Array<{
      id: string;
      orderNumber: string;
      status: string;
      paymentMode: "PREPAID" | "COD";
      total: number;
      createdAt: string;
      invoice?: { hasPdf?: boolean } | null;
    }>
  >("/users/me/orders", {
    method: "GET",
    accessToken,
  });
}
