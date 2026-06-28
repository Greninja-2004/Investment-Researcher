"use client";

import React, { useEffect, useRef } from "react";
import { Search, DollarSign, Newspaper, Trophy, AlertTriangle, Brain, Check, Loader2, Circle } from "lucide-react";
import { AgentState } from "@/types/agent";

interface AgentProgressProps {
  currentNode: string | null;
  logs: string[];
  state: AgentState | null;
  complete: boolean;
}

interface Step {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<any>;
  getSummary: (state: AgentState | null) => string | null;
}

const STEPS: Step[] = [
  {
    id: "identifyCompany",
    label: "Identify Company",
    description: "Resolving input name, searching market registers, and pulling basic exchange info",
    icon: Search,
    getSummary: (state) => {
      if (!state?.companyData) return null;
      return state.companyData.symbol 
        ? `Ticker resolved: ${state.companyData.symbol} (${state.companyData.exchange})`
        : `Identified private entity: "${state.companyData.name}"`;
    }
  },
  {
    id: "researchFinancials",
    label: "Financials Research",
    description: "Fetching margins, solvency ratios, free cash flow generation, and PE valuations",
    icon: DollarSign,
    getSummary: (state) => {
      if (!state) return null;
      if (state.financialData?.error) return "Skipped: Private entity (no public statements)";
      if (state.financialData) {
        return `Operating Margin: ${state.financialData.operatingMargin ? (state.financialData.operatingMargin * 100).toFixed(1) + "%" : "N/A"} | Cap: $${(state.financialData.marketCap / 1e9).toFixed(1)}B`;
      }
      return null;
    }
  },
  {
    id: "analyzeNews",
    label: "News & Sentiment",
    description: "Scanning headlines, scoring market sentiment, and identifying major narratives",
    icon: Newspaper,
    getSummary: (state) => {
      if (!state?.newsData) return null;
      return `Sentiment: ${state.newsData.overallSentiment} (Score: ${state.newsData.sentimentScore.toFixed(2)})`;
    }
  },
  {
    id: "mapCompetitors",
    label: "Moat & Competitors",
    description: "Mapping primary industry competitors and evaluating barriers to entry",
    icon: Trophy,
    getSummary: (state) => {
      if (!state?.competitorData) return null;
      return `Peers: ${state.competitorData.peers.slice(0, 2).join(", ")}`;
    }
  },
  {
    id: "evaluateRisks",
    label: "Risk Assessment",
    description: "Compiling regulatory threats, debt defaults, scale bottlenecks, and macro risks",
    icon: AlertTriangle,
    getSummary: (state) => {
      if (!state?.riskData) return null;
      const riskCount = 
        state.riskData.regulatory.length + 
        state.riskData.financial.length + 
        state.riskData.market.length + 
        state.riskData.execution.length;
      return `Logged ${riskCount} active risk vectors`;
    }
  },
  {
    id: "synthesizer", // synthesise node
    label: "Synthesis & Verdict",
    description: "Weighting risk rewards, drafting financial thesis, and formulating recommendation",
    icon: Brain,
    getSummary: (state) => {
      if (!state?.verdict) return null;
      return `Verdict: ${state.verdict} (Confidence: ${state.confidence}%)`;
    }
  }
];

export default function AgentProgress({ currentNode, logs, state, complete }: AgentProgressProps) {
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal logs
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const getStepStatus = (stepId: string) => {
    if (complete) return "completed";
    if (!currentNode) return "pending";

    // Adjust synthesise node name matching (synthesizeDecision or synthesizer)
    const activeId = currentNode === "synthesizeDecision" ? "synthesizer" : currentNode;
    const stepIndex = STEPS.findIndex(s => s.id === stepId);
    const currentIndex = STEPS.findIndex(s => s.id === activeId);

    if (stepIndex < currentIndex) return "completed";
    if (stepIndex === currentIndex) return "active";
    return "pending";
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start w-full">
      {/* Visual Timeline Steps (3/5 width) */}
      <div className="lg:col-span-3 space-y-6">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-4">
          {!complete && <Loader2 className="w-5 h-5 animate-spin text-violet-400" />}
          <h3 className="text-xl font-bold text-white">
            {complete ? "Research Complete" : "Agent Operational Pipeline"}
          </h3>
        </div>

        <div className="relative border-l border-slate-800 ml-4 pl-6 space-y-8 py-2">
          {STEPS.map((step) => {
            const status = getStepStatus(step.id);
            const StepIcon = step.icon;
            const summary = step.getSummary(state);

            return (
              <div key={step.id} className="relative transition-all duration-300">
                {/* Node indicator badge */}
                <div className={`absolute -left-[35px] top-1.5 w-6 h-6 rounded-full border flex items-center justify-center transition-all duration-300 ${
                  status === "completed" 
                    ? "bg-emerald-500 border-emerald-400 text-slate-950 glow-emerald" 
                    : status === "active"
                    ? "bg-slate-900 border-violet-500 text-violet-400 pulse-ring-active glow-violet"
                    : "bg-slate-950 border-slate-800 text-slate-600"
                }`}>
                  {status === "completed" ? (
                    <Check className="w-3.5 h-3.5 stroke-[3px]" />
                  ) : status === "active" ? (
                    <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
                  ) : (
                    <Circle className="w-2.5 h-2.5 fill-current" />
                  )}
                </div>

                <div className={`p-4 rounded-xl border transition-all duration-300 bg-slate-900/50 backdrop-blur ${
                  status === "active" 
                    ? "border-violet-500/30 shadow-lg shadow-violet-950/20" 
                    : "border-slate-800/80"
                } ${status === "pending" ? "opacity-30" : ""}`}>
                  <div className="flex items-center gap-2.5">
                    <StepIcon className={`w-4 h-4 ${status === "active" ? "text-violet-400" : "text-slate-400"}`} />
                    <h4 className="font-bold text-slate-100">{step.label}</h4>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{step.description}</p>
                  
                  {summary && (
                    <div className="mt-3 px-3 py-1.5 bg-slate-950 border border-slate-800/80 rounded-lg text-[10px] font-mono text-slate-300 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>{summary}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Terminal logs (2/5 width) */}
      <div className="lg:col-span-2 flex flex-col h-[520px] bg-slate-950/80 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl backdrop-blur">
        {/* Terminal Header */}
        <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
          </div>
          <span className="text-[10px] font-mono tracking-widest text-slate-500 uppercase">
            research-agent.log
          </span>
        </div>

        {/* Scrollable logs list */}
        <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] text-slate-300 space-y-2 select-text">
          {logs.map((log, index) => {
            const isError = log.includes("❌") || log.toLowerCase().includes("error");
            const isSuccess = log.includes("✅");
            const isStep = log.includes("Step");
            
            let color = "text-slate-300";
            if (isError) color = "text-rose-400";
            else if (isSuccess) color = "text-emerald-400";
            else if (isStep) color = "text-violet-400 font-bold border-b border-slate-800 pb-1 mt-3";

            return (
              <div key={index} className={`leading-relaxed ${color}`}>
                {!isStep && <span className="text-slate-600 mr-2">➜</span>}
                {log}
              </div>
            );
          })}
          <div ref={terminalEndRef} />
        </div>
      </div>
    </div>
  );
}
