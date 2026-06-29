"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import HeroSection from "@/components/HeroSection";
import RecentAnalyses, { CacheAnalysisItem } from "@/components/RecentAnalyses";
import { Zap, ShieldCheck, Target } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const [historyTrigger, setHistoryTrigger] = useState(0);

  const handleSearch = (companyName: string, vectorStoreId: string | null, fileName: string | null) => {
    const encodedCompany = encodeURIComponent(companyName);
    let url = `/analyze/${encodedCompany}`;
    const params = new URLSearchParams();
    
    if (vectorStoreId) {
      params.set("vectorStoreId", vectorStoreId);
    }
    if (fileName) {
      params.set("fileName", fileName);
    }
    
    const queryStr = params.toString();
    if (queryStr) {
      url += `?${queryStr}`;
    }
    
    router.push(url);
  };

  const handleHistorySelect = (item: CacheAnalysisItem) => {
    router.push(`/analyze/${encodeURIComponent(item.companyName)}`);
  };

  return (
    <div className="flex-1 w-full bg-[#F8F8F6] dark:bg-[#0a0b0f] text-[#1A1A1A] dark:text-slate-100 flex flex-col justify-start transition-colors duration-300">
      <HeroSection onSearch={handleSearch} isLoading={false} />

      {/* Main Content Area */}
      <div className="max-w-6xl w-full mx-auto px-6 py-16 space-y-20 relative z-10">
        {/* Core Capabilities Feature Grid */}
        <div id="features" className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
          {[
            {
              title: "On-device execution",
              desc: "Zero API fees. Runs local PyTorch neural network towers powered by Apple Silicon MPS.",
              icon: Zap,
              color: "text-amber-600 dark:text-amber-400"
            },
            {
              title: "Private document RAG",
              desc: "Upload local reports and PDFs. Split, embed, and query chunks locally on-the-fly.",
              icon: Target,
              color: "text-indigo-600 dark:text-indigo-400"
            },
            {
              title: "Auditable synthesis",
              desc: "Deep inspection of cross-attention weights and relative impact scores for complete transparency.",
              icon: ShieldCheck,
              color: "text-emerald-600 dark:text-emerald-400"
            }
          ].map((feat, i) => {
            const Icon = feat.icon;
            return (
              <div key={i} className="bg-white dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/[0.06] hover:border-slate-350 dark:hover:border-indigo-500/30 rounded-xl p-8 space-y-4 hover:bg-slate-50/50 dark:hover:bg-white/[0.04] transition duration-150 group shadow-sm dark:shadow-none">
                <div className={`p-3 bg-slate-100 dark:bg-white/[0.04] border border-slate-200/60 dark:border-white/[0.06] rounded-xl w-fit ${feat.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-[#1A1A1A] dark:text-white font-space-grotesk">{feat.title}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{feat.desc}</p>
              </div>
            );
          })}
        </div>

        {/* History Log cache */}
        <div className="border-t border-slate-200/60 dark:border-white/[0.06] pt-16">
          <RecentAnalyses onSelect={handleHistorySelect} refreshTrigger={historyTrigger} />
        </div>
      </div>
    </div>
  );
}

