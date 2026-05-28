import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Box,
  ClipboardList,
  LayoutDashboard,
  Percent,
  RefreshCcw,
  Settings,
  ShieldAlert,
  ShoppingCart,
  Star,
  Truck,
  Users,
  Wallet,
  Layers
} from "lucide-react";
import type { AdminRouteKey } from "@/lib/permissions";

export interface AdminNavItem {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  routeKey: AdminRouteKey;
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    href: "/admin",
    label: "Dashboard",
    description: "Overview and core metrics",
    icon: LayoutDashboard,
    routeKey: "dashboard",
  },
  {
    href: "/admin/orders",
    label: "Orders",
    description: "Manage and process orders",
    icon: ShoppingCart,
    routeKey: "orders",
  },
  {
    href: "/admin/shipments",
    label: "Shipments",
    description: "Fulfillment and tracking",
    icon: Truck,
    routeKey: "shipments",
  },
  {
    href: "/admin/payments",
    label: "Payments",
    description: "Refunds and payment states",
    icon: Wallet,
    routeKey: "payments",
  },
  {
    href: "/admin/returns",
    label: "Returns",
    description: "Customer return requests",
    icon: RefreshCcw,
    routeKey: "returns",
  },
  {
    href: "/admin/products",
    label: "Products",
    description: "Catalog and variants",
    icon: Box,
    routeKey: "products",
  },
  {
    href: "/admin/inventory",
    label: "Inventory",
    description: "Stock levels and alerts",
    icon: ClipboardList,
    routeKey: "inventory",
  },
  {
    href: "/admin/customers",
    label: "Customers",
    description: "User accounts and addresses",
    icon: Users,
    routeKey: "customers",
  },
  {
    href: "/admin/reviews",
    label: "Reviews",
    description: "Moderate product reviews",
    icon: Star,
    routeKey: "reviews",
  },
  {
    href: "/admin/coupons",
    label: "Coupons",
    description: "Discounts and campaigns",
    icon: Percent,
    routeKey: "coupons",
  },
  {
    href: "/admin/analytics",
    label: "Analytics",
    description: "Deep dive reporting",
    icon: BarChart3,
    routeKey: "dashboard", // Tied to dashboard for now
  },
  {
    href: "/admin/mutations",
    label: "Mutations Data",
    description: "Direct backend actions",
    icon: Layers,
    routeKey: "mutations",
  },
  {
    href: "/admin/reliability",
    label: "Reliability",
    description: "System health tools",
    icon: ShieldAlert,
    routeKey: "reliability",
  },
  {
    href: "/admin/settings",
    label: "Settings",
    description: "Store profile and config",
    icon: Settings,
    routeKey: "settings",
  },
];

export function isAdminNavActive(pathname: string, href: string): boolean {
  if (href === "/admin") {
    return pathname === "/admin";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
