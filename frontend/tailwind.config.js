/**
 * Agni Operational System design tokens, ported from
 * ../stitch_agni_smart_fleet_design_system/agni_operational_system/DESIGN.md.
 *
 * preflight is OFF on purpose: the app is mid-migration from a legacy plain
 * CSS system (src/index.css) to this one. Turning preflight on would reset
 * global element defaults (margins, headings, form controls, etc.) that the
 * not-yet-migrated pages still rely on. Flip it on once every page has been
 * moved to Tailwind and the legacy CSS is deleted.
 */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        surface: '#f9f9ff',
        'surface-dim': '#d9d9e0',
        'surface-bright': '#f9f9ff',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f3f3f9',
        'surface-container': '#ededf4',
        'surface-container-high': '#e7e8ee',
        'surface-container-highest': '#e2e2e8',
        'surface-variant': '#e2e2e8',
        'on-surface': '#191c20',
        'on-surface-variant': '#424750',
        'inverse-surface': '#2e3035',
        'inverse-on-surface': '#f0f0f6',
        outline: '#737781',
        'outline-variant': '#c2c6d2',
        'surface-tint': '#2c5fa1',
        primary: '#003162',
        'on-primary': '#ffffff',
        'primary-container': '#054788',
        'on-primary-container': '#8ab7ff',
        'inverse-primary': '#a7c8ff',
        'primary-fixed': '#d5e3ff',
        'primary-fixed-dim': '#a7c8ff',
        'on-primary-fixed': '#001b3c',
        'on-primary-fixed-variant': '#044788',
        secondary: '#2b5ea5',
        'on-secondary': '#ffffff',
        'secondary-container': '#84b1fe',
        'on-secondary-container': '#004286',
        'secondary-fixed': '#d6e3ff',
        'secondary-fixed-dim': '#a9c7ff',
        'on-secondary-fixed': '#001b3d',
        'on-secondary-fixed-variant': '#00468c',
        tertiary: '#542200',
        'on-tertiary': '#ffffff',
        'tertiary-container': '#773300',
        'on-tertiary-container': '#ff9d65',
        'tertiary-fixed': '#ffdbca',
        'tertiary-fixed-dim': '#ffb68e',
        'on-tertiary-fixed': '#331200',
        'on-tertiary-fixed-variant': '#773300',
        error: '#ba1a1a',
        'on-error': '#ffffff',
        'error-container': '#ffdad6',
        'on-error-container': '#93000a',
        background: '#f9f9ff',
        'on-background': '#191c20',
        // Not in DESIGN.md's color table but named explicitly in its "Brand &
        // Style" prose: "Accent Yellow (#F7D03D) ... reserved exclusively
        // for the AI Assistant interface and the single most important
        // Primary Action on any given screen."
        accent: '#f7d03d',
        'on-accent': '#191c20',
      },
      borderRadius: {
        sm: '0.125rem',
        DEFAULT: '0.25rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px',
      },
      spacing: {
        unit: '4px',
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        '2xl': '48px',
        '3xl': '64px',
        'container-max': '1440px',
        gutter: '24px',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        'display-lg': ['Inter', 'sans-serif'],
        'headline-lg': ['Inter', 'sans-serif'],
        'headline-lg-mobile': ['Inter', 'sans-serif'],
        'headline-md': ['Inter', 'sans-serif'],
        'title-lg': ['Inter', 'sans-serif'],
        'body-lg': ['Inter', 'sans-serif'],
        'body-md': ['Inter', 'sans-serif'],
        'label-md': ['Inter', 'sans-serif'],
        'mono-data': ['Inter', 'sans-serif'],
      },
      fontSize: {
        'display-lg': ['48px', { lineHeight: '56px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-lg': ['32px', { lineHeight: '40px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'headline-lg-mobile': ['24px', { lineHeight: '32px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'headline-md': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'title-lg': ['20px', { lineHeight: '28px', fontWeight: '600' }],
        'body-lg': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'body-md': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'label-md': ['12px', { lineHeight: '16px', letterSpacing: '0.02em', fontWeight: '500' }],
        'mono-data': ['14px', { lineHeight: '20px', letterSpacing: '-0.01em', fontWeight: '400' }],
      },
      maxWidth: {
        'container-max': '1440px',
      },
      boxShadow: {
        // Elevation & Depth: "These are the only elements allowed to have a
        // shadow" — Level 2 overlays/modals only.
        overlay: '0 4px 12px rgba(0, 0, 0, 0.08)',
      },
    },
  },
  plugins: [],
};
