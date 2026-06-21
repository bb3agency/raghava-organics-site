/**
 * content.ts — per-client COPY / CONTENT (design layer, excluded from core sync).
 *
 * `lib/constants.ts` holds brand IDENTITY (name, logo, storage prefix); THIS file
 * holds client-specific PROSE (taglines, blurbs, product-attribute defaults). Core
 * components import from here so they stay content-agnostic. (Guide §1.1.)
 */
export const STORE_TAGLINE =
  "Farm-fresh chemical-free produce. Lab-tested. Delivered to your door.";
export const STORE_TAGLINE_SHORT = "Farm-fresh chemical-free produce";
export const HEADER_PROMO = "Shop fresh chemical-free produce today!";
export const CART_EMPTY_BLURB =
  "Add some fresh, chemical-free products to your cart and come back here to complete your order.";

/** Product-detail attribute defaults (shown when a product has no explicit value). */
export const PRODUCT_ORIGIN_DEFAULT = "Telangana, India";
export const PRODUCT_CERTIFICATION_DEFAULT = "Chemical-free, Lab-tested";

/** Homepage SEO description. */
export const HOME_META_DESCRIPTION =
  "Native-seed fruits, vegetables, and traditional spices from 120+ partner farmers across Telangana. Lab-tested for 300+ pesticide residues. Delivered within 48 hours.";
