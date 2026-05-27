import Link from "next/link";
import { Leaf, MapPin, Phone, Mail } from "lucide-react";
import { APP_NAME } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="border-t border-[#efe8e4] bg-[#faf3ef] text-[#23403d]">
      <div className="mx-auto w-full max-w-[1440px] px-4 py-16 lg:px-8">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {/* Brand column */}
          <div className="flex flex-col gap-6">
            <Link
              href="/"
              className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-[#23403d]"
              aria-label={`${APP_NAME} home`}
            >
              <Leaf className="size-6 text-[#ec6e55]" aria-hidden />
              {APP_NAME}
            </Link>
            <p className="text-sm font-medium leading-relaxed text-[#767676]">
              Farm-fresh organic produce delivered to your door. Trusted by
              families across India for quality and purity.
            </p>
            <div className="flex gap-3">
              <a href="https://facebook.com" className="flex size-10 items-center justify-center rounded-full bg-white text-sm font-bold text-[#23403d] shadow-sm transition-colors hover:bg-[#ec6e55] hover:text-white" aria-label="Facebook">
                F
              </a>
              <a href="https://instagram.com" className="flex size-10 items-center justify-center rounded-full bg-white text-sm font-bold text-[#23403d] shadow-sm transition-colors hover:bg-[#ec6e55] hover:text-white" aria-label="Instagram">
                I
              </a>
              <a href="https://twitter.com" className="flex size-10 items-center justify-center rounded-full bg-white text-sm font-bold text-[#23403d] shadow-sm transition-colors hover:bg-[#ec6e55] hover:text-white" aria-label="Twitter">
                T
              </a>
            </div>
          </div>

          {/* Quick links */}
          <div>
            <h3 className="mb-6 font-heading text-lg font-bold text-[#23403d]">
              Quick Links
            </h3>
            <ul className="space-y-4 text-sm font-bold text-[#767676]">
              {[
                { label: "Shop All", href: "/products" },
                { label: "Fresh Vegetables", href: "/categories/fresh-vegetables" },
                { label: "Fresh Fruits", href: "/categories/fruits" },
                { label: "Special Offers", href: "/products?sort=featured" },
                { label: "My Account", href: "/dashboard" },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="transition-colors hover:text-[#ec6e55]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Policies */}
          <div>
            <h3 className="mb-6 font-heading text-lg font-bold text-[#23403d]">
              Policies
            </h3>
            <ul className="space-y-4 text-sm font-bold text-[#767676]">
              {[
                { label: "About Us", href: "/about" },
                { label: "Privacy Policy", href: "/privacy" },
                { label: "Terms & Conditions", href: "/terms" },
                { label: "Shipping Policy", href: "/shipping" },
                { label: "Return Policy", href: "/returns" },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="transition-colors hover:text-[#ec6e55]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="mb-6 font-heading text-lg font-bold text-[#23403d]">
              Contact Us
            </h3>
            <ul className="space-y-4 text-sm font-bold text-[#767676]">
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 size-5 shrink-0 text-[#ec6e55]" aria-hidden />
                <span>Raghava Organics, Hyderabad, Telangana, India</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="size-5 shrink-0 text-[#ec6e55]" aria-hidden />
                <a href="tel:+919000000000" className="transition-colors hover:text-[#ec6e55]">
                  +91 90000 00000
                </a>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="size-5 shrink-0 text-[#ec6e55]" aria-hidden />
                <a href="mailto:hello@raghavaorganics.com" className="transition-colors hover:text-[#ec6e55]">
                  hello@raghavaorganics.com
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-[#efe8e4] pt-8 text-sm font-medium text-[#767676] sm:flex-row">
          <p>&copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.</p>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1"><Leaf className="size-3 text-[#ec6e55]" /> Certified Organic</span>
            <span className="hidden sm:inline">&bull;</span>
            <span className="hidden sm:flex items-center gap-1">Pesticide Free</span>
            <span className="hidden sm:inline">&bull;</span>
            <span className="hidden sm:flex items-center gap-1">Farm to Table</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
