import type { Metadata } from "next";
import { SN_Pro, Special_Elite } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

// Three faces: Londrina Solid is the logo's, kept for the wordmark alone; Special Elite sets titles
// and buttons; SN Pro sets everything else.
const logo = localFont({
  src: "../assets/logo/fonts/LondrinaSolid-Regular.woff2",
  weight: "400",
  variable: "--font-logo",
});
// Special Elite comes in one weight; titles ask for 700, so the browser thickens it.
const display = Special_Elite({ weight: "400", subsets: ["latin"], variable: "--font-display" });
const text = SN_Pro({ subsets: ["latin", "latin-ext"], variable: "--font-text" });

export const metadata: Metadata = {
  title: "audiopost",
  description: "Browse and play any tumblr blog's audio posts.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${logo.variable} ${display.variable} ${text.variable}`}>
      <body>
        {children}
        <footer>
          <p>
            <a href="https://github.com/cwfreelance/audiopost/issues/new">
              Bug? Report on GitHub
            </a>
          </p>
          <p>
            Inspired by <a href="https://topherchris.com/about">topherchris</a>&apos;s Tumblr Audio Parser
          </p>
          <p>
            This application uses the tumblr application programming interface
            but is not endorsed or certified by tumblr, Inc.
          </p>
        </footer>
      </body>
    </html>
  );
}
