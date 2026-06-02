import { Leaf, Heart, Shield, Truck } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <div className="mb-12 text-center">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-[#eff5ee]">
          <Leaf className="size-8 text-[#23403d]" />
        </div>
        <h1 className="font-heading text-4xl font-bold text-[#23403d]">About Raghava Organics</h1>
        <p className="mt-4 text-lg font-medium text-[#767676]">Bringing nature&apos;s finest to your doorstep since 2020</p>
      </div>
      <div className="grid gap-12">
        <section>
          <h2 className="mb-4 font-heading text-2xl font-bold text-[#23403d]">Our Story</h2>
          <div className="space-y-4 text-[#4a4a4a] leading-relaxed">
            <p>Raghava Organics was born from a simple belief: everyone deserves access to pure, chemical-free food. What started as a small family farm in the outskirts of Hyderabad has grown into a trusted name in organic produce across Telangana.</p>
            <p>We work directly with certified organic farmers who share our commitment to sustainable agriculture. Every vegetable, fruit, and dairy product we deliver is grown without synthetic pesticides, herbicides, or fertilizers.</p>
          </div>
        </section>
        <section>
          <h2 className="mb-6 font-heading text-2xl font-bold text-[#23403d]">What We Stand For</h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              { icon: Leaf, title: "100% Organic", desc: "Certified organic produce, farm-fresh and chemical-free." },
              { icon: Heart, title: "Farmer First", desc: "Fair prices for farmers. We eliminate middlemen." },
              { icon: Shield, title: "Quality Promise", desc: "Not satisfied? We&apos;ll replace it — no questions asked." }
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-2xl border border-[#efe8e4] p-6 text-center">
                <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-[#eff5ee]"><Icon className="size-6 text-[#ec6e55]" /></div>
                <h3 className="mb-2 font-heading text-lg font-bold text-[#23403d]">{title}</h3>
                <p className="text-sm text-[#767676]">{desc}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl bg-[#eff5ee] p-8 text-center">
          <Truck className="mx-auto mb-4 size-10 text-[#23403d]" />
          <h2 className="mb-2 font-heading text-2xl font-bold text-[#23403d]">Delivery Areas</h2>
          <p className="text-[#767676] max-w-lg mx-auto">We currently deliver across Hyderabad and surrounding areas. Enter your pincode at checkout to check availability.</p>
        </section>
      </div>
    </div>
  );
}
