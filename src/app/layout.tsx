import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { Brain, Sparkles, TrendingUp } from "lucide-react";

const inter = Inter({
  variable: "--font-inter",
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
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#F8F8F6] text-[#1A1A1A] selection:bg-violet-500/10 selection:text-violet-900">
        
        {/* Navigation Navbar */}
        <header className="border-b border-[rgba(0,0,0,0.07)] bg-white/85 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="p-2 bg-gradient-to-tr from-violet-600 to-indigo-600 rounded-xl text-white group-hover:scale-105 transition duration-150">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-sm font-semibold text-[#1A1A1A] tracking-wider">
                  Investment Research
                </h1>
                <p className="text-[9px] font-mono text-[#9B9B9B]">AI INVESTMENT INTELLIGENCE</p>
              </div>
            </Link>

            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="text-xs font-semibold text-[#6B6B6B] hover:text-[#1A1A1A] uppercase tracking-wider transition border border-[rgba(0,0,0,0.15)] hover:bg-[#F0F0EE] px-3.5 py-2 rounded-xl bg-white"
              >
                New Analysis
              </Link>
              
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-[#6B6B6B] hover:text-[#1A1A1A] uppercase tracking-wider transition hidden sm:inline"
              >
                GitHub Codebase
              </a>
            </div>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 flex flex-col justify-start">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-[rgba(0,0,0,0.07)] bg-white py-8 text-center text-[10px] font-mono text-[#9B9B9B] space-y-2">
          <div className="flex items-center justify-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-violet-500" />
            <span>Built using a local custom PyTorch model & Next.js</span>
          </div>
          <p>© 2026 AI Investment Agent. Designed for recruiting technical assignments.</p>
        </footer>

      </body>
    </html>
  );
}
