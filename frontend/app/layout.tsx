import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LLM Manager",
  description:
    "Servicio self-hosted para centralizar, administrar y crear LLMs y agentes de IA.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <body>{children}</body>
    </html>
  );
}
