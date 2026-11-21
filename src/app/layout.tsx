import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import BottomNav from "@/components/nav/BottomNav";

export const metadata: Metadata = {
  title: "[NAME]",
  description: "Unlock Boston, one neighborhood at a time.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AuthProvider>
          <main className="pb-16 min-h-screen">{children}</main>
          <BottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
