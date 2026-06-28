"use client";

import React, { useState, useEffect } from "react";
import { History, Trash2, ArrowRight } from "lucide-react";
import { InvestmentVerdict } from "@/types/agent";

export interface CacheAnalysisItem {
  companyName: string;
  ticker: string | null;
  verdict: InvestmentVerdict;
  confidence: number;
  timestamp: string;
  reasoning: string;
  bullCase: string[];
  bearCase: string[];
  keyRisks: string[];
  dataSourcesUsed: string[];
  financialData: any;
  newsData: any;
  competitorData: any;
  riskData: any;
  companyData: any;
}

interface RecentAnalysesProps {
  onSelect: (item: CacheAnalysisItem) => void;
  onClearAll?: () => void;
  refreshTrigger?: number;
}

export default function RecentAnalyses({ onSelect, refreshTrigger = 0 }: RecentAnalysesProps) {
  const [history, setHistory] = useState<CacheAnalysisItem[]>([]);

  // Load history from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("investment_research_history");
      if (stored) {
        const parsed = JSON.parse(stored) as CacheAnalysisItem[];
        // Sort newest first
        setHistory(parsed.slice(0, 5));
      } else {
        setHistory([]);
      }
    } catch (err) {
      console.error("Failed to read search history from localStorage", err);
    }
  }, [refreshTrigger]);

  const clearHistory = () => {
    localStorage.removeItem("investment_research_history");
    setHistory([]);
  };

  if (history.length === 0) return null;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.07)] pb-2">
        <h4 className="text-xs font-semibold text-[#6B6B6B] uppercase tracking-wider flex items-center gap-1.5">
          <History className="w-3.5 h-3.5" />
          <span>Recent Analysis History</span>
        </h4>
        <button
          onClick={clearHistory}
          className="text-[10px] font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer transition"
        >
          <Trash2 className="w-3 h-3" />
          <span>Clear History</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {history.map((item, idx) => {
          const isInvest = item.verdict === "INVEST";
          const dateStr = new Date(item.timestamp).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
          });

          return (
            <div
              key={idx}
              onClick={() => onSelect(item)}
              className="bg-white border border-[rgba(0,0,0,0.07)] hover:border-slate-300 rounded-[12px] p-5 shadow-sm transition duration-150 cursor-pointer flex flex-col justify-between group relative overflow-hidden"
            >
              <div className="space-y-1.5 relative z-10">
                <div className="flex justify-between items-start gap-2">
                  <span className="text-[9px] font-mono text-[#9B9B9B]">{dateStr}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase ${
                    isInvest 
                      ? "bg-[#EAF3DE] border-[#EAF3DE] text-[#3B6D11]" 
                      : item.verdict === "PASS"
                      ? "bg-[#FCEBEB] border-[#FCEBEB] text-[#A32D2D]"
                      : "bg-[#FAEEDA] border-[#FAEEDA] text-[#633806]"
                  }`}>
                    {item.verdict}
                  </span>
                </div>
                
                <h5 className="text-[15px] font-medium text-[#1A1A1A] group-hover:text-violet-600 transition line-clamp-1">
                  {item.companyName}
                </h5>
                <p className="text-[10px] font-mono text-[#9B9B9B]">
                  {item.ticker ? `Ticker: ${item.ticker}` : "Private Entity"} • Confidence: {item.confidence}%
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-[rgba(0,0,0,0.05)] pt-3 relative z-10">
                <span className="text-[10px] text-[#6B6B6B] group-hover:text-[#1A1A1A] transition">
                  Load Analysis Results
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-[#9B9B9B] group-hover:text-[#1A1A1A] group-hover:translate-x-0.5 transition duration-150" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
export function saveAnalysisToCache(item: Omit<CacheAnalysisItem, "timestamp">) {
  try {
    const stored = localStorage.getItem("investment_research_history");
    let historyList: CacheAnalysisItem[] = [];
    if (stored) {
      historyList = JSON.parse(stored) as CacheAnalysisItem[];
    }
    
    // Remove if company name already exists to prevent duplicate cards
    historyList = historyList.filter(h => h.companyName.toLowerCase() !== item.companyName.toLowerCase());
    
    // Add to front of queue
    historyList.unshift({
      ...item,
      timestamp: new Date().toISOString()
    });

    // Limit size to 10
    localStorage.setItem("investment_research_history", JSON.stringify(historyList.slice(0, 10)));
  } catch (err) {
    console.error("Failed to write to localStorage analysis cache", err);
  }
}
