import type { Metadata } from "next";
import Script from "next/script";
import { Cormorant_Garamond, Inter } from "next/font/google";

import "./globals.css";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-serif",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Memorial AI — In Loving Memory",
  description:
    "Turn the words and voice a loved one left behind into a chattable, voice-enabled remembrance.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    title: "Memorial AI",
    description:
      "Turn the words and voice a loved one left behind into a chattable, voice-enabled remembrance.",
    type: "website",
    images: [{ url: "/og.svg", width: 1200, height: 630, alt: "Memorial AI" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body className="paper min-h-screen text-ink">
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col">
          <header className="px-6 pt-8 pb-4">
            <a href="/" className="inline-flex items-center gap-3">
              <span className="font-serif text-2xl tracking-tight text-ink">
                Memorial<span className="text-gold-500">.</span>AI
              </span>
              <span className="hidden text-sm uppercase tracking-[0.18em] text-ink-muted sm:inline">
                In Loving Memory
              </span>
            </a>
            <div className="divider-gold mt-4" />
          </header>

          <main className="flex-1 px-6 pb-16">{children}</main>

          <footer className="px-6 pb-8 pt-4 text-center text-xs text-ink-muted">
            <div className="divider-gold mb-4" />
            <p>
              Memorial AI is an interpretation built from material you upload. It is
              not the real person.
            </p>
          </footer>
        </div>

        {/* ElevenLabs Conversational AI widget. Loads the custom <elevenlabs-convai>
            element used by ChatPanel. Safe to ship on every page; it's small. */}
        <Script
          src="https://unpkg.com/@elevenlabs/convai-widget-embed"
          strategy="afterInteractive"
          async
          type="text/javascript"
        />
      </body>
    </html>
  );
}
