import { ArrowRight, LogIn } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { DashboardMockup } from "@/components/landing/DashboardMockup";
import { brand } from "@/data/brand";
import { cn } from "@/lib/utils";

/**
 * Hero — The primary marketing section at the top of the landing page.
 *
 * Composition (desktop):
 * ┌──────────────────────────────────────────────────┐
 * │  Eyebrow                                         │
 * │  Headline                    Dashboard Mockup    │
 * │  Description                                     │
 * │  [Get Started]  [Log In]                         │
 * └──────────────────────────────────────────────────┘
 *
 * On mobile the text and visual stack vertically.
 *
 * The background uses a dark cinematic treatment with subtle pitch markings
 * and floodlight gradients to evoke a matchday atmosphere without competing
 * with the headline or product UI.
 */
export function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative isolate overflow-hidden bg-[#0B1218]"
    >
      {/* ── Atmospheric background layer ──────────────────────────────── */}
      <HeroBackground />

      {/* ── Content grid ──────────────────────────────────────────────── */}
      <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-20 lg:px-8 lg:pb-32 lg:pt-28">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* ── Left column: copy + CTAs ──────────────────────────────── */}
          <div className="flex flex-col text-center lg:text-left">
            {/* Eyebrow */}
            <span
              className="mb-5 inline-flex items-center justify-center gap-2 self-center rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-white/70 backdrop-blur-sm lg:self-start animate-fade-in"
            >
              <span className="size-1.5 rounded-full bg-brand animate-pulse-subtle" />
              For Amateur Football Coaches
            </span>

            {/* Headline — exact wording from the product spec */}
            <h1
              id="hero-heading"
              className="font-display text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-[3.5rem] xl:text-6xl animate-fade-in-up"
            >
              {brand.tagline}
            </h1>

            {/* Supporting description */}
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/60 sm:text-lg lg:mx-0 animate-fade-in-up animation-delay-150">
              {brand.description}
            </p>

            {/* CTA buttons */}
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start animate-fade-in-up animation-delay-300">
              <a
                href="/login"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "w-full gap-2 bg-brand text-brand-foreground font-semibold hover:bg-brand-light shadow-lg shadow-brand/20 sm:w-auto",
                )}
              >
                Get Started
                <ArrowRight className="size-4" />
              </a>

              <a
                href="/login"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "w-full gap-2 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white sm:w-auto",
                )}
              >
                <LogIn className="size-4" />
                Log In
              </a>
            </div>

            {/* Trust signal */}
            <p className="mt-5 text-xs text-white/30 animate-fade-in-up animation-delay-450">
              Free to get started — no credit card required.
            </p>
          </div>

          {/* ── Right column: dashboard mockup ────────────────────────── */}
          <div className="relative mx-auto w-full max-w-lg lg:max-w-none animate-fade-in-up animation-delay-200">
            {/* Soft glow behind the dashboard */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-8 rounded-3xl bg-brand/8 blur-2xl"
            />

            <DashboardMockup className="relative" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Private — Hero background
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Renders the dark atmospheric football-pitch background.
 *
 * Uses layered CSS gradients and subtle geometric pitch markings to create a
 * matchday feel without any external images.  The effect is purely decorative
 * and hidden from assistive technology.
 */
function HeroBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {/* Base gradient — dark with a subtle cool blue-teal undertone */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B1218] via-[#0A1419] to-[#0B1218]" />

      {/* Floodlight glow — top centre */}
      <div className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/6 blur-[120px]" />

      {/* Subtle vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,#0B1218_100%)]" />

      {/* Pitch markings — centre circle */}
      <svg
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.03]"
        width="600"
        height="600"
        viewBox="0 0 600 600"
      >
        <circle cx="300" cy="300" r="120" stroke="white" strokeWidth="1" fill="none" />
        <line x1="300" y1="0" x2="300" y2="600" stroke="white" strokeWidth="1" />
        <circle cx="300" cy="300" r="4" fill="white" />
      </svg>

      {/* Pitch markings — horizontal touchlines */}
      <div className="absolute inset-x-0 top-[30%] h-px bg-white/[0.025]" />
      <div className="absolute inset-x-0 top-[70%] h-px bg-white/[0.025]" />
    </div>
  );
}
