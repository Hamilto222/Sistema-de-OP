import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OP Digital",
  description: "Sistema de Gestão de Ordens de Produção",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body className="bg-slate-50 text-slate-900 antialiased">{children}</body></html>;
}
