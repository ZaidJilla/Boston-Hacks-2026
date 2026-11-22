import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { APP_NAME } from "@/lib/config";
import BottomNav from "@/components/nav/BottomNav";
import RouteTransition from "@/components/nav/RouteTransition";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800", "900"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Unlock Boston, one neighborhood at a time.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#000000" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">
        <AuthProvider>
          <main className="min-h-screen pb-nav">{children}</main>
          <BottomNav />
          <RouteTransition />
        </AuthProvider>
      </body>
    </html>
  );
}
