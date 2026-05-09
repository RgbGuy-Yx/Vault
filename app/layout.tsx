import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vault | Private chats that disappear",
  description:
    "Create anonymous real-time chat rooms with no login, 10-minute auto-deletion, and instant destroy control.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
