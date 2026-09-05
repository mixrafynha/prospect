"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import Reveal from "@/components/Reveal";
import SiteHeader from "@/components/SiteHeader";

const steps = [
  {
    number: "01",
    title: "Search",
    text: "Find businesses by niche and location.",
  },
  {
    number: "02",
    title: "Discover",
    text: "Find public business contacts including mobile numbers.",
  },
  {
    number: "03",
    title: "Analyze",
    text: "Understand which businesses represent stronger opportunities.",
  },
  {
    number: "04",
    title: "Contact",
    text: "Use the information to start a personalized conversation.",
  },
];

export default function LandingPage() {
  return (
    <main className="landing">
      <SiteHeader />

      <section className="hero premium-hero">
        <Reveal className="hero-copy hero-copy-center">
          <h1>Find local businesses with direct contacts.</h1>
          <p className="leadText">Search, filter and contact prospects faster with mobile-first SMS and clean lead discovery.</p>
          <div className="hero-cta-row">
            <Link href="/leads" className="button">Access the app <ArrowRight size={16} /></Link>
          </div>
          <p className="hero-fineprint">15 day free trial. 100 credits included.</p>
        </Reveal>

        <Reveal className="hero-demo" delay={140}>
          <div className="hero-visual hero-visual-pharow">
            <div className="hero-visual-grid">
              <div className="hero-visual-image">
                <Image src="/landing-hero-v2.webp" alt="Product preview" fill priority sizes="(max-width: 900px) 100vw, 56vw" />
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <section id="how-it-works" className="section-stack">
        <Reveal>
          <div className="section-heading">
            <span className="eyebrow">How it works</span>
            <h2>A simple flow built around prospecting.</h2>
          </div>
        </Reveal>
        <div className="step-grid">
          {steps.map((step, index) => (
            <Reveal key={step.number} delay={index * 80}>
              <article className="step-card">
                <div className="step-number">{step.number}</div>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
                <div className="step-mini-demo">
                  <div className="mini-bar" />
                  <div className="mini-bar short" />
                  <div className="mini-bar" />
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="product" className="section-stack">
        <Reveal>
          <div className="section-heading narrow">
            <span className="eyebrow">Product showcase</span>
            <h2>Everything you need to find your next client.</h2>
            <p>Search, results, contacts and opportunities stay visible in a single polished flow.</p>
          </div>
        </Reveal>
        <Reveal>
          <div className="showcase-frame">
            <Image
              src="/landing-showcase.webp"
              alt="Prospecting dashboard preview"
              fill
              loading="lazy"
              className="showcase-image"
              sizes="(max-width: 900px) 100vw, 92vw"
            />
          </div>
        </Reveal>
      </section>

      <section id="pricing" className="section-stack split-section">
        <Reveal>
          <div className="section-heading">
            <span className="eyebrow">Pricing</span>
            <h2>Simple monthly pricing for practical prospecting.</h2>
          </div>
        </Reveal>
        <Reveal>
          <div className="pricing-card">
            <strong>Start</strong>
            <p>Built for individual operators and small teams who want local leads with direct contacts.</p>
            <Link href="/leads" className="button gold">Start for free</Link>
          </div>
        </Reveal>
      </section>

      <section id="faq" className="section-stack faq-grid">
        <Reveal>
          <div className="section-heading">
            <span className="eyebrow">FAQ</span>
            <h2>Clear answers, no fluff.</h2>
          </div>
        </Reveal>
        <Reveal><div className="faq-card"><strong>Do mobile numbers appear first?</strong><p>Yes. 06 and 07 are prioritized and visually highlighted.</p></div></Reveal>
        <Reveal delay={80}><div className="faq-card"><strong>Does it keep businesses without websites?</strong><p>Yes. Those leads remain visible and searchable.</p></div></Reveal>
        <Reveal delay={160}><div className="faq-card"><strong>Can I use it on mobile?</strong><p>Yes, the result list collapses into cards and filters stay compact.</p></div></Reveal>
      </section>
    </main>
  );
}
