export interface CartLineItem {
  id: string;
  variantId: string;
  lineTotal: number;
  priceSnapshot: number;
  quantity: number;
  variant: {
    id: string;
    name: string;
    sku: string;
    price: number;
  };
}

export interface Cart {
  id: string;
  items: CartLineItem[];
  subtotal: number;
  discountAmount: number;
  total: number;
  coupon: {
    id: string;
    code: string;
    type: "PERCENTAGE_OFF" | "FLAT_AMOUNT_OFF" | "FREE_SHIPPING" | "BUY_X_GET_Y";
    value: number;
  } | null;
  meta: {
    isGuest: boolean;
    reservationExpiresAt: string | null;
    reservedItemCount: number;
  };
}

export interface DeliveryRates {
  pincode: string;
  shippingCharge: number;
  estimatedDays: number;
  availableCouriers?: Array<{
    courierCompanyId: number;
    courierName: string;
    shippingChargePaise: number;
    estimatedDays: number;
  }>;
}
