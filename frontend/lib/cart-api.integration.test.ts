import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import {
  addCartItem,
  checkPincodeServiceability,
  getCart,
  getDeliveryRates,
} from "@/lib/cart-api";

describe("cart api integration", () => {
  it("loads guest cart with expected shape", async () => {
    const cart = await getCart();
    expect(typeof cart.id).toBe("string");
    expect(Array.isArray(cart.items)).toBe(true);
    expect(typeof cart.total).toBe("number");
    expect(typeof cart.meta.isGuest).toBe("boolean");
  });

  it("returns serviceability payload", async () => {
    const result = await checkPincodeServiceability("560001");
    expect(result.pincode).toBe("560001");
    expect(typeof result.serviceable).toBe("boolean");
  });

  it("handles bad cart mutation with typed ApiError", async () => {
    await expect(
      addCartItem({
        variantId: "non-existent-variant",
        quantity: 1,
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("returns typed error for delivery rates on empty cart", async () => {
    await expect(getDeliveryRates("560001")).rejects.toBeInstanceOf(ApiError);
  });
});
