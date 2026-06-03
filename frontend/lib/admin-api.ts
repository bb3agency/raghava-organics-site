/** Admin API response shapes — aligned with backend route schemas. */

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: PaginationMeta;
}

/** Coerce unknown API values to arrays (prevents `.filter is not a function`). */
export function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

/** Payloads that expose a list under `items` (paginated or not). */
export type AdminItemsPayload<T> =
  | PaginatedResponse<T>
  | FlatPaginatedResponse<T>
  | T[]
  | { items?: T[] | unknown }
  | null
  | undefined;

/** Unwrap admin list endpoints that return `{ items, meta }` (or a bare array). */
export function getPaginatedItems<T>(response: AdminItemsPayload<T>): T[] {
  if (response == null) {
    return [];
  }
  if (Array.isArray(response)) {
    return response;
  }
  if (typeof response === "object") {
    const items = (response as PaginatedResponse<T>).items;
    return Array.isArray(items) ? items : [];
  }
  return [];
}

/** Read `items` from paginated list state (null-safe). */
export function readPaginatedItems<T>(data: AdminItemsPayload<T>): T[] {
  if (!data) {
    return [];
  }
  return getPaginatedItems(data);
}

const EMPTY_META: PaginationMeta = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
};

/** Normalize any admin list payload into `{ items, meta }` for hooks and tables. */
export function coercePaginatedResponse<T>(
  response: PaginatedResponse<T> | FlatPaginatedResponse<T> | T[] | unknown,
): PaginatedResponse<T> {
  const items = getPaginatedItems(
    response as PaginatedResponse<T> | FlatPaginatedResponse<T> | T[] | null | undefined,
  );

  if (response && typeof response === "object") {
    if ("meta" in response && response.meta && typeof response.meta === "object") {
      return { items, meta: response.meta as PaginationMeta };
    }
    if ("page" in response && "limit" in response && "total" in response) {
      return {
        items,
        meta: normalizePagination(response as FlatPaginatedResponse<unknown>),
      };
    }
  }

  return {
    items,
    meta: {
      ...EMPTY_META,
      limit: Math.max(items.length, 1),
      total: items.length,
      totalPages: items.length > 0 ? 1 : 0,
    },
  };
}

/** Return-requests list uses flat pagination fields instead of meta. */
export interface FlatPaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export function normalizePagination(
  response: PaginatedResponse<unknown> | FlatPaginatedResponse<unknown>,
): PaginationMeta {
  if ("meta" in response && response.meta) {
    return response.meta;
  }
  const flat = response as FlatPaginatedResponse<unknown>;
  const totalPages =
    flat.limit > 0 ? Math.ceil(flat.total / flat.limit) : 0;
  return {
    page: flat.page,
    limit: flat.limit,
    total: flat.total,
    totalPages,
  };
}

export interface AdminOrderListItem {
  id: string;
  orderNumber: string;
  userId: string;
  status: string;
  paymentMode: string;
  subtotal: number;
  shippingCharge: number;
  discountAmount: number;
  total: number;
  createdAt: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  awbNumber: string | null;
  labelUrl: string | null;
  shipmentStatus: string | null;
  canShipNow: boolean;
  shipBlockReason: string | null;
  shippingMode: string;
}

export interface AdminPaymentListItem {
  id: string;
  orderId: string;
  orderNumber: string;
  provider: string;
  method: string | null;
  status: string;
  amount: number;
  currency: string;
  providerPaymentId: string | null;
  providerOrderId: string;
  capturedAt: string | null;
  refundPendingAmountPaise: number;
  refundedAmountPaise: number;
  createdAt: string;
  updatedAt: string;
}

export type OrderBoardColumnKey =
  | "CONFIRMED"
  | "PROCESSING"
  | "SHIPPED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

export interface AdminBoardOrderItem {
  id: string;
  orderNumber: string;
  status: string;
  paymentMode: string;
  total: number;
  createdAt: string;
  customerName: string;
  customerPhone: string | null;
  awbNumber: string | null;
  labelUrl: string | null;
  shipmentStatus: string | null;
  canShipNow: boolean;
  shipBlockReason: string | null;
  shippingMode: string;
}

