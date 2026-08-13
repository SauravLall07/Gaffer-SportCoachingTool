/**
 * Brand configuration for the Sport Coaching Tool.
 *
 * Centralises the product name, tagline and design tokens so they can be
 * updated in a single place and referenced throughout every component.
 */

export const brand = {
  /** Display name shown in the navbar, hero and meta tags. */
  name: "Sport Coaching Tool",

  /** Primary marketing tagline — do not alter wording without product approval. */
  tagline: "The football coaching platform built for the touchline.",

  /** Short supporting copy used in the hero description. */
  description:
    "Manage your squad, track matches in real time and build a complete history of your team\u2019s performance \u2014 all from one place.",
} as const;

/**
 * Colour tokens that map to the brand palette defined in the spec.
 *
 * These hex values are converted to oklch() inside `index.css` so Tailwind and
 * shadcn/ui components can consume them as CSS custom properties.  Keep this
 * object as the single source of truth for brand colours.
 */
export const brandColors = {
  /** Primary deep red — CTA buttons, logo accent, active states. */
  primaryRed: "#8B1E2D",
  /** Darker red — hover / pressed states for primary red. */
  darkRed: "#681522",
  /** Lighter red — highlights and secondary emphasis. */
  lightRed: "#B83246",

  /** Near-black used for dark-mode backgrounds. */
  darkBackground: "#111111",
  /** Slightly lifted surface for dark-mode cards / navbar. */
  darkSurface: "#181818",

  /** Warm off-white used for light-mode backgrounds. */
  lightBackground: "#F5F3F0",
  /** Pure white surface for light-mode cards. */
  lightSurface: "#FFFFFF",

  /** Primary text colour in light mode. */
  darkText: "#171717",
  /** Primary text colour in dark mode. */
  lightText: "#F5F5F5",

  /** Secondary / muted text for both themes. */
  mutedText: "#737373",

  /** Subtle border colour in light mode. */
  lightBorder: "#D9D6D2",
  /** Subtle border colour in dark mode. */
  darkBorder: "#2A2A2A",
} as const;
