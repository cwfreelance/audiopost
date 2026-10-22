import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "audiopost",
  description: "Browse and play any Tumblr blog's audio posts.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
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
