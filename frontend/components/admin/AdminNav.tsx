"use client";

import Link from "next/link";
import { useAuthStore } from "@/stores/auth";
import { canViewAdminRoute } from "@/lib/permissions";

export function AdminNav() {
  const user = useAuthStore((state) => state.user);

  return (
    <nav className="mb-8 flex flex-wrap gap-4 text-sm" aria-label="Admin">
      {canViewAdminRoute(user, "dashboard") ? <Link href="/admin">Dashboard</Link> : null}
      {canViewAdminRoute(user, "orders") ? <Link href="/admin/orders">Orders</Link> : null}
      {canViewAdminRoute(user, "orders") ? (
        <Link href="/admin/orders/board">Order Board</Link>
      ) : null}
      {canViewAdminRoute(user, "products") ? <Link href="/admin/products">Products</Link> : null}
      {canViewAdminRoute(user, "products") ? (
        <Link href="/admin/catalog-write">Catalog Write</Link>
      ) : null}
      {canViewAdminRoute(user, "inventory") ? (
        <Link href="/admin/inventory">Inventory</Link>
      ) : null}
      {canViewAdminRoute(user, "customers") ? (
        <Link href="/admin/customers">Customers</Link>
      ) : null}
      {canViewAdminRoute(user, "returns") ? <Link href="/admin/returns">Returns</Link> : null}
      {canViewAdminRoute(user, "mutations") ? (
        <Link href="/admin/mutations">Mutations</Link>
      ) : null}
      {canViewAdminRoute(user, "reliability") ? (
        <Link href="/admin/reliability">Reliability</Link>
      ) : null}
      {canViewAdminRoute(user, "queues") ? <Link href="/admin/queues">Queues</Link> : null}
      {canViewAdminRoute(user, "security") ? (
        <Link href="/admin/security/mfa">Security MFA</Link>
      ) : null}
      {canViewAdminRoute(user, "settings") ? (
        <>
          <Link href="/admin/settings/cod">Settings COD</Link>
          <Link href="/admin/settings/shipping">Settings Shipping</Link>
          <Link href="/admin/settings/store">Settings Store</Link>
          <Link href="/admin/settings/notifications">Settings Notifications</Link>
          <Link href="/admin/settings/inventory">Settings Inventory</Link>
        </>
      ) : null}
    </nav>
  );
}
