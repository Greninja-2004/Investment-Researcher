import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { Brain, Sparkles } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Investment Research Agent",
  description: "Autonomously research stocks, balance sheets, and market trends using a local custom neural network model.",
};

export default function RootLayout({
  children,
  ...props
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#F8F8F6] dark:bg-[#0a0b0f] text-[#1A1A1A] dark:text-slate-100 selection:bg-indigo-500/30 selection:text-indigo-200 transition-colors duration-300">
        
        {/* Navigation Navbar */}
        <header className="border-b border-slate-200/60 dark:border-white/[0.06] bg-white/85 dark:bg-[#0a0b0f]/80 backdrop-blur-md sticky top-0 z-50 transition-colors duration-300">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="p-2 bg-gradient-to-tr from-indigo-500 to-violet-600 rounded-xl text-white group-hover:scale-105 transition duration-150 shadow-md shadow-indigo-500/10">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-[#1A1A1A] dark:text-white tracking-wide font-space-grotesk">
                  Investment Research
                </h1>
                <p className="text-[9px] font-mono text-slate-500 dark:text-slate-400">AI INVESTMENT INTELLIGENCE</p>
              </div>
            </Link>

            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="text-xs font-semibold text-slate-600 dark:text-slate-350 hover:text-slate-900 dark:hover:text-white uppercase tracking-wider transition border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 px-3.5 py-2 rounded-xl bg-white/50 dark:bg-white/[0.02]"
              >
                New Analysis
              </Link>
              
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white uppercase tracking-wider transition hidden sm:inline mr-1"
              >
                GitHub Codebase
              </a>

              <ThemeToggle />
            </div>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 flex flex-col justify-start">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-200/60 dark:border-white/[0.06] bg-white dark:bg-[#0a0b0f] py-8 text-center text-[10px] font-mono text-slate-500 space-y-2 transition-colors duration-300">
          <div className="flex items-center justify-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
            <span>Built using a local custom PyTorch model & Next.js</span>
          </div>
          <p>© 2026 AI Investment Agent. Designed for recruiting technical assignments.</p>
        </footer>

      </body>
    </html>
  );
}

