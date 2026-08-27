"use client";

import Link from "next/link";
import { HelpCircle, MessageCircle, Search, Sparkles, X, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const LINKS = [
  { name: "Product", href: "/#product", icon: Zap },
  { name: "How it works", href: "/#how-it-works", icon: Search },
  { name: "Pricing", href: "/#pricing", icon: MessageCircle },
  { name: "FAQ", href: "/#faq", icon: HelpCircle },
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
              aria-controls="mobile-site-menu"
              onClick={() => setOpen((value) => !value)}
              className="topbar-menu-btn"
            >
              <span className={open ? "hamburger open" : "hamburger"} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
            </button>

            <Link href="/" className="brand">
              <span className="brand-mark"><MessageCircle size={16} /></span>
              <span>PROSPECT</span>
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

      <nav className="mobile-topbar" aria-label="Mobile navigation">
        <div className="mobile-topbar-brand">
          <Link href="/" className="brand" onClick={() => setOpen(false)}>
            <span className="brand-mark"><MessageCircle size={16} /></span>
            <span>PROSPECT</span>
          </Link>
        </div>

        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={open}
          aria-controls="mobile-site-menu"
          onClick={() => setOpen((value) => !value)}
          className="mobile-topbar-menu-btn"
        >
          <span className={open ? "hamburger open" : "hamburger"} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        </button>
      </nav>

      <div className={open ? "mobile-menu-overlay open" : "mobile-menu-overlay"} onClick={() => setOpen(false)} />

      <aside id="mobile-site-menu" className={open ? "mobile-menu open" : "mobile-menu"} aria-hidden={!open}>
        <div className="mobile-menu-head">
          <Link href="/" className="brand" onClick={() => setOpen(false)}>
            <span className="brand-mark"><MessageCircle size={16} /></span>
            <span>PROSPECT</span>
          </Link>
          <button type="button" className="topbar-menu-btn" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <nav className="mobile-menu-links">
          {LINKS.map((link) => (
            <Link key={link.name} href={link.href} onClick={() => setOpen(false)} aria-label={link.name}>
              <link.icon size={18} />
              <span className="sr-only">{link.name}</span>
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
