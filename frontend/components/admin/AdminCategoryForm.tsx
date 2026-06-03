"use client";

import { useState } from "react";
import { AdminSection } from "@/components/admin/AdminSection";
import { useAdminAuth } from "@/contexts/admin-auth-context";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import {
  ensureArray,
  type AdminCategoryListItem,
  type AdminCreateCategoryInput,
  type AdminUpdateCategoryInput,
} from "@/lib/admin-api";
import { getApiErrorMessage } from "@/lib/error-messages";
import { createIdempotencyKey } from "@/lib/idempotency";
import { ADMIN_PERMISSIONS, hasAdminPermission } from "@/lib/permissions";

const inputClass =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

interface AdminCategoryFormProps {
  categories: AdminCategoryListItem[];
  onSaved: () => void;
}

export function AdminCategoryForm({ categories, onSaved }: AdminCategoryFormProps) {
  const categoryRows = ensureArray<AdminCategoryListItem>(categories);
  const api = useAuthenticatedApi();
  const { adminUser } = useAdminAuth();
  const canWrite = hasAdminPermission(adminUser, ADMIN_PERMISSIONS.productsWrite);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [parentId, setParentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function resetForm() {
    setEditingId(null);
    setName("");
    setSlug("");
    setSlugTouched(false);
    setParentId("");
    setError(null);
    setSuccess(null);
  }

  function startEdit(category: AdminCategoryListItem) {
    setEditingId(category.id);
    setName(category.name);
    setSlug(category.slug);
    setSlugTouched(true);
    setParentId(category.parentId ?? "");
    setError(null);
    setSuccess(null);
  }

  async function onSubmit() {
    if (!canWrite) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (editingId) {
        const payload: AdminUpdateCategoryInput = {
          name: name.trim(),
          slug: slug.trim(),
          parentId: parentId.trim() ? parentId.trim() : null,
        };
        await api(`/admin/categories/${editingId}`, {
          method: "PATCH",
          idempotencyKey: createIdempotencyKey(),
          body: JSON.stringify(payload),
        });
        setSuccess("Category updated.");
      } else {
        const payload: AdminCreateCategoryInput = {
          name: name.trim(),
          slug: slug.trim(),
          ...(parentId.trim() ? { parentId: parentId.trim() } : {}),
        };
        await api("/admin/categories", {
          method: "POST",
          idempotencyKey: createIdempotencyKey(),
          body: JSON.stringify(payload),
        });
        setSuccess("Category created.");
        resetForm();
      }
      onSaved();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(categoryId: string) {
    if (!canWrite) return;
    if (!window.confirm("Delete this category?")) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/admin/categories/${categoryId}`, {
        method: "DELETE",
        idempotencyKey: createIdempotencyKey(),
      });
      if (editingId === categoryId) resetForm();
      onSaved();
      setSuccess("Category deleted.");
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!canWrite) return null;

  return (
    <AdminSection
      title={editingId ? "Edit category" : "Add category"}
      description="Manage product taxonomy."
      actions={
        editingId ? (
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={resetForm}
          >
            Cancel edit
          </button>
        ) : null
      }
    >
      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-sm">
          Name
          <input
            className={inputClass}
            value={name}
            onChange={(event) => {
              const next = event.target.value;
              setName(next);
              if (!slugTouched) setSlug(slugify(next));
            }}
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
          />
        </label>
        <label className="grid gap-1 text-sm">
          Parent category
          <select
            className={inputClass}
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
          >
            <option value="">None</option>
            {categoryRows
              .filter((category) => category.id !== editingId)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void onSubmit()}
          disabled={saving || !name.trim() || !slug.trim()}
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {saving ? "Saving…" : editingId ? "Update category" : "Create category"}
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      {success ? <p className="mt-2 text-sm text-emerald-600">{success}</p> : null}

      {categories.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Slug</th>
                <th className="px-3 py-2 font-medium">Parent</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categoryRows.map((category) => {
                const parent = categories.find((item) => item.id === category.parentId);
                return (
                  <tr key={category.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-medium">{category.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{category.slug}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {parent?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-xs text-primary"
                          onClick={() => startEdit(category)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-xs text-destructive"
                          disabled={saving}
                          onClick={() => void onDelete(category.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </AdminSection>
  );
}
