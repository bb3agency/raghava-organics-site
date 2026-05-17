/** Merchant admin permission tokens — must match backend admin-permissions.ts */
export const ADMIN_PERMISSIONS = {
  ordersRead: "orders:read",
  productsRead: "products:read",
  inventoryRead: "inventory:read",
  usersRead: "users:read",
  settingsRead: "settings:read",
} as const;

export function isAdminUser(user: {
  role?: string;
  permissions?: string[];
} | null): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  const perms = user.permissions ?? [];
  return perms.some((p) => p.startsWith("orders:") || p.startsWith("products:"));
}

export function canAccessAdmin(user: {
  role?: string;
  permissions?: string[];
} | null): boolean {
  return isAdminUser(user);
}

function hasPermission(user: { permissions?: string[] } | null, permission: string): boolean {
  if (!user) return false;
  const permissions = user.permissions ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}

function hasPermissionPrefix(
  user: { permissions?: string[] } | null,
  prefix: string,
): boolean {
  if (!user) return false;
  const permissions = user.permissions ?? [];
  return permissions.includes("*") || permissions.some((permission) => permission.startsWith(prefix));
}

export type AdminRouteKey =
  | "dashboard"
  | "orders"
  | "products"
  | "inventory"
  | "customers"
  | "returns"
  | "mutations"
  | "reliability"
  | "queues"
  | "settings"
  | "security";

export function canViewAdminRoute(
  user: { role?: string; permissions?: string[] } | null,
  route: AdminRouteKey,
): boolean {
  if (user?.role === "ADMIN") {
    return true;
  }

  switch (route) {
    case "dashboard":
      return (
        hasPermissionPrefix(user, "orders:") ||
        hasPermissionPrefix(user, "products:") ||
        hasPermissionPrefix(user, "inventory:") ||
        hasPermissionPrefix(user, "users:") ||
        hasPermissionPrefix(user, "settings:")
      );
    case "orders":
    case "returns":
    case "mutations":
    case "reliability":
    case "queues":
      return hasPermissionPrefix(user, "orders:");
    case "products":
      return hasPermissionPrefix(user, "products:");
    case "inventory":
      return hasPermissionPrefix(user, "inventory:");
    case "customers":
      return hasPermissionPrefix(user, "users:");
    case "settings":
      return (
        hasPermissionPrefix(user, "settings:") ||
        hasPermission(user, ADMIN_PERMISSIONS.settingsRead)
      );
    case "security":
      return (
        hasPermission(user, ADMIN_PERMISSIONS.usersRead) ||
        hasPermissionPrefix(user, "users:")
      );
    default:
      return false;
  }
}

export function resolveAdminRouteFromPathname(pathname: string): AdminRouteKey | null {
  if (pathname === "/admin" || pathname === "/admin/") {
    return "dashboard";
  }
  if (pathname.startsWith("/admin/orders")) {
    return "orders";
  }
  if (pathname.startsWith("/admin/catalog-write") || pathname.startsWith("/admin/products")) {
    return "products";
  }
  if (pathname.startsWith("/admin/inventory")) {
    return "inventory";
  }
  if (pathname.startsWith("/admin/customers")) {
    return "customers";
  }
  if (pathname.startsWith("/admin/returns")) {
    return "returns";
  }
  if (pathname.startsWith("/admin/mutations")) {
    return "mutations";
  }
  if (pathname.startsWith("/admin/reliability")) {
    return "reliability";
  }
  if (pathname.startsWith("/admin/queues")) {
    return "queues";
  }
  if (pathname.startsWith("/admin/settings")) {
    return "settings";
  }
  if (pathname.startsWith("/admin/security")) {
    return "security";
  }
  return null;
}

export function canViewAdminPath(
  user: { role?: string; permissions?: string[] } | null,
  pathname: string,
): boolean {
  const route = resolveAdminRouteFromPathname(pathname);
  if (!route) {
    return canAccessAdmin(user);
  }
  return canViewAdminRoute(user, route);
}
