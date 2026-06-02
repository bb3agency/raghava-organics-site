import { AdminProductsList } from "@/components/admin/AdminProductsList";
import { AdminCategoriesList } from "@/components/admin/AdminCategoriesList";
import { AdminProductImportPanel } from "@/components/admin/AdminProductImportPanel";

export default function AdminProductsPage() {
  return (
    <div className="grid gap-6">
      <AdminProductsList />
      <AdminProductImportPanel />
      <AdminCategoriesList />
    </div>
  );
}