export interface AdminOrderBoard {
  columns: Record<OrderBoardColumnKey, AdminBoardOrderItem[]>;
}

export const ORDER_BOARD_COLUMNS: OrderBoardColumnKey[] = [
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
];

export const ORDER_FILTER_STATUSES = [
  "PENDING_PAYMENT",
  "PAYMENT_FAILED",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
] as const;

export const PAYMENT_FILTER_STATUSES = [
  "CREATED",
  "CAPTURED",
  "FAILED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
] as const;

export const SHIPMENT_FILTER_STATUSES = [
  "PENDING",
  "BOOKED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED_DELIVERY",
  "RTO_INITIATED",
  "RTO_DELIVERED",
  "CANCELLED",
] as const;

export type DashboardKpiPeriod = "today" | "7d" | "30d" | "custom";

export const DASHBOARD_KPI_PERIODS: DashboardKpiPeriod[] = ["today", "7d", "30d", "custom"];

export interface AdminOrderShippingAddress {
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
}

export interface AdminOrderLineItem {
  id: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface AdminOrderDetailFull {
  id: string;
  orderNumber: string;
  userId: string;
  status: string;
  paymentMode: "PREPAID" | "COD";
  shippingAddress: AdminOrderShippingAddress;
  subtotal: number;
  shippingCharge: number;
  discountAmount: number;
  total: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: AdminOrderLineItem[];
  canShipNow: boolean;
  shipBlockReason: string | null;
  shippingMode: string;
  customer: { name: string; email: string | null; phone: string | null };
  payment: {
    id: string;
    provider: string;
    providerOrderId: string;
    providerPaymentId: string | null;
    amount: number;
    status: string;
    method: string | null;
    capturedAt: string | null;
    refundPendingAmountPaise: number;
    refundedAmountPaise: number;
  } | null;
  shipment: {
    id: string;
    provider: string;
    status: string;
    awb: string | null;
    trackingUrl: string | null;
    labelUrl?: string | null;
    shipmentLabelUrl?: string | null;
    pickupScheduledDate?: string | null;
    events: Array<{
      id: string;
      status: string;
      location: string | null;
      description: string;
      occurredAt: string;
    }>;
  } | null;
  invoice: {
    invoiceNumber: string;
    hasPdf: boolean;
    issuedAt: string;
  } | null;
}

export interface AdminOrderTimeline {
  orderId: string;
  orderNumber: string;
  currentStatus: string;
  timeline: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    triggeredBy?: string | null;
    note: string | null;
    createdAt: string;
  }>;
}

export interface AdminReturnRequestListItem {
  id: string;
  orderId: string;
  orderNumber: string;
  userId: string;
  customerEmail: string;
  customerName: string;
  status: string;
  reason: string;
  createdAt: string;
}

export interface AdminReturnRequestItem {
  orderItemId: string;
  quantity: number;
  reason?: string;
}

export interface AdminReturnRequestDetail extends AdminReturnRequestListItem {
  adminNote: string | null;
  items: AdminReturnRequestItem[];
  updatedAt: string;
}

export interface AdminProductVariant {
  id: string;
  name: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  isActive: boolean;
}

export interface AdminProductImage {
  id: string;
  url: string;
  altText: string;
  sortOrder: number;
}

export interface AdminProductListItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  tags: string[];
  isFeatured: boolean;
  category: { id: string; name: string; slug: string };
  images: AdminProductImage[];
  variants: AdminProductVariant[];
}

export type AdminProductDetail = AdminProductListItem;

export interface AdminCreateProductInput {
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  tags?: string[];
  isFeatured?: boolean;
  isActive?: boolean;
  images?: Array<{ url: string; altText: string; sortOrder: number }>;
  variants?: Array<{
    sku: string;
    name: string;
    price: number;
    compareAtPrice?: number;
    isActive?: boolean;
    quantity?: number;
    lowStockThreshold?: number;
  }>;
}

