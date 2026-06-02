"use client";



import { useCallback, useEffect, useState } from "react";

import { AdminCouponAnalyticsPanel } from "@/components/admin/AdminCouponAnalyticsPanel";

import { AdminCouponForm } from "@/components/admin/AdminCouponForm";

import { AdminDetailDrawer } from "@/components/admin/AdminDetailDrawer";

import { AdminPagination } from "@/components/admin/AdminPagination";

import { AdminSection } from "@/components/admin/AdminSection";

import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";

import { Button } from "@/components/ui/button";

import { useAdminAuth } from "@/contexts/admin-auth-context";

import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";

import {

  buildAdminQuery,

  type AdminCouponAuditEntry,

  type AdminCouponListItem,

  type PaginatedResponse,

} from "@/lib/admin-api";

import { couponStatusTone, formatAdminDate, formatPaise } from "@/lib/admin-format";

import { getApiErrorMessage } from "@/lib/error-messages";

import { createIdempotencyKey } from "@/lib/idempotency";

import { ADMIN_PERMISSIONS, hasAdminPermission } from "@/lib/permissions";



const PAGE_SIZE = 50;



export function AdminCouponsPageContent() {

  return (

    <div className="grid gap-6">

      <AdminCouponsList />

      <AdminCouponAnalyticsPanel />

    </div>

  );

}



