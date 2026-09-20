import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blindspot Edu — Turn Passive Lectures into Active Teachers",
  description:
    "Your lecture recording, taught properly — with receipts. Turn passive audio into structured pedagogical phases, concept graphs, and verifiable source timestamps.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className="min-h-screen bg-[#09090b] font-sans text-neutral-100 antialiased selection:bg-[#701a24]/40 selection:text-white"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
