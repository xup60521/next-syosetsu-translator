import "@/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";

import { TRPCReactProvider } from "@/trpc/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
    title: "Syosetsu Translator",
    description: "Syosetsu Translator made with Next.js and tRPC",
    icons: [{ rel: "icon", url: "/icon.png" }],
};

const geist = Geist({
    subsets: ["latin"],
    variable: "--font-geist-sans",
});

export default function RootLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en" className={`${geist.variable}`} suppressHydrationWarning>
            <body>
                <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                >
                    <Toaster position="top-center" />
                    <TRPCReactProvider>{children}</TRPCReactProvider>
                </ThemeProvider>
            </body>
        </html >
    );
}
