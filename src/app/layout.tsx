import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Iron Quant",
  description: "Personal Quant for Your Fitness",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // App-like feel
};

import { MobileContainer } from "@/components/layout/MobileContainer";
import { BottomNav } from "@/components/layout/BottomNav";
import { DataContextProvider } from "@/lib/data/context";
import { UIContextProvider } from "@/lib/ui/context";
import { GlobalComponents } from "@/components/layout/GlobalComponents";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className="antialiased bg-toss-grey-100 dark:bg-black text-toss-grey-900 dark:text-white">
        <DataContextProvider>
          <UIContextProvider>
            <MobileContainer>
              <div className="pb-20">
                {children}
              </div>
              <BottomNav />
              {/* Global Components needing Context access */}
              <GlobalComponents />
            </MobileContainer>
          </UIContextProvider>
        </DataContextProvider>
      </body>
    </html>
  );
}
