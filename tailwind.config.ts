import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        heading: ["Barlow Semi Condensed", "system-ui", "sans-serif"],
        sans: ["Atkinson Hyperlegible", "system-ui", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          text: "hsl(var(--success-text))",
        },
        alert: "hsl(var(--alert))",
        /** Cores da bandeira de SC, só para a faixa institucional do cabeçalho. */
        flag: { red: "#D7042B", white: "#FFFFFF", green: "#008448" },
      },
      borderRadius: {
        // Hierarquia: controles 10 px, cartões 14 px, folha de comparação reta (laudo).
        md: "0.375rem",
        lg: "0.625rem",
        xl: "0.875rem",
      },
      keyframes: {
        scan: { "0%": { top: "0%" }, "100%": { top: "100%" } },
      },
      animation: {
        scan: "scan 1.6s ease-in-out infinite alternate",
      },
    },
  },
  plugins: [],
} satisfies Config;
