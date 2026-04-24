import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { Web3Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrustNomiks - Token Management Platform",
  description: "Secure token management and analytics for crypto tokenomics",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <Web3Providers>
            {children}
          </Web3Providers>
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
