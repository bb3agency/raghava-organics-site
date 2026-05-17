import { AdminDataPanel } from "@/components/admin/AdminDataPanel";

export default function AdminProductsPage() {
  return (
    <div className="grid gap-6">
      <AdminDataPanel
        title="Products list"
        endpoint="/admin/products?page=1&limit=20"
        emptyMessage="No products found."
      />
      <AdminDataPanel
        title="Categories"
        endpoint="/admin/categories"
        emptyMessage="No categories found."
      />
    </div>
  );
}
