"use client";

import React from "react";
import { CheckCircle2, AlertTriangle, Globe, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { InvestmentVerdict } from "@/types/agent";

interface VerdictCardProps {
  companyName: string;
  ticker: string | null;
  verdict: InvestmentVerdict;
  confidence: number;
  bullCase: string[];
  bearCase: string[];
  dataSourcesUsed: string[];
  description?: string;
  logoUrl?: string;
}

export default function VerdictCard({
  companyName,
  ticker,
  verdict,
  confidence,
  bullCase,
  bearCase,
  dataSourcesUsed,
  description,
  logoUrl,
}: VerdictCardProps) {
  const isInvest = verdict === "INVEST";
  const isPass = verdict === "PASS";
  
  let colorTheme = {
    text: "text-amber-400",
    bg: "bg-amber-500/5",
    border: "border-amber-500/20",
    dot: "bg-amber-500",
    stroke: "#d97706"
  };

  if (isInvest) {
    colorTheme = {
      text: "text-emerald-400",
      bg: "bg-emerald-500/5",
      border: "border-emerald-500/20",
      dot: "bg-emerald-500",
      stroke: "#10b981"
    };
  } else if (isPass) {
    colorTheme = {
      text: "text-rose-400",
      bg: "bg-rose-500/5",
      border: "border-rose-500/20",
      dot: "bg-rose-500",
      stroke: "#f43f5e"
    };
  }

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-6 md:p-8 backdrop-blur space-y-6">
      
      {/* Header Info */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono tracking-widest text-slate-500 uppercase">
            {ticker ? `${ticker} • Equity Security` : "Private Enterprise"}
          </span>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${colorTheme.bg} ${colorTheme.border} ${colorTheme.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${colorTheme.dot}`} />
            {verdict}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {logoUrl && (
            <img 
              src={logoUrl} 
              alt={`${companyName} Logo`} 
              className="w-10 h-10 rounded-lg object-contain bg-white p-1 border border-slate-800"
              onError={(e) => {
                const img = e.currentTarget;
                if (img.src.includes("clearbit.com")) {
                  const parts = img.src.split("/");
                  const domain = parts[parts.length - 1] || "";
                  if (domain) {
                    img.src = `https://www.google.com/s2/favicons?sz=128&domain=${domain}`;
                    return;
                  }
                }
                img.style.display = 'none';
              }}
            />
          )}
          <h2 className="text-4xl font-normal text-white tracking-tight font-serif">
            {companyName}
          </h2>
        </div>

        {description && (
          <p className="text-xs text-slate-400 leading-relaxed font-sans">{description}</p>
        )}
      </div>

      {/* Conviction Metric (Sleek Inline Bar instead of circular progress) */}
      <div className="p-4 bg-slate-900/30 border border-slate-850 rounded-xl space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 font-medium">Model Conviction Metric</span>
          <span className={`font-mono font-bold ${colorTheme.text}`}>{confidence}%</span>
        </div>
        <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-1000 ease-out ${colorTheme.dot}`}
            style={{ width: `${confidence}%` }}
          />
        </div>
        <div className="text-[9px] text-slate-500 font-mono">
          Composite recommendation score
        </div>
      </div>

      {/* Structured Cases Grid */}
      <div className="space-y-4">
        {/* Bull Case */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-widest flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Investment Drivers</span>
          </h4>
          <ul className="space-y-2">
            {bullCase.slice(0, 3).map((item, index) => (
              <li key={index} className="flex gap-2 items-start text-xs text-slate-350 leading-relaxed">
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500/60 flex-shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
            {bullCase.length === 0 && (
              <li className="text-xs text-slate-500 italic">No specific investment drivers identified.</li>
            )}
          </ul>
        </div>

        <div className="border-t border-slate-900 my-2" />

        {/* Bear Case */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-widest flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span>Risk Factors</span>
          </h4>
          <ul className="space-y-2">
            {bearCase.slice(0, 3).map((item, index) => (
              <li key={index} className="flex gap-2 items-start text-xs text-slate-350 leading-relaxed">
                <ArrowDownRight className="w-3.5 h-3.5 text-rose-500/60 flex-shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
            {bearCase.length === 0 && (
              <li className="text-xs text-slate-500 italic">No specific risk triggers identified.</li>
            )}
          </ul>
        </div>
      </div>

      {/* Verified Sources Footer */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-slate-900 pt-4 text-[9px] text-slate-500 font-mono">
        <span className="flex items-center gap-1 mr-1">
          <Globe className="w-3 h-3" />
          Verified Channels:
        </span>
        {dataSourcesUsed.map((src, i) => (
          <span key={i} className="bg-slate-900 border border-slate-800/80 px-2 py-0.5 rounded text-slate-400">
            {src}
          </span>
        ))}
      </div>
    </div>
  );
}
