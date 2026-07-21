---
name: Agni Operational System
colors:
  surface: '#f9f9ff'
  surface-dim: '#d9d9e0'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f9'
  surface-container: '#ededf4'
  surface-container-high: '#e7e8ee'
  surface-container-highest: '#e2e2e8'
  on-surface: '#191c20'
  on-surface-variant: '#424750'
  inverse-surface: '#2e3035'
  inverse-on-surface: '#f0f0f6'
  outline: '#737781'
  outline-variant: '#c2c6d2'
  surface-tint: '#2c5fa1'
  primary: '#003162'
  on-primary: '#ffffff'
  primary-container: '#054788'
  on-primary-container: '#8ab7ff'
  inverse-primary: '#a7c8ff'
  secondary: '#2b5ea5'
  on-secondary: '#ffffff'
  secondary-container: '#84b1fe'
  on-secondary-container: '#004286'
  tertiary: '#542200'
  on-tertiary: '#ffffff'
  tertiary-container: '#773300'
  on-tertiary-container: '#ff9d65'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d5e3ff'
  primary-fixed-dim: '#a7c8ff'
  on-primary-fixed: '#001b3c'
  on-primary-fixed-variant: '#044788'
  secondary-fixed: '#d6e3ff'
  secondary-fixed-dim: '#a9c7ff'
  on-secondary-fixed: '#001b3d'
  on-secondary-fixed-variant: '#00468c'
  tertiary-fixed: '#ffdbca'
  tertiary-fixed-dim: '#ffb68e'
  on-tertiary-fixed: '#331200'
  on-tertiary-fixed-variant: '#773300'
  background: '#f9f9ff'
  on-background: '#191c20'
  surface-variant: '#e2e2e8'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  mono-data:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: -0.01em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 64px
  container-max: 1440px
  gutter: 24px
---

## Brand & Style
This design system is built on the principles of **Swiss Minimalism**, prioritizing clarity, objectivity, and operational efficiency for fleet management. The brand personality is professional and authoritative, yet technologically advanced through its integration of AI.

The aesthetic utilizes a strict geometric grid and generous whitespace to reduce cognitive load in data-heavy environments. It employs a "flat surface" philosophy where depth is communicated through clear tonal shifts and crisp borders rather than organic shadows. The experience should feel like a high-performance instrument: precise, reliable, and instantaneous.

## Colors
The palette is rooted in a "Deep Nautical" spectrum to establish trust and professional stability. 

- **Primary & Secondary Blues:** Used for structural branding and navigation elements. 
- **Accent Yellow (#F7D03D):** This is a high-visibility, scarce resource. It is reserved exclusively for the AI Assistant interface and the single most important "Primary Action" on any given screen.
- **Functional Grays:** A cool-toned scale (derived from the primary blue) ensures the UI feels cohesive and modern.
- **Success/Destructive:** High-saturation tones for immediate operational feedback.

In **Dark Mode**, the system shifts to a high-contrast "Command Center" aesthetic, utilizing deep navy surfaces and brighter blue primary accents to maintain legibility in low-light environments.

## Typography
Inter is the sole typeface, utilized for its neutral, highly legible Swiss-style characteristics. 

- **Weight Usage:** Use **300 (Light)** for large display type to maintain a sophisticated, minimalist feel. Use **500 (Medium)** for labels and **600-700 (Bold)** for headlines to ensure hierarchy in dense data views.
- **Data Display:** For tabular data and vehicle IDs, use `mono-data` (Standard Inter with slightly tighter tracking) to maintain alignment and readability.
- **Hierarchy:** Maintain a strict "top-down" hierarchy. Every page must have a single `headline-lg` that defines the view’s purpose.

## Layout & Spacing
The layout follows a **12-column fluid grid** for desktop and a **4-column grid** for mobile. 

- **Grid Philosophy:** Elements should snap to the grid. In dense operational dashboards, use the 8px (sm) and 16px (md) increments to group related information.
- **White Space:** Do not fear empty space. Use `xl` and `2xl` spacing to separate major sections, which prevents the "cluttered" look common in industrial software.
- **Safe Margins:** A minimum margin of 24px is required on all viewport edges for desktop, reducing to 16px on mobile.

## Elevation & Depth
In line with Swiss Minimalism, depth is created through **Low-contrast outlines** and **Tonal layering** rather than traditional drop shadows.

- **Level 0 (Background):** Use the system background color.
- **Level 1 (Cards/Content):** Pure white (light mode) or surface blue (dark mode) with a 1px border (`border_light` or `border_dark`). 
- **Level 2 (Overlays/Modals):** These are the only elements allowed to have a shadow. Use a very subtle, sharp shadow: `0 4px 12px rgba(0, 0, 0, 0.08)`.
- **Active State:** Elements indicate focus through a 2px stroke of the `primary_color`, never through a "glow" or "blur."

## Shapes
The shape language is strictly geometric. 

- **Functional Elements:** Buttons, inputs, and tags use a `4px` or `8px` (Soft) radius to maintain a professional, slightly technical look.
- **Container Elements:** Large cards and main content areas use a `12px` or `16px` radius (`rounded-lg` / `rounded-xl`) to frame content elegantly.
- **Iconography:** Use 24px bounding boxes with a 2px stroke weight. Icons should be functional and geometric, avoiding unnecessary decorative details.

## Components
- **Buttons:** 
  - **Primary:** `primary_color` background, white text, 4px radius. 
  - **AI/Urgent:** `accent_color` background, `foreground_light` text. Used sparingly.
  - **Secondary:** Transparent background with 1px `border_light`.
- **Cards:** 1px border, 16px radius, no shadow. White background in light mode. Use `title-lg` for card headers.
- **Input Fields:** 8px radius, `background_light` fill, 1px `border_light`. On focus, border changes to `primary_color` with no outer glow.
- **Chips/Status:** For "Active" vehicles, use a subtle green tint background with `success_color` text. All status indicators use `label-md` uppercase.
- **Data Tables:** No vertical borders. 1px horizontal dividers only. Header row should be `muted_light_bg` with `label-md` text weight 600.
- **AI Assistant Widget:** Always anchored to the bottom-right. Circular or 12px radius, utilizing the `accent_color` to distinguish it from standard system notifications.