"use client";



import { useCallback, useEffect, useState } from "react";

import { AdminPagination } from "@/components/admin/AdminPagination";

import { AdminSection } from "@/components/admin/AdminSection";

import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";

import { Button } from "@/components/ui/button";

import { useAdminAuth } from "@/contexts/admin-auth-context";

import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";

import {

  buildAdminQuery,

  coercePaginatedResponse,

  type AdminInventoryListItem,

  readPaginatedItems,

  type PaginatedResponse,

} from "@/lib/admin-api";

import { getApiErrorMessage } from "@/lib/error-messages";

import { createIdempotencyKey } from "@/lib/idempotency";

import { ADMIN_PERMISSIONS, hasAdminPermission } from "@/lib/permissions";



const PAGE_SIZE = 20;

const inputClass =

  "h-8 w-20 rounded-md border border-border bg-background px-2 text-sm";



interface AdminInventoryListProps {

  onViewHistory?: (variantId: string) => void;

}



export function AdminInventoryList({ onViewHistory }: AdminInventoryListProps) {

  const api = useAuthenticatedApi();

  const { adminUser } = useAdminAuth();

  const canWrite = hasAdminPermission(adminUser, ADMIN_PERMISSIONS.inventoryWrite);



  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState<PaginatedResponse<AdminInventoryListItem> | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);

  const [quantity, setQuantity] = useState("");

  const [threshold, setThreshold] = useState("");

  const [saving, setSaving] = useState(false);



  const load = useCallback(async () => {

    setLoading(true);

    setError(null);

    try {

      const response = await api<PaginatedResponse<AdminInventoryListItem>>(

        `/admin/inventory${buildAdminQuery({ page, limit: PAGE_SIZE })}`,

      );

      setData(coercePaginatedResponse(response));

    } catch (err) {

      setError(getApiErrorMessage(err));

      setData(null);

    } finally {

      setLoading(false);

    }

  }, [api, page]);



  useEffect(() => {

    void load();

  }, [load]);



  function startEdit(row: AdminInventoryListItem) {

    setEditingId(row.variantId);

    setQuantity(String(row.quantity));

    setThreshold(String(row.lowStockThreshold));

  }



  async function saveEdit(variantId: string) {

    const payload: { quantity?: number; lowStockThreshold?: number } = {};

    if (quantity.trim()) payload.quantity = Number(quantity);

    if (threshold.trim()) payload.lowStockThreshold = Number(threshold);

    if (Object.keys(payload).length === 0) return;



    setSaving(true);

    setError(null);

    try {

      await api(`/admin/inventory/${variantId}`, {

        method: "PATCH",

        idempotencyKey: createIdempotencyKey(),

        body: JSON.stringify(payload),

      });

      setEditingId(null);

      await load();

    } catch (err) {

      setError(getApiErrorMessage(err));

    } finally {

      setSaving(false);

    }

  }



  const items = readPaginatedItems(data);



  return (

    <AdminSection

      title="Inventory"

      description="Stock levels by product variant."

      loading={loading}

      error={error}

      empty={!loading && !error && items.length === 0}

      emptyMessage="No inventory rows found."

    >

      {data ? (

        <>

          <div className="overflow-x-auto rounded-md border border-border">

            <table className="w-full min-w-[760px] text-left text-sm">

              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">

                <tr>

                  <th className="px-3 py-2 font-medium">Product</th>

                  <th className="px-3 py-2 font-medium">SKU</th>

                  <th className="px-3 py-2 font-medium">On hand</th>

                  <th className="px-3 py-2 font-medium">Available</th>

                  <th className="px-3 py-2 font-medium">Threshold</th>

                  <th className="px-3 py-2 font-medium">Alert</th>

                  <th className="px-3 py-2 font-medium">Actions</th>

                </tr>

              </thead>

              <tbody>

                {items.map((row) => {

                  const available =

                    row.availableQuantity ??

                    Math.max(0, row.quantity - (row.reservedQuantity ?? 0));

                  const low =

                    row.lowStockAlerted || available <= row.lowStockThreshold;

                  const isEditing = editingId === row.variantId;



                  return (

                    <tr key={row.id} className="border-b border-border last:border-0">

                      <td className="px-3 py-2">

                        <p className="font-medium">{row.variant.product.name}</p>

                        <p className="text-xs text-muted-foreground">{row.variant.name}</p>

                      </td>

                      <td className="px-3 py-2 font-mono text-xs">{row.variant.sku}</td>

                      <td className="px-3 py-2">

                        {isEditing ? (

                          <input

                            className={inputClass}

                            value={quantity}

                            onChange={(event) => setQuantity(event.target.value)}

                          />

                        ) : (

                          row.quantity

                        )}

                      </td>

                      <td className="px-3 py-2">{available}</td>

                      <td className="px-3 py-2">

                        {isEditing ? (

                          <input

                            className={inputClass}

                            value={threshold}

                            onChange={(event) => setThreshold(event.target.value)}

                          />

                        ) : (

                          row.lowStockThreshold

                        )}

                      </td>

                      <td className="px-3 py-2">

                        {low ? (

                          <AdminStatusBadge label="Low stock" tone="warning" />

                        ) : (

                          <AdminStatusBadge label="OK" tone="success" />

                        )}

                      </td>

                      <td className="px-3 py-2">

                        <div className="flex flex-wrap gap-2">

                          {canWrite ? (

                            isEditing ? (

                              <>

                                <Button

                                  type="button"

                                  size="sm"

                                  variant="outline"

                                  disabled={saving}

                                  onClick={() => void saveEdit(row.variantId)}

                                >

                                  Save

                                </Button>

                                <button

                                  type="button"

                                  className="text-xs text-muted-foreground"

                                  onClick={() => setEditingId(null)}

                                >

                                  Cancel

                                </button>

                              </>

                            ) : (

                              <button

                                type="button"

                                className="text-xs text-primary"

                                onClick={() => startEdit(row)}

                              >

                                Adjust

                              </button>

                            )

                          ) : null}

                          {onViewHistory ? (

                            <button

                              type="button"

                              className="text-xs text-muted-foreground hover:text-foreground"

                              onClick={() => onViewHistory(row.variantId)}

                            >

                              History

                            </button>

                          ) : null}

                        </div>

                      </td>

                    </tr>

                  );

                })}

              </tbody>

            </table>

          </div>

          <AdminPagination meta={data.meta} onPageChange={setPage} />

        </>

      ) : null}

    </AdminSection>

  );

}

