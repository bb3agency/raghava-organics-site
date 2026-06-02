import Link from "next/link";

const SETTINGS_LINKS = [
  { href: "/admin/settings/store", title: "Store profile", description: "Name, contact, compliance IDs" },
  { href: "/admin/settings/shipping", title: "Shipping", description: "Pickup pincode and minimum order" },
  { href: "/admin/settings/inventory", title: "Inventory", description: "Default low-stock threshold" },
  { href: "/admin/settings/cod", title: "Cash on delivery", description: "COD enablement and cancellation window" },
  { href: "/admin/settings/notifications", title: "Notifications", description: "Email, SMS, and WhatsApp channels" },
];

export default function AdminSettingsIndexPage() {
  return (
    <div className="grid gap-6">
      <header>
        <h2 className="font-heading text-xl font-semibold">Settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Store configuration and operational defaults.
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SETTINGS_LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/40"
          >
            <h3 className="font-medium">{item.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
