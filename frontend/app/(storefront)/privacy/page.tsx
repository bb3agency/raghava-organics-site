export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-8 font-heading text-4xl font-bold text-[#23403d]">Privacy Policy</h1>
      <div className="prose prose-slate max-w-none space-y-6 text-sm text-[#4a4a4a] leading-relaxed">
        <p className="font-semibold text-[#23403d]">Last Updated: June 2026</p>
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-[#23403d]">1. Information We Collect</h2>
          <p>We collect personal information such as your name, email address, phone number, and delivery address when you place an order or register a customer account on Raghava Organics.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-[#23403d]">2. How We Use Your Information</h2>
          <p>We use your information to process and deliver your organic produce orders, send order updates and verification OTPs, and improve our services.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-[#23403d]">3. Data Security</h2>
          <p>All transactions are securely processed, and we use standard encryption to protect sensitive customer data. We never sell your personal information to third parties.</p>
        </section>
      </div>
    </div>
  );
}
