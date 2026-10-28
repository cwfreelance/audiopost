import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

// Londrina Solid is the wordmark's face, used for titles; Atkinson Hyperlegible Next sets everything else.
const display = localFont({
  src: [
    { path: "../assets/logo/fonts/LondrinaSolid-Light.woff2", weight: "300" },
    { path: "../assets/logo/fonts/LondrinaSolid-Regular.woff2", weight: "400" },
  ],
  variable: "--font-display",
});
// Next has no fallback metrics for this family, so it skips building a size-adjusted fallback.
const text = Atkinson_Hyperlegible_Next({
  subsets: ["latin", "latin-ext"],
  variable: "--font-text",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "audiopost",
  description: "Browse and play any Tumblr blog's audio posts.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${text.variable}`}>
      <body>
        {children}
        <footer>
          <p>
            <a href="https://github.com/cwfreelance/audiopost/issues/new">
              Bug? Report on GitHub
            </a>
          </p>
          <p>
            A revival of Topherchris&apos;s Tumblr Audio Parser, which went
            offline years ago.
          </p>
          <p>
            This application uses the Tumblr application programming interface
            but is not endorsed or certified by Tumblr, Inc.
          </p>
        </footer>
      </body>
    </html>
  );
}