export function AdminCouponsList() {

  const api = useAuthenticatedApi();

  const { adminUser } = useAdminAuth();

  const canWrite = hasAdminPermission(adminUser, ADMIN_PERMISSIONS.couponsWrite);



  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState<PaginatedResponse<AdminCouponListItem> | null>(null);

  const [actionId, setActionId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);

  const [editingCoupon, setEditingCoupon] = useState<AdminCouponListItem | null>(null);

  const [auditCoupon, setAuditCoupon] = useState<AdminCouponListItem | null>(null);

  const [auditItems, setAuditItems] = useState<AdminCouponAuditEntry[]>([]);

  const [auditLoading, setAuditLoading] = useState(false);
  const [cloneCode, setCloneCode] = useState("");



  const load = useCallback(async () => {

    setLoading(true);

    setError(null);

    try {

      const response = await api<PaginatedResponse<AdminCouponListItem>>(

        `/admin/coupons${buildAdminQuery({ page, limit: PAGE_SIZE })}`,

      );

      setData(response);

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



  async function toggleActive(coupon: AdminCouponListItem) {

    setActionId(coupon.id);

    try {

      await api(`/admin/coupons/${coupon.id}/status`, {

        method: "PATCH",

        idempotencyKey: createIdempotencyKey(),

        body: JSON.stringify({ isActive: !coupon.isActive }),

      });

      await load();

    } catch (err) {

      setError(getApiErrorMessage(err));

    } finally {

      setActionId(null);

    }

  }



  async function deleteCoupon(coupon: AdminCouponListItem) {

    if (!window.confirm(`Delete coupon ${coupon.code}?`)) return;

    setActionId(coupon.id);

    try {

      await api(`/admin/coupons/${coupon.id}`, {

        method: "DELETE",

        idempotencyKey: createIdempotencyKey(),

      });

      await load();

    } catch (err) {

      setError(getApiErrorMessage(err));

    } finally {

      setActionId(null);

    }

  }



  async function restoreCoupon(coupon: AdminCouponListItem) {

    setActionId(coupon.id);

    try {

      await api(`/admin/coupons/${coupon.id}/restore`, {

        method: "POST",

        idempotencyKey: createIdempotencyKey(),

        body: JSON.stringify({}),

      });

      await load();

    } catch (err) {

      setError(getApiErrorMessage(err));

    } finally {

      setActionId(null);

    }

  }



  async function cloneCoupon(coupon: AdminCouponListItem) {

    const newCode = cloneCode.trim().toUpperCase();

    if (!newCode) {

      setError("Enter a new code to clone.");

      return;

    }

    setActionId(coupon.id);

    try {

      await api(`/admin/coupons/${coupon.id}/clone`, {

        method: "POST",

        idempotencyKey: createIdempotencyKey(),

        body: JSON.stringify({ newCode }),

      });

      setCloneCode("");

      await load();

    } catch (err) {

      setError(getApiErrorMessage(err));

    } finally {

      setActionId(null);

    }

  }



  async function openAudit(coupon: AdminCouponListItem) {

    setAuditCoupon(coupon);

    setAuditLoading(true);

    try {

      const response = await api<PaginatedResponse<AdminCouponAuditEntry>>(

        `/admin/coupons/${coupon.id}/audit${buildAdminQuery({ page: 1, limit: 20 })}`,

      );

      setAuditItems(response.items);

    } catch (err) {

      setError(getApiErrorMessage(err));

      setAuditItems([]);

    } finally {

      setAuditLoading(false);

    }

  }



  const items = data?.items ?? [];



  return (

    <>

      {showCreate ? (

        <AdminCouponForm

          onSaved={() => {

            setShowCreate(false);

            void load();

          }}

          onCancel={() => setShowCreate(false)}

        />

      ) : null}



      {editingCoupon ? (

        <AdminCouponForm

          coupon={editingCoupon}

          onSaved={() => {

            setEditingCoupon(null);

            void load();

          }}

          onCancel={() => setEditingCoupon(null)}

        />

      ) : null}



      <AdminSection

        title="Coupons"

        description="Discount codes and campaign status."

        loading={loading}

        error={error}

        empty={!loading && !error && items.length === 0}

        emptyMessage="No coupons found."

        actions={

          canWrite ? (

            <Button type="button" size="sm" onClick={() => setShowCreate(true)}>

              New coupon

            </Button>

          ) : null

        }

      >

        {data ? (

          <>

            <div className="overflow-x-auto rounded-md border border-border">

              <table className="w-full min-w-[900px] text-left text-sm">

                <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">

                  <tr>

                    <th className="px-3 py-2 font-medium">Code</th>

                    <th className="px-3 py-2 font-medium">Type</th>

                    <th className="px-3 py-2 font-medium">Value</th>

                    <th className="px-3 py-2 font-medium">Uses</th>

                    <th className="px-3 py-2 font-medium">Status</th>

                    <th className="px-3 py-2 font-medium">Valid until</th>

                    <th className="px-3 py-2 font-medium">Actions</th>

                  </tr>

                </thead>

                <tbody>

                  {items.map((coupon) => (

                    <tr key={coupon.id} className="border-b border-border last:border-0">

                      <td className="px-3 py-2 font-mono font-medium">{coupon.code}</td>

                      <td className="px-3 py-2 text-xs">{coupon.type}</td>

                      <td className="px-3 py-2">

                        {coupon.type === "PERCENTAGE_OFF"

                          ? `${coupon.value}%`

                          : formatPaise(coupon.value)}

                      </td>

                      <td className="px-3 py-2 text-xs">

                        {coupon.usesCount}

                        {coupon.maxUsesTotal ? ` / ${coupon.maxUsesTotal}` : ""}

                      </td>

                      <td className="px-3 py-2">

                        <AdminStatusBadge

                          label={coupon.status}

                          tone={couponStatusTone(coupon.status)}

                        />

                      </td>

                      <td className="px-3 py-2 text-xs text-muted-foreground">

                        {coupon.validUntil ? formatAdminDate(coupon.validUntil) : "—"}

                      </td>

                      <td className="px-3 py-2">

                        <div className="flex flex-wrap gap-1">

                          {canWrite && coupon.status !== "deleted" ? (

                            <>

                              <Button

                                type="button"

                                size="sm"

                                variant="ghost"

                                onClick={() => setEditingCoupon(coupon)}

                              >

                                Edit

                              </Button>

                              <Button

                                type="button"

                                size="sm"

                                variant="outline"

                                disabled={actionId === coupon.id}

                                onClick={() => void toggleActive(coupon)}

                              >

                                {coupon.isActive ? "Pause" : "Activate"}

                              </Button>

                              <Button

                                type="button"

                                size="sm"

                                variant="ghost"

                                onClick={() => void openAudit(coupon)}

                              >

                                Audit

                              </Button>

                              <Button

                                type="button"

                                size="sm"

                                variant="ghost"

                                disabled={actionId === coupon.id}

                                onClick={() => void deleteCoupon(coupon)}

                              >

                                Delete

                              </Button>

                            </>

                          ) : null}

                          {canWrite && coupon.status === "deleted" ? (

                            <Button

                              type="button"

                              size="sm"

                              variant="outline"

                              disabled={actionId === coupon.id}

                              onClick={() => void restoreCoupon(coupon)}

                            >

                              Restore

                            </Button>

                          ) : null}

                        </div>

                        {canWrite && coupon.status !== "deleted" ? (

                          <div className="mt-2 flex gap-1">

                            <input

                              className="h-8 w-28 rounded border border-border px-2 text-xs"

                              placeholder="Clone code"

                              value={actionId === coupon.id ? cloneCode : ""}

                              onChange={(event) => setCloneCode(event.target.value)}

                              onFocus={() => setActionId(coupon.id)}

                            />

                            <Button

                              type="button"

                              size="sm"

                              variant="ghost"

                              disabled={actionId !== coupon.id || !cloneCode.trim()}

                              onClick={() => void cloneCoupon(coupon)}

                            >

                              Clone

                            </Button>

                          </div>

                        ) : null}

                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

            <AdminPagination meta={data.meta} onPageChange={setPage} />

          </>

        ) : null}

      </AdminSection>



      <AdminDetailDrawer

        open={Boolean(auditCoupon)}

        title={auditCoupon ? `Audit · ${auditCoupon.code}` : "Audit"}

        onClose={() => {

          setAuditCoupon(null);

          setAuditItems([]);

        }}

      >

        {auditLoading ? (

          <p className="text-sm text-muted-foreground">Loading audit log…</p>

        ) : auditItems.length === 0 ? (

          <p className="text-sm text-muted-foreground">No audit entries.</p>

        ) : (

          <ul className="divide-y divide-border">

            {auditItems.map((entry) => (

              <li key={entry.id} className="py-3 text-sm">

                <p className="font-medium">{entry.action}</p>

                <p className="text-xs text-muted-foreground">

                  {entry.actorName} · {formatAdminDate(entry.createdAt)}

                </p>

              </li>

            ))}

          </ul>

        )}

      </AdminDetailDrawer>

    </>

  );

}

