"use client";



import { useCallback, useEffect, useState } from "react";

import { AdminCategoryForm } from "@/components/admin/AdminCategoryForm";

import type { AdminCategoryListItem } from "@/lib/admin-api";

import { getApiErrorMessage } from "@/lib/error-messages";

import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";



export function AdminCategoriesList() {

  const api = useAuthenticatedApi();

  const [items, setItems] = useState<AdminCategoryListItem[]>([]);

  const [error, setError] = useState<string | null>(null);



  const load = useCallback(async () => {

    setError(null);

    try {

      const response = await api<AdminCategoryListItem[]>("/admin/categories");

      setItems(response);

    } catch (err) {

      setError(getApiErrorMessage(err));

      setItems([]);

    }

  }, [api]);



  useEffect(() => {

    void load();

  }, [load]);



  if (error) {

    return (

      <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">

        {error}

      </p>

    );

  }



  return <AdminCategoryForm categories={items} onSaved={() => void load()} />;

}

