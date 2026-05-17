import Script from "next/script";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { COD_ENABLED } from "@/lib/constants";

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="lazyOnload"
      />
      <h1 className="font-heading mb-8 text-3xl font-semibold">Checkout</h1>
      <div className="grid gap-6 lg:grid-cols-[60%_40%]">
        <CheckoutForm isCodEnabled={COD_ENABLED} />
        <aside className="h-max rounded-lg border border-border p-4">
          <h2 className="font-heading text-lg font-semibold">Flow contract</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>PREPAID: `/orders` → `/payments/initiate` → Razorpay → `/payments/verify`</li>
            <li>
              COD: `/orders` with {`paymentMode: "COD"`} (no Razorpay modal)
            </li>
            <li>Never compute payable total in frontend; use backend-returned amounts only.</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
