export default function ShippingPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-8 font-heading text-4xl font-bold text-[#23403d]">Shipping Policy</h1>
      <div className="prose prose-slate max-w-none space-y-6 text-sm text-[#4a4a4a] leading-relaxed">
        <p className="font-semibold text-[#23403d]">Last Updated: June 2026</p>
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-[#23403d]">1. Delivery Areas</h2>
          <p>We deliver certified farm-fresh organic produce to serviceable pincodes within Hyderabad and surrounding urban regions in Telangana, India.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-[#23403d]">2. Charges & Thresholds</h2>
          <p>Our flat shipping fee and free-shipping threshold are dynamically calculated at checkout based on active configurations set in our admin system.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-[#23403d]">3. Delivery Schedule</h2>
          <p>Orders are dispatched early morning to preserve cold-chain integrity and freshness. Real-time updates and AWBs are shared immediately via email or WhatsApp once booked.</p>
        </section>
      </div>
    </div>
  );
}
