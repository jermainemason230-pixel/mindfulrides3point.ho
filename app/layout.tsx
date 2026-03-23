import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: "Mindful Rides",
  description: "Non-Emergency Medical Transportation Booking Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-white text-black">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
