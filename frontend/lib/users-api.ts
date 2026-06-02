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

export async function createMyAddress(
  accessToken: string,
  input: Omit<UserAddress, "id" | "createdAt" | "updatedAt">,
): Promise<UserAddress> {
  return apiClient<UserAddress>("/users/me/addresses", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  });
}

export async function updateMyAddress(
  accessToken: string,
  id: string,
  input: Partial<Omit<UserAddress, "id" | "createdAt" | "updatedAt">>,
): Promise<UserAddress> {
  return apiClient<UserAddress>(`/users/me/addresses/${id}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  });
}

export async function deleteMyAddress(
  accessToken: string,
  id: string,
): Promise<void> {
  return apiClient<void>(`/users/me/addresses/${id}`, {
    method: "DELETE",
    accessToken,
  });
}

export async function updateMyProfile(
  accessToken: string,
  input: { firstName?: string; lastName?: string; email?: string; phone?: string },
): Promise<User> {
  return apiClient<User>("/users/me", {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  });
}
