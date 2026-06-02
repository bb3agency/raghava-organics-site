export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-8 font-heading text-4xl font-bold text-[#23403d]">Terms & Conditions</h1>
      <div className="prose prose-slate max-w-none space-y-6 text-sm text-[#4a4a4a] leading-relaxed">
        <p className="font-semibold text-[#23403d]">Last Updated: June 2026</p>
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-[#23403d]">1. Store Usage</h2>
          <p>By using Raghava Organics, you agree to provide accurate and complete personal details during registration, checkout, and address management.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-[#23403d]">2. Pricing & Orders</h2>
          <p>Prices for organic products are listed in Indian Rupees (INR) and are subject to change based on seasonal farming yields. We reserve the right to cancel orders due to stock unavailability or logistical challenges.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-[#23403d]">3. Governing Law</h2>
          <p>These terms are governed by the laws of India and are subject to the exclusive jurisdiction of the courts in Hyderabad, Telangana.</p>
        </section>
      </div>
    </div>
  );
}
