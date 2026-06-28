"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import SearchBar from "@/components/SearchBar";
import RecentAnalyses, { CacheAnalysisItem } from "@/components/RecentAnalyses";
import ResponsiveHeroBanner from "@/components/ui/responsive-hero-banner";
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
    <div className="flex-1 w-full bg-[#F8F8F6] text-[#1A1A1A]">
      <ResponsiveHeroBanner
        title="Investment Research"
        titleLine2="AI Investment Analyst"
        description="Autonomously inspect financial statement ratios, compute market sentiment metrics, map moat durability, and formulate actionable verdicts using a local custom neural network."
        partners={[]}
      >
        <div id="search" className="mt-8 max-w-2xl mx-auto">
          <SearchBar onSearch={handleSearch} isLoading={false} />
        </div>
      </ResponsiveHeroBanner>

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto px-6 py-16 space-y-20">
        {/* Core Capabilities Feature Grid */}
        <div id="features" className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
          {[
            {
              title: "On-device execution",
              desc: "Zero API fees. Runs local PyTorch neural network towers powered by Apple Silicon MPS.",
              icon: Zap,
              color: "text-amber-600"
            },
            {
              title: "Private document RAG",
              desc: "Upload local reports and PDFs. Split, embed, and query chunks locally on-the-fly.",
              icon: Target,
              color: "text-violet-600"
            },
            {
              title: "Auditable synthesis",
              desc: "Deep inspection of cross-attention weights and relative impact scores for complete transparency.",
              icon: ShieldCheck,
              color: "text-emerald-600"
            }
          ].map((feat, i) => {
            const Icon = feat.icon;
            return (
              <div key={i} className="bg-white border border-[rgba(0,0,0,0.07)] rounded-[12px] p-8 space-y-4 shadow-sm">
                <div className={`p-3 bg-[#F8F8F6] border border-[rgba(0,0,0,0.07)] rounded-xl w-fit ${feat.color}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-medium text-[#1A1A1A]">{feat.title}</h3>
                <p className="text-xs text-[#6B6B6B] leading-relaxed">{feat.desc}</p>
              </div>
            );
          })}
        </div>

        {/* History Log cache */}
        <div className="border-t border-[rgba(0,0,0,0.07)] pt-16">
          <RecentAnalyses onSelect={handleHistorySelect} refreshTrigger={historyTrigger} />
        </div>
      </div>
    </div>
  );
}
