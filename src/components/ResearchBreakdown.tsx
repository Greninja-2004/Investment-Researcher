"use client";

import React, { useState } from "react";
import { ShieldAlert, BarChart3, Newspaper, Trophy, ShieldCheck, Brain, Scale, ChevronDown } from "lucide-react";
import { AgentState } from "@/types/agent";

interface ResearchBreakdownProps {
  state: AgentState;
}

type TabType = "thesis" | "financials_news" | "risks" | "technical";

export default function ResearchBreakdown({ state }: ResearchBreakdownProps) {
  const [tab, setTab] = useState<TabType>("thesis");

  const formatCurrency = (val: number | null) => {
    if (val === null) return "N/A";
    const abs = Math.abs(val);
    if (abs >= 1e12) return `$${(val / 1e12).toFixed(1)}T`;
    if (abs >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
    return `$${val.toLocaleString()}`;
  };

  // Helper to parse **bold** texts so stars are not printed literally
  const formatBoldText = (text: string) => {
    const parts = text.split("**");
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        return <strong key={i} className="font-semibold text-white">{part}</strong>;
      }
      return part;
    });
  };

  const renderThesisMarkdown = (text: string) => {
    return text.split("\n").map((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("### ")) {
        return <h4 key={i} className="text-sm font-semibold text-slate-100 mt-4 mb-2">{formatBoldText(trimmed.slice(4))}</h4>;
      }
      if (trimmed.startsWith("## ")) {
        return <h3 key={i} className="text-md font-bold text-white mt-5 mb-3 border-b border-slate-800 pb-1">{formatBoldText(trimmed.slice(3))}</h3>;
      }
      if (trimmed.startsWith("# ")) {
        return <h2 key={i} className="text-lg font-black text-white mt-6 mb-4">{formatBoldText(trimmed.slice(2))}</h2>;
      }
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        return (
          <li key={i} className="ml-4 list-disc text-xs text-slate-300 leading-relaxed mb-1.5">
            {formatBoldText(trimmed.slice(2))}
          </li>
        );
      }
      if (trimmed === "") {
        return <div key={i} className="h-2.5" />;
      }
      return <p key={i} className="text-xs text-slate-300 leading-relaxed mb-3">{formatBoldText(trimmed)}</p>;
    });
  };

  const options: { id: TabType; label: string; icon: React.ComponentType<any> }[] = [
    { id: "thesis", label: "Executive Thesis & Moat", icon: ShieldCheck },
    { id: "financials_news", label: "Financials & News Sentiment", icon: BarChart3 },
    { id: "risks", label: "Risk Factor Matrix", icon: ShieldAlert },
    { id: "technical", label: "Technical Model Specs", icon: Brain }
  ];

  const currentOption = options.find(o => o.id === tab) || options[0];
  const ActiveIcon = currentOption.icon;

  return (
    <div className="w-full space-y-6">
      
      {/* Dropdown Navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-900 pb-4">
        <div className="flex items-center gap-2">
          <ActiveIcon className="w-4 h-4 text-violet-400" />
          <span className="text-xs font-mono uppercase tracking-widest text-slate-400">
            Report Section
          </span>
        </div>
        
        <div className="relative w-full sm:w-72">
          <select
            value={tab}
            onChange={(e) => setTab(e.target.value as any)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-200 hover:text-white focus:outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer appearance-none pr-10"
          >
            {options.map((opt) => (
              <option key={opt.id} value={opt.id} className="bg-slate-950 text-slate-300">
                {opt.label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
            <ChevronDown className="w-4.5 h-4.5" />
          </div>
        </div>
      </div>

      {/* Tab Panels */}
      <div className="min-h-[350px]">
        
        {/* PANEL: THESIS & MOAT */}
        {tab === "thesis" && (
          <div className="space-y-6">
            {/* Rationale */}
            <div className="glass-panel border-slate-800 rounded-2xl p-6 md:p-8 space-y-4">
              <h4 className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-450" />
                <span>Investment Committee Rationale</span>
              </h4>
              <div className="prose prose-invert max-w-none text-slate-350">
                {state.reasoning ? renderThesisMarkdown(state.reasoning) : (
                  <p className="text-xs text-slate-550 italic">No reasoning summary has been synthesized yet.</p>
                )}
              </div>
            </div>

            {/* Moat & Competitors */}
            {state.competitorData && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-panel border-slate-800 rounded-2xl p-6 space-y-4">
                  <h4 className="font-bold text-white text-sm flex items-center gap-1.5">
                    <Trophy className="w-4 h-4 text-amber-450" />
                    <span>Peer Competitors</span>
                  </h4>
                  <div className="space-y-2">
                    {state.competitorData.peers.map((peer, i) => (
                      <div key={i} className="bg-slate-950 border border-slate-850 px-3 py-2.5 rounded-xl text-xs font-mono text-slate-300 flex justify-between">
                        <span>{peer}</span>
                        <span className="text-[9px] bg-slate-900 border border-slate-800 px-1 py-0.5 rounded text-slate-500">Peer</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-2 glass-panel border-slate-800 rounded-2xl p-6 space-y-4">
                  <h4 className="font-bold text-white text-sm">Competitive Advantage & Moat Assessment</h4>
                  <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 border border-slate-905 p-4 rounded-xl">
                    {state.competitorData.moatAnalysis}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PANEL: FINANCIALS & NEWS */}
        {tab === "financials_news" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* LEFT COLUMN: FINANCIAL METRICS */}
            <div className="space-y-6">
              {state.financialData ? (
                <>
                  {/* Highlights grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Market Price", val: state.financialData.price ? `$${state.financialData.price.toFixed(2)}` : "N/A" },
                      { label: "Market Cap", val: formatCurrency(state.financialData.marketCap) },
                      { label: "Trailing P/E", val: state.financialData.peRatio ? state.financialData.peRatio.toFixed(1) : "N/A" },
                      { label: "Debt to Equity", val: state.financialData.debtToEquity ? (state.financialData.debtToEquity).toFixed(2) : "N/A" }
                    ].map((stat, i) => (
                      <div key={i} className="bg-slate-950 border border-slate-850 rounded-xl p-3.5">
                        <span className="text-[9px] font-mono text-slate-550 uppercase tracking-widest">{stat.label}</span>
                        <span className="text-lg font-bold text-slate-100 block mt-0.5">{stat.val}</span>
                      </div>
                    ))}
                  </div>

                  {/* Ratios Table */}
                  <div className="glass-panel border-slate-800 rounded-2xl p-5 space-y-4">
                    <h4 className="font-bold text-white text-sm flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-violet-400" />
                      <span>Financial Statement Audit Ratios</span>
                    </h4>
                    
                    <div className="space-y-3 font-mono text-xs">
                      {[
                        { label: "Return on Equity (ROE)", val: state.financialData.roe ? (state.financialData.roe * 100).toFixed(1) + "%" : "N/A", expected: "Healthy: >15%" },
                        { label: "Operating Margin", val: state.financialData.operatingMargin ? (state.financialData.operatingMargin * 100).toFixed(1) + "%" : "N/A", expected: "Healthy: >12%" },
                        { label: "Net Profit Margin", val: state.financialData.profitMargin ? (state.financialData.profitMargin * 100).toFixed(1) + "%" : "N/A", expected: "Healthy: >10%" },
                        { label: "Revenue Growth Rate", val: state.financialData.revenueGrowth ? (state.financialData.revenueGrowth * 100).toFixed(1) + "%" : "N/A", expected: "Growth: >0%" },
                        { label: "Current Ratio", val: state.financialData.currentRatio ? state.financialData.currentRatio.toFixed(2) : "N/A", expected: "Healthy: >1.2" },
                        { label: "Annual Free Cash Flow", val: formatCurrency(state.financialData.freeCashFlow), expected: "Generation: >0" }
                      ].map((item, i) => (
                        <div key={i} className="flex justify-between border-b border-slate-900 pb-2">
                          <span className="text-slate-400">{item.label}</span>
                          <div className="text-right">
                            <span className="text-slate-100 font-semibold">{item.val}</span>
                            <span className="text-[9px] text-slate-600 block mt-0.5">{item.expected}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="glass-panel border-slate-800 rounded-2xl p-8 text-center text-slate-500 italic text-xs">
                  No quantitative metrics resolved for this entity.
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: NEWS SENTIMENT */}
            <div className="space-y-6">
              {state.newsData ? (
                <>
                  {/* Sentiment Score indicator */}
                  <div className="glass-panel border-slate-800 rounded-2xl p-5 space-y-3.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-350 font-semibold">Overall Sentiment</span>
                      <span className={`font-black uppercase tracking-wider ${
                        state.newsData.overallSentiment === "Bullish" 
                          ? "text-emerald-450" 
                          : state.newsData.overallSentiment === "Bearish" 
                          ? "text-rose-450" 
                          : "text-amber-455"
                      }`}>
                        {state.newsData.overallSentiment}
                      </span>
                    </div>

                    <div className="h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-900 relative">
                      <div 
                        className={`h-full transition-all duration-1000 ${
                          state.newsData.overallSentiment === "Bullish" 
                            ? "bg-emerald-500" 
                            : state.newsData.overallSentiment === "Bearish" 
                            ? "bg-rose-500" 
                            : "bg-amber-500"
                        }`}
                        style={{ width: `${state.newsData.sentimentScore * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between font-mono text-[9px] text-slate-500">
                      <span>Bearish (0.0)</span>
                      <span className="text-slate-350 font-bold">{(state.newsData.sentimentScore * 100).toFixed(0)}/100</span>
                      <span>Bullish (1.0)</span>
                    </div>
                  </div>

                  {/* Sentiment Summary */}
                  <div className="glass-panel border-slate-800 rounded-2xl p-5 space-y-4">
                    <h4 className="font-bold text-white text-sm flex items-center gap-2">
                      <Newspaper className="w-4 h-4 text-violet-400" />
                      <span>Sentiment & News Summary</span>
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 border border-slate-905 p-4 rounded-xl">
                      {state.newsData.summary}
                    </p>
                    
                    <div className="space-y-2">
                      <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block">Headline Narratives Mapped</span>
                      <ul className="space-y-1.5">
                        {state.newsData.topNarratives.map((nar, idx) => (
                          <li key={idx} className="text-xs text-slate-200 flex gap-2">
                            <span className="text-violet-400 font-bold">•</span>
                            <span>{nar}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </>
              ) : (
                <div className="glass-panel border-slate-800 rounded-2xl p-8 text-center text-slate-500 italic text-xs">
                  No sentiment news records cataloged.
                </div>
              )}
            </div>

          </div>
        )}

        {/* PANEL: RISK MATRIX */}
        {tab === "risks" && (
          <div className="space-y-6">
            {state.riskData ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: "Regulatory & Compliance", items: state.riskData.regulatory, color: "border-purple-900/40 bg-purple-950/5 text-purple-400" },
                  { label: "Financial & Leverage", items: state.riskData.financial, color: "border-rose-900/40 bg-rose-950/5 text-rose-400" },
                  { label: "Market & Demand Dynamics", items: state.riskData.market, color: "border-amber-900/40 bg-amber-950/5 text-amber-400" },
                  { label: "Operational & Execution", items: state.riskData.execution, color: "border-sky-900/40 bg-sky-950/5 text-sky-400" }
                ].map((cat, i) => (
                  <div key={i} className={`border rounded-2xl p-5 space-y-3.5 backdrop-blur ${cat.color}`}>
                    <h4 className="text-xs font-black uppercase tracking-widest">{cat.label} Risks</h4>
                    <ul className="space-y-2 text-xs text-slate-300 leading-relaxed">
                      {cat.items.map((item, idx) => (
                        <li key={idx} className="flex gap-2">
                          <span className="font-bold text-slate-500">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                      {cat.items.length === 0 && (
                        <li className="text-slate-500 italic">No risks identified under this category.</li>
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <div className="glass-panel border-slate-800 rounded-2xl p-8 text-center text-slate-500 italic text-xs">
                No risk factor registries logged.
              </div>
            )}
          </div>
        )}

        {/* PANEL: TECHNICAL SPECS */}
        {tab === "technical" && (
          <div className="space-y-6">
            {/* Model Card */}
            <div className="glass-panel border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
              <div className="flex items-center gap-3 border-b border-slate-850 pb-4">
                <Brain className="w-7 h-7 text-pink-500 animate-pulse" />
                <div>
                  <h3 className="text-xl font-normal text-white font-serif">Local Analytical Architecture Specs</h3>
                  <p className="text-[10px] text-slate-500 font-mono">100% on-device inference with Apple Silicon optimizations</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs leading-relaxed text-slate-350">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-bold text-white text-sm mb-1.5 flex items-center gap-1.5">
                      <Scale className="w-4 h-4 text-violet-400" />
                      <span>Architecture Details</span>
                    </h4>
                    <ul className="space-y-1 font-mono text-[11px] list-disc list-inside">
                      <li>Type: Late-Fusion Multimodal Dual-Tower Model</li>
                      <li>Numerical Analyzer: 3-Layer ResMLP (20 financial inputs)</li>
                      <li>Text Analyzer: Custom Transformer Encoder (4 Heads, 4 Layers)</li>
                      <li>Attentional Fusion: Cross-Attention Classification Head</li>
                      <li>Complexity: ~20 Million local network parameters</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-bold text-white text-sm mb-1.5 flex items-center gap-1.5">
                      <Scale className="w-4 h-4 text-emerald-450" />
                      <span>Training Settings</span>
                    </h4>
                    <ul className="space-y-1 font-mono text-[11px] list-disc list-inside">
                      <li>Scope: S&P 500 constituents + SEC EDGAR 10-Ks</li>
                      <li>Temporal Split: 70% Train / 15% Val / 15% Test</li>
                      <li>Training Time: ~6 seconds (Mac M3 Air, MPS backend)</li>
                      <li>Precision: Float16 Automatic Mixed Precision (AMP)</li>
                    </ul>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 space-y-2">
                    <h4 className="font-bold text-emerald-400 text-xs uppercase tracking-wider font-mono">Holdout Backtest Performance (2025)</h4>
                    <div className="flex justify-between border-b border-slate-900 pb-1 text-[11px]">
                      <span className="text-slate-405">Benchmark Avg Return:</span>
                      <span className="text-slate-100 font-mono">+22.83%</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-900 pb-1 text-[11px]">
                      <span className="text-slate-405">High-Conviction Portfolio:</span>
                      <span className="text-slate-100 font-mono text-emerald-400 font-bold">+80.13%</span>
                    </div>
                    <div className="flex justify-between pb-1 text-[11px]">
                      <span className="text-slate-405">Portfolio Outperformance:</span>
                      <span className="text-emerald-400 font-mono font-bold">+57.30%</span>
                    </div>
                  </div>
                  
                  <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 space-y-1">
                    <h4 className="font-bold text-rose-450 text-xs uppercase tracking-wider font-mono">Disclaimer</h4>
                    <p className="text-[10px] text-slate-500 leading-normal font-sans">
                      This system is a research project. Predictions are based on historical patterns and should not be used for actual investment decisions. Equities trading carries substantial risk of loss.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Neural Network Ratio Attribution Chart */}
            {state.customModelDetails?.numericalDrivers && (
              <div className="glass-panel border-slate-800 rounded-2xl p-6 space-y-4">
                <h4 className="font-bold text-white flex items-center gap-2">
                  <Brain className="w-4.5 h-4.5 text-pink-400 animate-pulse" />
                  <span>Model Ratio Attribution Drivers</span>
                </h4>
                <p className="text-[10px] text-slate-500 font-mono">
                  Below is the attribution score for each financial ratio. Positive scores (green) pushed the model toward an INVEST decision, while negative scores (red) pushed the model toward PASS.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3.5">
                  {state.customModelDetails.numericalDrivers.slice(0, 10).map(([name, impact, rawVal], idx) => {
                    const isPos = impact >= 0;
                    const absImpact = Math.abs(impact);
                    const percentage = Math.min(100, Math.round((absImpact / 0.15) * 100));
                    return (
                      <div key={idx} className="space-y-1 bg-slate-950/45 p-3 rounded-xl border border-slate-900">
                        <div className="flex justify-between text-[11px] font-mono">
                          <span className="text-slate-300 font-semibold">{name}</span>
                          <span className="text-slate-500">
                            Raw: {rawVal.toFixed(2)} | Impact: <span className={isPos ? "text-emerald-400" : "text-rose-400"}>{isPos ? "+" : ""}{impact.toFixed(4)}</span>
                          </span>
                        </div>
                        <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-850">
                          <div 
                            className={`h-full rounded-full ${isPos ? "bg-emerald-500" : "bg-rose-500"}`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Text Attention Highlight Visualizer */}
            {state.customModelDetails?.textSignals && (
              <div className="glass-panel border-slate-800 rounded-2xl p-6 space-y-4">
                <h4 className="font-bold text-white flex items-center gap-2">
                  <Brain className="w-4.5 h-4.5 text-violet-400 animate-pulse" />
                  <span>Text Attention highlights</span>
                </h4>
                <p className="text-[10px] text-slate-500 font-mono">
                  Words and subwords extracted from news and company data, highlighted by importance scoring. Darker purple represents higher focus.
                </p>
                <div className="flex flex-wrap gap-2 p-4 bg-slate-950 rounded-xl border border-slate-900 leading-relaxed">
                  {state.customModelDetails.textSignals.map(([word, weight], idx) => {
                    const opacity = Math.min(0.9, Math.max(0.1, weight * 15));
                    return (
                      <span 
                        key={idx} 
                        className="px-2.5 py-1 rounded text-xs font-mono transition duration-200 hover:scale-105"
                        style={{ 
                          backgroundColor: `rgba(139, 92, 246, ${opacity})`, 
                          color: opacity > 0.4 ? '#ffffff' : '#c084fc',
                          border: `1px solid rgba(139, 92, 246, ${opacity * 0.5})`
                        }}
                        title={`Attention Weight: ${weight.toFixed(4)}`}
                      >
                        {word}
                      </span>
                    );
                  })}
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                  {state.customModelDetails.textSignals.slice(0, 3).map(([word, weight], idx) => (
                    <div key={idx} className="bg-slate-950 border border-slate-850 p-4 rounded-xl flex items-center justify-between shadow-lg">
                      <span className="text-xs text-slate-350 font-mono font-bold">#{idx + 1} Focus: "{word}"</span>
                      <span className="text-[10px] font-mono bg-violet-950/40 border border-violet-850 px-2 py-0.5 rounded text-violet-300">
                        {weight.toFixed(4)} wt
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
