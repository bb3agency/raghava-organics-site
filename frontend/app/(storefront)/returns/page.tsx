export default function ReturnPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-8 font-heading text-4xl font-bold text-[#23403d]">Return Policy</h1>
      <div className="prose prose-slate max-w-none space-y-6 text-sm text-[#4a4a4a] leading-relaxed">
        <p className="font-semibold text-[#23403d]">Last Updated: June 2026</p>
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-[#23403d]">1. Fresh Produce Return</h2>
          <p>Due to the perishable nature of organic fruits, vegetables, and dairy, return requests must be filed within 24 hours of delivery. Please inspect your items on delivery.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-[#23403d]">2. Raising a Return Request</h2>
          <p>You can raise a return request directly from your Account Order History page for delivered items. Once submitted, our team will review and approve the pickup/replacement within 24 hours.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-[#23403d]">3. Refund Method</h2>
          <p>Once approved, the refund will be credited back to your original payment mode (Razorpay prepaid) or processed as store credits for Cash on Delivery (COD) transactions.</p>
        </section>
      </div>
    </div>
  );
}
