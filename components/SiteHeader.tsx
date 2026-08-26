"use client";

import Link from "next/link";
import { Menu, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { name: "Product", href: "/#product" },
  { name: "How it works", href: "/#how-it-works" },
  { name: "Pricing", href: "/#pricing" },
  { name: "FAQ", href: "/#faq" },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <nav className="topbar">
        <div className="topbar-backdrop" />

        <div className="topbar-inner">
          <div className="topbar-brand-row">
            <button
              type="button"
              aria-label="Toggle menu"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
              className="topbar-menu-btn"
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>

            <Link href="/" className="brand">
              <span className="brand-mark"><Sparkles size={16} /></span>
              <span>Lead Studio</span>
            </Link>
          </div>

          <div className="topnav">
            {LINKS.map((link) => (
              <Link key={link.name} href={link.href} className={pathname === link.href ? "active" : ""}>
                {link.name}
              </Link>
            ))}
          </div>

          <div className="topbar-actions">
            <Link href="/outreach" className="ghost-link">Sign in</Link>
            <Link href="/leads" className="button compact">Search leads</Link>
          </div>
        </div>
      </nav>

      <div className={open ? "mobile-menu-overlay open" : "mobile-menu-overlay"} onClick={() => setOpen(false)} />

      <aside className={open ? "mobile-menu open" : "mobile-menu"} aria-hidden={!open}>
        <div className="mobile-menu-head">
          <Link href="/" className="brand" onClick={() => setOpen(false)}>
            <span className="brand-mark"><Sparkles size={16} /></span>
            <span>Lead Studio</span>
          </Link>
          <button type="button" className="topbar-menu-btn" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <nav className="mobile-menu-links">
          {LINKS.map((link) => (
            <Link key={link.name} href={link.href} onClick={() => setOpen(false)}>
              {link.name}
            </Link>
          ))}
        </nav>

        <div className="mobile-menu-actions">
          <Link href="/outreach" className="ghost-link" onClick={() => setOpen(false)}>Sign in</Link>
          <Link href="/leads" className="button compact" onClick={() => setOpen(false)}>Search leads</Link>
        </div>
      </aside>
    </>
  );
}