export interface AdminUpdateProductInput {
  name?: string;
  slug?: string;
  description?: string;
  categoryId?: string;
  tags?: string[];
  isFeatured?: boolean;
  isActive?: boolean;
}

export interface AdminCreateCategoryInput {
  name: string;
  slug: string;
  parentId?: string;
  imageUrl?: string;
  isActive?: boolean;
}

export interface AdminUpdateCategoryInput {
  name?: string;
  slug?: string;
  parentId?: string | null;
  imageUrl?: string;
  isActive?: boolean;
}

export interface AdminProductImportResult {
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  errors: Array<{ line: number; message: string }>;
}

export interface AdminCategoryListItem {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

export interface AdminUserListItem {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string;
  lastName: string;
  isVerified: boolean;
  totalOrders: number;
  totalSpendPaise: number;
  createdAt: string;
}

export interface AdminCustomerAddress {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

export interface AdminCustomerOrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: number;
  shippingCharge: number;
  discountAmount: number;
  total: number;
  createdAt: string;
  shipmentStatus?: string | null;
  awb?: string | null;
}

export interface AdminCustomerProfile {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string;
  lastName: string;
  isVerified: boolean;
  createdAt: string;
  addresses: AdminCustomerAddress[];
  orders: AdminCustomerOrderSummary[];
}

export interface AdminUserNote {
  id: string;
  userId: string;
  content: string;
  createdByAdminId: string;
  createdAt: string;
}

export interface AdminReviewListItem {
  id: string;
  userId: string;
  productId: string;
  orderId: string;
  rating: number;
  body: string | null;
  images: string[];
  approved: boolean;
  createdAt: string;
  updatedAt: string;
  author: { firstName: string; lastName: string };
}

export interface AdminCouponListItem {
  id: string;
  code: string;
  type: string;
  value: number;
  minOrderPaise: number;
  maxUsesTotal: number | null;
  maxUsesPerUser: number | null;
  usesCount: number;
  isActive: boolean;
  validFrom: string;
  validUntil: string | null;
  status: "active" | "expired" | "paused" | "deleted";
  createdAt: string;
  updatedAt: string;
}

export interface AdminCreateCouponInput {
  code: string;
  type: "PERCENTAGE_OFF" | "FLAT_AMOUNT_OFF" | "FREE_SHIPPING";
  value: number;
  validFrom: string;
  minOrderPaise?: number;
  maxUsesTotal?: number;
  maxUsesPerUser?: number | null;
  validUntil?: string;
  isActive?: boolean;
}

export interface AdminUpdateCouponInput {
  code?: string;
  type?: "PERCENTAGE_OFF" | "FLAT_AMOUNT_OFF" | "FREE_SHIPPING";
  value?: number;
  minOrderPaise?: number;
  maxUsesTotal?: number;
  maxUsesPerUser?: number | null;
  validFrom?: string;
  validUntil?: string | null;
  isActive?: boolean;
}

export interface AdminCouponAnalyticsItem {
  couponId: string;
  code: string;
  usesCount: number;
  totalDiscountPaise: number;
}

export interface AdminCouponAuditEntry {
  id: string;
  action: string;
  actorId: string;
  actorName: string;
  actorType: string;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  createdAt: string;
}

export interface AdminPaymentDetail {
  id: string;
  orderId: string;
  orderNumber: string;
  provider: string;
  method: string | null;
  status: string;
  amount: number;
  currency: string;
  providerPaymentId: string | null;
  providerOrderId: string | null;
  capturedAt: string | null;
  refundPendingAmountPaise: number | null;
  refundedAmountPaise: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminShipmentDetail {
  id: string;
  orderId: string;
  orderNumber: string;
  userId: string;
  provider: string;
  status: string;
  awbNumber: string | null;
  trackingUrl: string | null;
  shiprocketShipmentId: string | null;
  labelUrl: string | null;
  pickupScheduledDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminBulkInventoryResult {
  updated: number;
  failed: string[];
}

export interface AdminInventoryAlertItem {
  variantId: string;
  sku: string;
  variantName: string;
  quantity: number;
  lowStockThreshold: number;
  productName: string;
  occurredAt: string;
}

export interface AdminNotificationDeliveryStats {
  channels: Array<{
    channel: string;
    total: number;
    sent: number;
    failed: number;
    deliveryRatePercent: number;
  }>;
}

export interface AdminNotificationSettings {
  emailEnabled: boolean;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  primaryChannels: Record<string, "EMAIL" | "SMS" | "WHATSAPP">;
  smsTemplates: Record<string, string>;
}

export interface AdminShipmentListItem {
  id: string;
  orderId: string;
  orderNumber: string;
  provider: string;
  status: string;
  awbNumber: string | null;
  trackingUrl: string | null;
  shiprocketShipmentId?: string | null;
  labelUrl: string | null;
  pickupScheduledDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminInventoryVariant {
  id: string;
  name: string;
  sku: string;
  product: { id: string; name: string; slug: string };
}

export interface AdminInventoryListItem {
  id: string;
  variantId: string;
  quantity: number;
  reservedQuantity?: number;
  availableQuantity?: number;
  lowStockThreshold: number;
  lowStockAlerted: boolean;
  variant: AdminInventoryVariant;
}

export interface AdminInventoryHistoryItem {
  id: string;
  delta: number;
  quantityAfter: number;
  reason: string | null;
  adminUserId: string | null;
  createdAt: string;
}

export interface AdminInventoryHistoryResponse {
  variantId: string;
  total: number;
  page: number;
  limit: number;
  items: AdminInventoryHistoryItem[];
}

export interface AdminDashboardKpis {
  period: string;
  from: string;
  to: string;
  ordersCount: number;
  revenuePaise: number;
  averageOrderValuePaise: number;
  customersCount: number;
}

export interface AdminSalesChartPoint {
  bucket: string;
  ordersCount: number;
  revenuePaise: number;
}

export interface AdminSalesChart {
  granularity: string;
  points: AdminSalesChartPoint[];
}

export interface AdminTopProductItem {
  variantId: string;
  productName: string;
  variantName: string;
  quantitySold: number;
  revenuePaise: number;
}

export interface AdminTopProducts {
  items: AdminTopProductItem[];
}

export interface AdminAnalyticsRevenue {
  granularity: string;
  points: AdminSalesChartPoint[];
}

export interface AdminAnalyticsFunnel {
  steps: Array<{
    eventType: string;
    count: number;
    conversionRatePercent: number;
  }>;
}

export interface AdminAnalyticsCategoryBreakdown {
  items: Array<{
    categoryId: string;
    categoryName: string;
    revenuePaise: number;
    sharePercent: number;
  }>;
}

export interface AdminReconciliationIssue {
  id: string;
  issueType: string;
  aggregateRef: string;
  isResolved: boolean;
  severity: string;
  classification: string;
  ageSeconds: number;
  resolutionAction: string;
  detectedAt: string;
  resolvedAt?: string;
}

export interface AdminShippingSettings {
  pickupPincode: string;
  minOrderValuePaise: number;
  source: 'database' | 'environment' | 'default';
}

export interface AdminStoreProfile {
  storeName: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  gstin: string | null;
  fssaiNumber: string | null;
}

export interface AdminInventorySettings {
  defaultLowStockThreshold: number;
}

export function buildAdminQuery(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/** Convert YYYY-MM-DD date input to ISO range for admin export/analytics. */
export function toIsoDateRange(date: string, endOfDay = false): string {
  if (!date) return "";
  return endOfDay ? `${date}T23:59:59.999Z` : `${date}T00:00:00.000Z`;
}

export function buildOrdersExportQuery(params: {
  from: string;
  to: string;
  status?: string;
  search?: string;
}): string {
  return buildAdminQuery({
    from: toIsoDateRange(params.from, false),
    to: toIsoDateRange(params.to, true),
    status: params.status,
    search: params.search,
  });
}
