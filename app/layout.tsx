import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono, Outfit } from "next/font/google";
import GlobalHeader from "./components/global-header";
import SideRailNav from "./components/side-rail-nav";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Fast-fingers Universe",
    template: "%s | Fast-fingers Universe",
  },
  description:
    "Modern typing platform for speed tests, multiplayer battles, and ranked competition.",
  icons: {
    icon: [
      { url: "/images/ff-transparent.png", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    shortcut: ["/images/ff-transparent.png"],
    apple: [{ url: "/images/ff-transparent.png", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var key='fastfingers:theme';var t=localStorage.getItem(key);if(!t||t==='nebula'){document.documentElement.removeAttribute('data-theme');return;}if(t==='ocean'||t==='carbon'){document.documentElement.setAttribute('data-theme',t);}else{document.documentElement.removeAttribute('data-theme');}}catch(e){document.documentElement.removeAttribute('data-theme');}})();`,
          }}
        />
      </head>
      <body
        className={`${outfit.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
      >
        <SideRailNav />
        <div className="site-shell">
          <GlobalHeader />
        </div>
        {children}
      </body>
    </html>
  );
}
