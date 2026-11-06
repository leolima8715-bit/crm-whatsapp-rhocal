import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM WhatsApp | RHOCAL",
  description: "Atendimento e gestão de contatos via WhatsApp",
};

// Aplica o tema salvo antes da hidratação (evita piscar). Padrão: escuro.
const themeScript = `try{var t=localStorage.getItem("theme");document.documentElement.dataset.theme=t==="light"?"light":"dark"}catch(e){document.documentElement.dataset.theme="dark"}`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-app font-sans text-primary antialiased">{children}</body>
    </html>
  );
}
