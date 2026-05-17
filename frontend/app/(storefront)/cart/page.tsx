import { CartWorkspace } from "@/components/cart/CartWorkspace";

export default function CartPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="font-heading mb-8 text-3xl font-semibold">Your cart</h1>
      <CartWorkspace />
    </div>
  );
}
