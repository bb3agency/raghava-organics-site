"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AdminSection } from "@/components/admin/AdminSection";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { useAdminAuth } from "@/contexts/admin-auth-context";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import type {
  AdminCategoryListItem,
  AdminCreateProductInput,
  AdminProductDetail,
  AdminProductImage,
  AdminProductVariant,
} from "@/lib/admin-api";
import { formatPaise } from "@/lib/admin-format";
import { getApiErrorMessage } from "@/lib/error-messages";
import { createIdempotencyKey } from "@/lib/idempotency";
import { ADMIN_PERMISSIONS, hasAdminPermission } from "@/lib/permissions";

const inputClass =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm";
const textareaClass =
  "min-h-[96px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

interface VariantDraft {
  sku: string;
  name: string;
  pricePaise: string;
  compareAtPricePaise: string;
  isActive: boolean;
}

interface ImageDraft {
  url: string;
  altText: string;
  sortOrder: string;
}

function emptyVariant(): VariantDraft {
  return {
    sku: "",
    name: "Default",
    pricePaise: "",
    compareAtPricePaise: "",
    isActive: true,
  };
}

function parsePaiseInput(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.round(parsed);
}

interface AdminProductEditorProps {
  productId?: string;
}

export function AdminProductEditor({ productId }: AdminProductEditorProps) {
  const isCreate = !productId;
  const router = useRouter();
  const api = useAuthenticatedApi();
  const { adminUser } = useAdminAuth();
  const canWrite = hasAdminPermission(adminUser, ADMIN_PERMISSIONS.productsWrite);

  const [loading, setLoading] = useState(!isCreate);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [categories, setCategories] = useState<AdminCategoryListItem[]>([]);
  const [product, setProduct] = useState<AdminProductDetail | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [isFeatured, setIsFeatured] = useState(false);

  const [createVariants, setCreateVariants] = useState<VariantDraft[]>([
    emptyVariant(),
  ]);
  const [createImages, setCreateImages] = useState<ImageDraft[]>([]);

  const [newVariant, setNewVariant] = useState<VariantDraft>(emptyVariant());
  const [newImage, setNewImage] = useState<ImageDraft>({
    url: "",
    altText: "",
    sortOrder: "0",
  });

  const loadCategories = useCallback(async () => {
    const response = await api<AdminCategoryListItem[]>("/admin/categories");
    setCategories(response);
    if (isCreate && response.length > 0 && !categoryId) {
      setCategoryId(response[0].id);
    }
  }, [api, categoryId, isCreate]);

  const loadProduct = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    setError(null);
    try {
      const detail = await api<AdminProductDetail>(`/admin/products/${productId}`);
      setProduct(detail);
      setName(detail.name);
      setSlug(detail.slug);
      setSlugTouched(true);
      setDescription(detail.description);
      setCategoryId(detail.category.id);
      setTagsText(detail.tags.join(", "));
      setIsFeatured(detail.isFeatured);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [api, productId]);

  useEffect(() => {
    void loadCategories().catch((err) => setError(getApiErrorMessage(err)));
  }, [loadCategories]);

  useEffect(() => {
    if (!isCreate) {
      void loadProduct();
    }
  }, [isCreate, loadProduct]);

  useEffect(() => {
    if (isCreate && !slugTouched && name) {
      setSlug(slugify(name));
    }
  }, [isCreate, name, slugTouched]);

  async function saveCoreFields() {
    if (!canWrite) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    const tags = tagsText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    try {
      if (isCreate) {
        const variants = createVariants
          .map((variant) => {
            const price = parsePaiseInput(variant.pricePaise);
            if (!variant.sku.trim() || !variant.name.trim() || price === undefined) {
              return null;
            }
            const compareAtPrice = parsePaiseInput(variant.compareAtPricePaise);
            return {
              sku: variant.sku.trim(),
              name: variant.name.trim(),
              price,
              ...(compareAtPrice !== undefined ? { compareAtPrice } : {}),
              isActive: variant.isActive,
            };
          })
          .filter((variant): variant is NonNullable<typeof variant> => variant !== null);

        if (variants.length === 0) {
          setError("Add at least one variant with SKU, name, and price (paise).");
          return;
        }

        const images = createImages
          .map((image, index) => {
            if (!image.url.trim()) return null;
            const sortOrder = Number(image.sortOrder);
            return {
              url: image.url.trim(),
              altText: image.altText.trim() || name.trim(),
              sortOrder: Number.isFinite(sortOrder) ? sortOrder : index,
            };
          })
          .filter((image): image is NonNullable<typeof image> => image !== null);

        const payload: AdminCreateProductInput = {
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim(),
          categoryId,
          tags,
          isFeatured,
          variants,
          ...(images.length > 0 ? { images } : {}),
        };

        const created = await api<AdminProductDetail>("/admin/products", {
          method: "POST",
          idempotencyKey: createIdempotencyKey(),
          body: JSON.stringify(payload),
        });
        router.push(`/admin/products/${created.id}`);
        return;
      }

      if (!productId) return;
      const updated = await api<AdminProductDetail>(`/admin/products/${productId}`, {
        method: "PATCH",
        idempotencyKey: createIdempotencyKey(),
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim(),
          categoryId,
          tags,
          isFeatured,
        }),
      });
      setProduct(updated);
      setSuccess("Product saved.");
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct() {
    if (!canWrite || !productId) return;
    if (!window.confirm("Delete this product? It will be hidden from the storefront.")) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(`/admin/products/${productId}`, {
        method: "DELETE",
        idempotencyKey: createIdempotencyKey(),
      });
      router.push("/admin/products");
    } catch (err) {
      setError(getApiErrorMessage(err));
      setSaving(false);
    }
  }

  async function saveVariant(variant: AdminProductVariant, draft: VariantDraft) {
    if (!canWrite || !productId) return;
    const price = parsePaiseInput(draft.pricePaise);
    if (price === undefined) {
      setError("Variant price must be a non-negative number (paise).");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const compareAtPrice = parsePaiseInput(draft.compareAtPricePaise);
      await api(`/admin/products/${productId}/variants/${variant.id}`, {
        method: "PATCH",
        idempotencyKey: createIdempotencyKey(),
        body: JSON.stringify({
          sku: draft.sku.trim(),
          name: draft.name.trim(),
          price,
          compareAtPrice: compareAtPrice ?? null,
          isActive: draft.isActive,
        }),
      });
      await loadProduct();
      setSuccess("Variant updated.");
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function addVariant() {
    if (!canWrite || !productId) return;
    const price = parsePaiseInput(newVariant.pricePaise);
    if (!newVariant.sku.trim() || !newVariant.name.trim() || price === undefined) {
      setError("New variant requires SKU, name, and price (paise).");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const compareAtPrice = parsePaiseInput(newVariant.compareAtPricePaise);
      await api(`/admin/products/${productId}/variants`, {
        method: "POST",
        idempotencyKey: createIdempotencyKey(),
        body: JSON.stringify({
          sku: newVariant.sku.trim(),
          name: newVariant.name.trim(),
          price,
          ...(compareAtPrice !== undefined ? { compareAtPrice } : {}),
          isActive: newVariant.isActive,
        }),
      });
      setNewVariant(emptyVariant());
      await loadProduct();
      setSuccess("Variant added.");
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function removeVariant(variantId: string) {
    if (!canWrite || !productId || !product) return;
    if (product.variants.length <= 1) {
      setError("Cannot delete the last variant of a product.");
      return;
    }
    if (!window.confirm("Delete this variant?")) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/admin/products/${productId}/variants/${variantId}`, {
        method: "DELETE",
        idempotencyKey: createIdempotencyKey(),
      });
      await loadProduct();
      setSuccess("Variant deleted.");
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function addImage() {
    if (!canWrite || !productId) return;
    if (!newImage.url.trim().startsWith("https://")) {
      setError("Image URL must start with https://");
      return;
    }
    const sortOrder = Number(newImage.sortOrder);
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api(`/admin/products/${productId}/images`, {
        method: "POST",
        idempotencyKey: createIdempotencyKey(),
        body: JSON.stringify({
          url: newImage.url.trim(),
          altText: newImage.altText.trim() || name.trim(),
          sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
        }),
      });
      setNewImage({ url: "", altText: "", sortOrder: "0" });
      await loadProduct();
      setSuccess("Image added.");
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function removeImage(imageId: string) {
    if (!canWrite || !productId) return;
    if (!window.confirm("Remove this image?")) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/admin/products/${productId}/images/${imageId}`, {
        method: "DELETE",
        idempotencyKey: createIdempotencyKey(),
      });
      await loadProduct();
      setSuccess("Image removed.");
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function moveImage(image: AdminProductImage, direction: -1 | 1) {
    if (!canWrite || !productId || !product) return;
    const sorted = [...product.images].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = sorted.findIndex((item) => item.id === image.id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= sorted.length) return;

    const reordered = [...sorted];
    const [removed] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, removed);
    const payload = reordered.map((item, order) => ({ id: item.id, sortOrder: order }));

    setSaving(true);
    setError(null);
    try {
      await api(`/admin/products/${productId}/images/reorder`, {
        method: "PATCH",
        idempotencyKey: createIdempotencyKey(),
        body: JSON.stringify({ images: payload }),
      });
      await loadProduct();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/products"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Products
        </Link>
        {product ? (
          <AdminStatusBadge
            label={product.isFeatured ? "Featured" : "Standard"}
            tone={product.isFeatured ? "success" : "default"}
          />
        ) : null}
      </div>

      <AdminSection
        title={isCreate ? "New product" : "Edit product"}
        description={
          isCreate
            ? "Create a catalog product with variants and optional images."
            : product
              ? `${product.slug} · ${product.category.name}`
              : "Loading product…"
        }
        loading={loading}
        error={error}
        actions={
          canWrite ? (
            <>
              {!isCreate ? (
                <button
                  type="button"
                  onClick={() => void deleteProduct()}
                  disabled={saving}
                  className="h-9 rounded-md border border-destructive px-3 text-sm text-destructive disabled:opacity-60"
                >
                  Delete
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void saveCoreFields()}
                disabled={saving || loading}
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {saving ? "Saving…" : isCreate ? "Create product" : "Save product"}
              </button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Read-only</span>
          )
        }
      >
        {!loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              Name
              <input
                className={inputClass}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={!canWrite}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Slug
              <input
                className={inputClass}
                value={slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(event.target.value);
                }}
                disabled={!canWrite}
              />
            </label>
            <label className="grid gap-1 text-sm md:col-span-2">
              Description
              <textarea
                className={textareaClass}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={!canWrite}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Category
              <select
                className={inputClass}
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                disabled={!canWrite}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Tags (comma-separated)
              <input
                className={inputClass}
                value={tagsText}
                onChange={(event) => setTagsText(event.target.value)}
                disabled={!canWrite}
                placeholder="organic, bestseller"
              />
            </label>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(event) => setIsFeatured(event.target.checked)}
                disabled={!canWrite}
              />
              Featured product
            </label>
          </div>
        ) : null}
        {success ? (
          <p className="mt-3 text-sm text-emerald-600">{success}</p>
        ) : null}
      </AdminSection>

      {isCreate ? (
        <>
          <AdminSection title="Variants" description="At least one variant is required.">
            <div className="grid gap-3">
              {createVariants.map((variant, index) => (
                <div
                  key={index}
                  className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-5"
                >
                  <input
                    className={inputClass}
                    placeholder="SKU"
                    value={variant.sku}
                    onChange={(event) => {
                      const next = [...createVariants];
                      next[index] = { ...variant, sku: event.target.value };
                      setCreateVariants(next);
                    }}
                    disabled={!canWrite}
                  />
                  <input
                    className={inputClass}
                    placeholder="Name"
                    value={variant.name}
                    onChange={(event) => {
                      const next = [...createVariants];
                      next[index] = { ...variant, name: event.target.value };
                      setCreateVariants(next);
                    }}
                    disabled={!canWrite}
                  />
                  <input
                    className={inputClass}
                    placeholder="Price (paise)"
                    value={variant.pricePaise}
                    onChange={(event) => {
                      const next = [...createVariants];
                      next[index] = { ...variant, pricePaise: event.target.value };
                      setCreateVariants(next);
                    }}
                    disabled={!canWrite}
                  />
                  <input
                    className={inputClass}
                    placeholder="Compare-at (paise)"
                    value={variant.compareAtPricePaise}
                    onChange={(event) => {
                      const next = [...createVariants];
                      next[index] = {
                        ...variant,
                        compareAtPricePaise: event.target.value,
                      };
                      setCreateVariants(next);
                    }}
                    disabled={!canWrite}
                  />
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={variant.isActive}
                        onChange={(event) => {
                          const next = [...createVariants];
                          next[index] = { ...variant, isActive: event.target.checked };
                          setCreateVariants(next);
                        }}
                        disabled={!canWrite}
                      />
                      Active
                    </label>
                    {createVariants.length > 1 && canWrite ? (
                      <button
                        type="button"
                        className="text-xs text-destructive"
                        onClick={() =>
                          setCreateVariants(createVariants.filter((_, i) => i !== index))
                        }
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
              {canWrite ? (
                <button
                  type="button"
                  className="justify-self-start text-sm text-primary"
                  onClick={() => setCreateVariants([...createVariants, emptyVariant()])}
                >
                  + Add variant
                </button>
              ) : null}
            </div>
          </AdminSection>

          <AdminSection title="Images (optional)" description="HTTPS URLs only.">
            <div className="grid gap-3">
              {createImages.map((image, index) => (
                <div
                  key={index}
                  className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-4"
                >
                  <input
                    className={`${inputClass} md:col-span-2`}
                    placeholder="https://…"
                    value={image.url}
                    onChange={(event) => {
                      const next = [...createImages];
                      next[index] = { ...image, url: event.target.value };
                      setCreateImages(next);
                    }}
                    disabled={!canWrite}
                  />
                  <input
                    className={inputClass}
                    placeholder="Alt text"
                    value={image.altText}
                    onChange={(event) => {
                      const next = [...createImages];
                      next[index] = { ...image, altText: event.target.value };
                      setCreateImages(next);
                    }}
                    disabled={!canWrite}
                  />
                  <div className="flex items-center gap-2">
                    <input
                      className={inputClass}
                      placeholder="Sort"
                      value={image.sortOrder}
                      onChange={(event) => {
                        const next = [...createImages];
                        next[index] = { ...image, sortOrder: event.target.value };
                        setCreateImages(next);
                      }}
                      disabled={!canWrite}
                    />
                    {canWrite ? (
                      <button
                        type="button"
                        className="text-xs text-destructive"
                        onClick={() =>
                          setCreateImages(createImages.filter((_, i) => i !== index))
                        }
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
              {canWrite ? (
                <button
                  type="button"
                  className="justify-self-start text-sm text-primary"
                  onClick={() =>
                    setCreateImages([
                      ...createImages,
                      { url: "", altText: "", sortOrder: String(createImages.length) },
                    ])
                  }
                >
                  + Add image
                </button>
              ) : null}
            </div>
          </AdminSection>
        </>
      ) : product ? (
        <>
          <AdminSection title="Variants" description="Manage SKUs and pricing.">
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Price</th>
                    <th className="px-3 py-2 font-medium">Compare-at</th>
                    <th className="px-3 py-2 font-medium">Active</th>
                    <th className="px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {product.variants.map((variant) => (
                    <VariantEditRow
                      key={variant.id}
                      variant={variant}
                      canWrite={canWrite}
                      saving={saving}
                      onSave={(draft) => void saveVariant(variant, draft)}
                      onDelete={() => void removeVariant(variant.id)}
                      canDelete={product.variants.length > 1}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {canWrite ? (
              <div className="mt-4 grid gap-2 rounded-md border border-dashed border-border p-3 md:grid-cols-5">
                <input
                  className={inputClass}
                  placeholder="New SKU"
                  value={newVariant.sku}
                  onChange={(event) =>
                    setNewVariant({ ...newVariant, sku: event.target.value })
                  }
                />
                <input
                  className={inputClass}
                  placeholder="Name"
                  value={newVariant.name}
                  onChange={(event) =>
                    setNewVariant({ ...newVariant, name: event.target.value })
                  }
                />
                <input
                  className={inputClass}
                  placeholder="Price (paise)"
                  value={newVariant.pricePaise}
                  onChange={(event) =>
                    setNewVariant({ ...newVariant, pricePaise: event.target.value })
                  }
                />
                <input
                  className={inputClass}
                  placeholder="Compare-at"
                  value={newVariant.compareAtPricePaise}
                  onChange={(event) =>
                    setNewVariant({
                      ...newVariant,
                      compareAtPricePaise: event.target.value,
                    })
                  }
                />
                <button
                  type="button"
                  className="h-10 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-60"
                  disabled={saving}
                  onClick={() => void addVariant()}
                >
                  Add variant
                </button>
              </div>
            ) : null}
          </AdminSection>

          <AdminSection title="Images" description="Reorder or remove product images.">
            <div className="grid gap-2">
              {[...product.images]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((image) => (
                  <div
                    key={image.id}
                    className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3"
                  >
                    <Image
                      src={image.url}
                      alt={image.altText}
                      width={48}
                      height={48}
                      className="rounded object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{image.altText}</p>
                      <p className="truncate text-xs text-muted-foreground">{image.url}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">#{image.sortOrder}</span>
                    {canWrite ? (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="rounded border border-border px-2 py-1 text-xs"
                          onClick={() => void moveImage(image, -1)}
                          disabled={saving}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="rounded border border-border px-2 py-1 text-xs"
                          onClick={() => void moveImage(image, 1)}
                          disabled={saving}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="rounded border border-destructive px-2 py-1 text-xs text-destructive"
                          onClick={() => void removeImage(image.id)}
                          disabled={saving}
                        >
                          Remove
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
            </div>
            {canWrite ? (
              <div className="mt-4 grid gap-2 md:grid-cols-4">
                <input
                  className={`${inputClass} md:col-span-2`}
                  placeholder="https://…"
                  value={newImage.url}
                  onChange={(event) =>
                    setNewImage({ ...newImage, url: event.target.value })
                  }
                />
                <input
                  className={inputClass}
                  placeholder="Alt text"
                  value={newImage.altText}
                  onChange={(event) =>
                    setNewImage({ ...newImage, altText: event.target.value })
                  }
                />
                <button
                  type="button"
                  className="h-10 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-60"
                  disabled={saving}
                  onClick={() => void addImage()}
                >
                  Add image
                </button>
              </div>
            ) : null}
          </AdminSection>
        </>
      ) : null}
    </div>
  );
}

function VariantEditRow({
  variant,
  canWrite,
  saving,
  onSave,
  onDelete,
  canDelete,
}: {
  variant: AdminProductVariant;
  canWrite: boolean;
  saving: boolean;
  onSave: (draft: VariantDraft) => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const [draft, setDraft] = useState<VariantDraft>({
    sku: variant.sku,
    name: variant.name,
    pricePaise: String(variant.price),
    compareAtPricePaise:
      variant.compareAtPrice !== null ? String(variant.compareAtPrice) : "",
    isActive: variant.isActive,
  });

  useEffect(() => {
    setDraft({
      sku: variant.sku,
      name: variant.name,
      pricePaise: String(variant.price),
      compareAtPricePaise:
        variant.compareAtPrice !== null ? String(variant.compareAtPrice) : "",
      isActive: variant.isActive,
    });
  }, [variant]);

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-3 py-2">
        <input
          className={inputClass}
          value={draft.sku}
          onChange={(event) => setDraft({ ...draft, sku: event.target.value })}
          disabled={!canWrite}
        />
      </td>
      <td className="px-3 py-2">
        <input
          className={inputClass}
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          disabled={!canWrite}
        />
      </td>
      <td className="px-3 py-2">
        <input
          className={inputClass}
          value={draft.pricePaise}
          onChange={(event) =>
            setDraft({ ...draft, pricePaise: event.target.value })
          }
          disabled={!canWrite}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {formatPaise(variant.price)}
        </p>
      </td>
      <td className="px-3 py-2">
        <input
          className={inputClass}
          value={draft.compareAtPricePaise}
          onChange={(event) =>
            setDraft({ ...draft, compareAtPricePaise: event.target.value })
          }
          disabled={!canWrite}
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="checkbox"
          checked={draft.isActive}
          onChange={(event) =>
            setDraft({ ...draft, isActive: event.target.checked })
          }
          disabled={!canWrite}
        />
      </td>
      <td className="px-3 py-2">
        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="text-xs text-primary"
              disabled={saving}
              onClick={() => onSave(draft)}
            >
              Save
            </button>
            {canDelete ? (
              <button
                type="button"
                className="text-xs text-destructive"
                disabled={saving}
                onClick={onDelete}
              >
                Delete
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">Last variant</span>
            )}
          </div>
        ) : null}
      </td>
    </tr>
  );
}
