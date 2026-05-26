import Link from "next/link";
import { CartWorkspace } from "@/components/cart/CartWorkspace";

export const metadata = {
  title: "Your Cart",
};

export default function CartPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 lg:px-6">
      <nav className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-primary">Home</Link>
        <span>/</span>
        <span className="font-medium text-foreground">Cart</span>
      </nav>
      <h1 className="font-heading mb-8 text-3xl font-bold text-foreground">Your Cart</h1>
      <CartWorkspace />
    </div>
  );
}
