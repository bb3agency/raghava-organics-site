import Link from "next/link";
import { Leaf, MapPin, Phone, Mail } from "lucide-react";
import { APP_NAME } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="border-t border-border bg-primary text-primary-foreground">
      <div className="mx-auto max-w-7xl px-4 py-14 lg:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand column */}
          <div className="flex flex-col gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 font-heading text-lg font-bold"
              aria-label={`${APP_NAME} home`}
            >
              <Leaf className="size-5 text-accent" aria-hidden />
              {APP_NAME}
            </Link>
            <p className="text-sm leading-relaxed text-primary-foreground/70">
              Farm-fresh organic produce delivered to your door. Trusted by
              families across India for quality and purity.
            </p>
            <div className="flex gap-3">
              {["Facebook", "Instagram", "Twitter"].map((name) => (
                <a
                  key={name}
                  href="#"
                  className="inline-flex size-8 items-center justify-center rounded-full border border-primary-foreground/20 text-xs text-primary-foreground/70 transition-colors hover:border-accent hover:text-accent"
                  aria-label={name}
                >
                  {name[0]}
                </a>
              ))}
            </div>
          </div>

          {/* Quick links */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-primary-foreground/50">
              Quick Links
            </h3>
            <ul className="space-y-2 text-sm text-primary-foreground/70">
              {[
                { label: "Shop All", href: "/products" },
                { label: "Fresh Produce", href: "/categories/fresh" },
                { label: "Staples & Grains", href: "/categories/staples" },
                { label: "Offers", href: "/products?sort=featured" },
                { label: "My Account", href: "/dashboard" },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="transition-colors hover:text-accent"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Policies */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-primary-foreground/50">
              Policies
            </h3>
            <ul className="space-y-2 text-sm text-primary-foreground/70">
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
                    className="transition-colors hover:text-accent"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-primary-foreground/50">
              Contact Us
            </h3>
            <ul className="space-y-3 text-sm text-primary-foreground/70">
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                <span>Raghava Organics, Hyderabad, Telangana, India</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="size-4 shrink-0 text-accent" aria-hidden />
                <a href="tel:+919000000000" className="transition-colors hover:text-accent">
                  +91 90000 00000
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="size-4 shrink-0 text-accent" aria-hidden />
                <a href="mailto:hello@raghavaorganics.com" className="transition-colors hover:text-accent">
                  hello@raghavaorganics.com
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-primary-foreground/10 pt-6 text-xs text-primary-foreground/40 sm:flex-row">
          <p>&copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.</p>
          <p>Certified Organic &bull; Pesticide Free &bull; Farm to Table</p>
        </div>
      </div>
    </footer>
  );
}
