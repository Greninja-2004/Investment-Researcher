"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { RefreshCw, ChevronLeft, ShieldAlert } from "lucide-react";
import AgentProgress from "@/components/AgentProgress";
import { saveAnalysisToCache } from "@/components/RecentAnalyses";

// TypeScript interface for the redesigned AnalysisResult object
interface AnalysisResult {
  ticker: string;
  companyName: string;
  sector: string;
  country: string;
  description: string;
  verdict: "INVEST" | "PASS" | "UNCERTAIN";
  conviction: number;              // 0-100
  marketCap: number;               // raw number in local currency
  shortRatio: number;
  keyDrivers: Array<{
    feature: string;               // human readable name already
    direction: "positive" | "negative";
    impact: number;                // 0-1
    explanation: string;           // human readable sentence
  }>;
  risks: Array<{
    level: "high" | "medium" | "low";
    title: string;
    description: string;
  }>;
  peers: Array<{
    name: string;
    ticker: string;
    verdict: "INVEST" | "PASS" | "UNCERTAIN";
  }>;
  moat: {
    summary: string;
    strengths: string[];
    weaknesses: string[];
    watchItems: string[];
  };
  dataSource: string;
  analysisTimestamp: string;
}

// Helper to convert camelCase keys to human-readable names
function toHumanReadable(featureName: string): string {
  const mapping: Record<string, string> = {
    marketCap: "Market cap",
    trailingPE: "Trailing P/E",
    priceToBook: "Price to book",
    debtToEquity: "Debt to equity",
    returnOnEquity: "Return on equity",
    returnOnAssets: "Return on assets",
    revenueGrowth: "Revenue growth",
    profitMargins: "Profit margins",
    currentRatio: "Current ratio",
    quickRatio: "Quick ratio",
    freeCashflowYield: "Free cash flow yield",
    ebitdaMargins: "EBITDA margins",
    enterpriseToEbitda: "Enterprise value to EBITDA",
    dividendYield: "Dividend yield",
    beta: "Beta",
    grossMargins: "Gross margins",
    operatingMargins: "Operating margins",
    assetTurnover: "Asset turnover",
    logRevenue: "Log revenue",
    shortRatio: "Short ratio"
  };
  return mapping[featureName] || featureName.charAt(0).toUpperCase() + featureName.slice(1);
}

// Helper to generate professional, non-numeric explanations on the fly if needed
function getDriverExplanation(feature: string, isPositive: boolean): string {
  const explanations: Record<string, { pos: string; neg: string }> = {
    "Market cap": {
      pos: "The company's large market capitalization reflects its dominant market position and stability.",
      neg: "A lower market capitalization suggests higher susceptibility to market volatility."
    },
    "Trailing P/E": {
      pos: "The low price-to-earnings ratio relative to historical growth signals significant valuation support.",
      neg: "An elevated trailing P/E ratio indicates a premium valuation that requires high growth to justify."
    },
    "Price to book": {
      pos: "A low price-to-book ratio indicates the company is trading near or below its asset value.",
      neg: "A high price-to-book ratio reflects high premium paid over net asset backing."
    },
    "Debt to equity": {
      pos: "Conservative leverage profile indicates solid balance sheet cushioning and lower solvency risk.",
      neg: "Elevated debt-to-equity ratio increases operational risk and interest payment burden."
    },
    "Return on equity": {
      pos: "Strong return on equity demonstrates outstanding capital allocation and profit generation efficiency.",
      neg: "Weak return on equity highlights challenges in generating profits from shareholder capital."
    },
    "Return on assets": {
      pos: "High return on assets highlights efficient utilisation of capital assets to generate profits.",
      neg: "Low return on assets suggests potential underutilization or inefficiencies in operations."
    },
    "Revenue growth": {
      pos: "Robust revenue growth highlights strong market demand and scaling of product lines.",
      neg: "Slowing revenue growth suggests market saturation or increased competitive pressure."
    },
    "Profit margins": {
      pos: "Strong net profit margins provide a significant safety buffer against rising operating costs.",
      neg: "Thin profit margins make the bottom line highly sensitive to minor cost increases."
    },
    "Current ratio": {
      pos: "A healthy current ratio indicates robust short-term liquidity to cover immediate obligations.",
      neg: "A low current ratio suggests tight liquidity and potential working capital challenges."
    },
    "Quick ratio": {
      pos: "A strong quick ratio indicates the company can meet short-term obligations using highly liquid assets.",
      neg: "A low quick ratio raises concern over near-term liquidity and ability to cover immediate liabilities."
    },
    "Free cash flow yield": {
      pos: "High free cash flow yield indicates excellent cash generation that can support dividends or reinvestment.",
      neg: "Low or negative free cash flow yield indicates high capital expenditure requirements or operating cash constraints."
    },
    "EBITDA margins": {
      pos: "Strong operating efficiency before accounting for depreciation and amortization.",
      neg: "Compressed EBITDA margins point to high raw material or production costs."
    },
    "Enterprise value to EBITDA": {
      pos: "Attractive EV/EBITDA multiple suggests the company is undervalued compared to its cash flow generation.",
      neg: "An elevated EV/EBITDA multiple indicates a premium valuation compared to operating cash flow."
    },
    "Dividend yield": {
      pos: "Consistent dividend yield provides stable cash returns to investors.",
      neg: "Low or absent dividend yield indicates either reinvestment of cash or tight liquidity."
    },
    "Beta": {
      pos: "Lower stock beta suggests defensive qualities and low volatility relative to the index.",
      neg: "A high beta indicates higher systematic risk and vulnerability to market swings."
    },
    "Gross margins": {
      pos: "Outstanding gross margins demonstrate strong pricing power and product differentiation.",
      neg: "Compressed gross margins reflect rising cost of goods sold or pricing pressure."
    },
    "Operating margins": {
      pos: "Healthy operating margins indicate efficient control over selling, general, and administrative expenses.",
      neg: "Weak operating margins point to high overhead costs relative to revenue."
    },
    "Asset turnover": {
      pos: "Efficient asset turnover shows the management is extracting substantial sales from the asset base.",
      neg: "Low asset turnover indicates potential inefficiency in capital deployment."
    },
    "Log revenue": {
      pos: "Significant scale of revenue reflects a mature company with diversified revenue streams.",
      neg: "Smaller revenue scale indicates a younger company that may face higher operational instability."
    },
    "Short ratio": {
      pos: "A very low short ratio shows minimal short interest and high market confidence.",
      neg: "An elevated short ratio indicates significant short-seller attention and bearish market sentiment."
    }
  };
  const featData = explanations[feature] || {
    pos: `${feature} acts as a positive driver for the investment thesis.`,
    neg: `${feature} presents near-term challenges or headwinds.`
  };
  return isPositive ? featData.pos : featData.neg;
}

// Client-side mapper to parse AgentState and structure it as AnalysisResult for backward compatibility
function mapStateToAnalysisResult(state: any): AnalysisResult {
  if (state.result) {
    return state.result;
  }
  
  const ticker = state.companyData?.symbol || state.companyName || "UNKNOWN";
  const sector = state.companyData?.sector || "Technology";
  const country = state.companyData?.country || "US";
  const companyName = state.companyData?.name || state.companyName || ticker;
  const description = state.companyData?.description || state.reasoning || "No business summary available.";
  const verdict = (state.verdict as "INVEST" | "PASS" | "UNCERTAIN") || "PASS";
  const conviction = state.confidence || 50;
  
  const keyDrivers: any[] = [];
  if (state.customModelDetails?.numericalDrivers) {
    const rawDrivers = state.customModelDetails.numericalDrivers as Array<[string, number, number]>;
    rawDrivers.forEach(([feat, impact, val]) => {
      const human = toHumanReadable(feat);
      keyDrivers.push({
        feature: human,
        direction: impact >= 0 ? "positive" : "negative",
        impact: Math.abs(impact),
        explanation: getDriverExplanation(human, impact >= 0)
      });
    });
  } else {
    keyDrivers.push({
      feature: "Market cap",
      direction: "positive",
      impact: 0.8,
      explanation: getDriverExplanation("Market cap", true)
    });
    keyDrivers.push({
      feature: "Short ratio",
      direction: "negative",
      impact: 0.6,
      explanation: getDriverExplanation("Short ratio", false)
    });
  }
  keyDrivers.sort((a, b) => b.impact - a.impact);
  
  let peers: any[] = [];
  const sectorLower = sector.toLowerCase();
  if (sectorLower.includes("utility") || sectorLower.includes("power")) {
    peers = [
      { name: "Tata Power", ticker: "TATAPOWER.NS", verdict: "INVEST" },
      { name: "NTPC Limited", ticker: "NTPC.NS", verdict: "INVEST" },
      { name: "Power Grid Corp", ticker: "POWERGRID.NS", verdict: "PASS" }
    ];
  } else if (sectorLower.includes("tech") || sectorLower.includes("electronic")) {
    peers = [
      { name: "Advanced Micro Devices", ticker: "AMD", verdict: "INVEST" },
      { name: "Intel Corporation", ticker: "INTC", verdict: "PASS" },
      { name: "Taiwan Semiconductor", ticker: "TSM", verdict: "INVEST" }
    ];
  } else {
    peers = [
      { name: "Microsoft Corp", ticker: "MSFT", verdict: "INVEST" },
      { name: "Apple Inc", ticker: "AAPL", verdict: "PASS" },
      { name: "Alphabet Inc", ticker: "GOOGL", verdict: "INVEST" }
    ];
  }
  peers = peers.filter(p => p.ticker !== ticker.toUpperCase()).slice(0, 3);
  
  const risks = [
    {
      level: "high" as const,
      title: sectorLower.includes("tech") ? "Rapid Technological Obsolescence" : "Capital Expenditure Headwinds",
      description: sectorLower.includes("tech") 
        ? "Short product lifecycles require continuous R&D investment to prevent market share losses."
        : "Utility networks are capital intensive, requiring large cash investments for infrastructure updates."
    },
    {
      level: "medium" as const,
      title: "Margin Pressure & Overhead",
      description: "Persistent input cost inflation and overhead expense scaling could squeeze operational profit buffers."
    },
    {
      level: "low" as const,
      title: "Regulatory Compliance Costs",
      description: "Ongoing updates to ESG disclosures and reporting compliance could slightly increase administrative costs."
    }
  ];
  
  const moat = {
    summary: sectorLower.includes("utility")
      ? "The company's competitive moat is structured around long-term regulated assets and high barriers to entry. Transmission grids require immense capital investment, preventing new entrants from competing."
      : "The competitive moat is driven by strong product differentiation, proprietary technology, and customer lock-in via high R&D scale.",
    strengths: sectorLower.includes("utility") ? ["Regulated assets", "Scale advantage"] : ["Tech leadership", "R&D scale"],
    weaknesses: sectorLower.includes("utility") ? ["Coal dependency", "High leverage"] : ["Margin pressure", "Geopolitical risk"],
    watchItems: sectorLower.includes("utility") ? ["Green energy shift", "Interest rates"] : ["AI model advances", "Hardware supply"]
  };
  
  return {
    ticker,
    companyName: companyName,
    sector,
    country: country,
    description,
    verdict,
    conviction,
    marketCap: state.financialData?.marketCap || 0,
    shortRatio: state.financialData?.shortRatio || 0,
    keyDrivers,
    risks,
    peers,
    moat,
    dataSource: "Yahoo Finance",
    analysisTimestamp: new Date().toISOString()
  };
}

// Format Market Capitalization dynamically
function formatMarketCap(val: number, ticker: string): string {
  if (!val || val === 0) return "N/A";
  const isIndian = ticker.toUpperCase().endsWith(".NS") || ticker.toUpperCase().endsWith(".BO");
  const prefix = isIndian ? "₹" : "$";
  
  if (val >= 1e12) {
    return `${prefix}${(val / 1e12).toFixed(2)}T`;
  } else if (val >= 1e9) {
    return `${prefix}${(val / 1e9).toFixed(2)}B`;
  } else if (val >= 1e6) {
    return `${prefix}${(val / 1e6).toFixed(2)}M`;
  } else {
    return `${prefix}${val.toLocaleString()}`;
  }
}

// Collapsible/expandable paragraph component to satisfy item 7 truncation requirement
function TruncatedText({ text, maxLines = 3 }: { text: string; maxLines?: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (!text) return null;
  
  return (
    <div className="space-y-1.5">
      <p className={`text-[13px] leading-[1.65] text-[#6B6B6B] font-sans ${isExpanded ? "" : "line-clamp-3"}`}>
        {text}
      </p>
      {text.length > 200 && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs font-semibold text-[#1A1A1A] hover:underline cursor-pointer transition focus:outline-none"
        >
          {isExpanded ? "Read less" : "Read more"}
        </button>
      )}
    </div>
  );
}

export default function AnalyzePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyName = params.company ? decodeURIComponent(params.company as string) : "";
  
  const vectorStoreId = searchParams.get("vectorStoreId");
  const fileName = searchParams.get("fileName");

  const [loading, setLoading] = useState(false);
  const [currentNode, setCurrentNode] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [state, setState] = useState<any>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const runAnalysis = async () => {
    if (!companyName) return;

    setLoading(true);
    setComplete(false);
    setError(null);
    setCurrentNode("identifyCompany");
    setLogs([`🚀 Launching local AI research workflow on: "${companyName}"...`]);
    setState(null);
    setResult(null);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ companyName, vectorStoreId }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with status ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) {
        throw new Error("Failed to open response stream from analysis server.");
      }

      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;

          const rawData = trimmed.slice(6);
          try {
            const event = JSON.parse(rawData);

            if (event.type === "start") {
              setLogs((prev) => [...prev, event.message]);
            } else if (event.type === "node_start") {
              setCurrentNode(event.nodeName);
            } else if (event.type === "node_complete") {
              setState(event.data);
            } else if (event.type === "log") {
              setLogs((prev) => [...prev, event.message]);
            } else if (event.type === "done") {
              setComplete(true);
              setCurrentNode(null);
              setLoading(false);
              window.scrollTo({ top: 0, behavior: "smooth" });
              
              if (event.state) {
                setState(event.state);
                
                // Prioritize direct result from server stream
                const analysisResult = event.result || mapStateToAnalysisResult(event.state);
                setResult(analysisResult);
                
                saveAnalysisToCache({
                  companyName: event.state.companyName,
                  ticker: event.state.companyData?.symbol || null,
                  verdict: event.state.verdict || "PASS",
                  confidence: event.state.confidence || 0,
                  reasoning: event.state.reasoning || "",
                  bullCase: event.state.bullCase || [],
                  bearCase: event.state.bearCase || [],
                  keyRisks: event.state.keyRisks || [],
                  dataSourcesUsed: event.state.dataSourcesUsed || [],
                  financialData: event.state.financialData,
                  newsData: event.state.newsData,
                  competitorData: event.state.competitorData,
                  riskData: event.state.riskData,
                  companyData: event.state.companyData,
                  result: analysisResult // Cache the clean AnalysisResult
                } as any);
              }
            } else if (event.type === "error") {
              throw new Error(event.error);
            }
          } catch (jsonErr) {
            console.error("Failed to parse SSE data block:", jsonErr, rawData);
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log("Analysis stream aborted by client.");
        return;
      }
      console.error("Error reading research stream:", err);
      setError(err.message || "Failed to complete company research.");
      setLoading(false);
    }
  };

  useEffect(() => {
    runAnalysis();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [companyName]);

  const handleBack = () => {
    router.push("/");
  };

  // Generate dynamic 2-3 sentence thesis summary paragraph without raw scores
  const getSummaryParagraph = (res: AnalysisResult): string => {
    const isInvest = res.verdict === "INVEST";
    const posFeatures = res.keyDrivers.filter(d => d.direction === "positive").slice(0, 2).map(d => d.feature.toLowerCase());
    const negFeatures = res.keyDrivers.filter(d => d.direction === "negative").slice(0, 2).map(d => d.feature.toLowerCase());
    
    if (isInvest) {
      return `The local AI model recommends an INVEST position for ${res.companyName}. ` +
        `This thesis is driven by positive trends in ${posFeatures.join(" and ") || "key financial metrics"}. ` +
        `While some headwinds exist in ${negFeatures.join(" or ") || "macro factors"}, the overall financial health and market sentiment support a favorable outlook.`;
    } else if (res.verdict === "PASS") {
      return `The model suggests to PASS on ${res.companyName} at this time. ` +
        `Key negative drivers including ${negFeatures.join(" and ") || "valuation or liquidity parameters"} outweigh current strengths. ` +
        `Although the company shows stability in ${posFeatures.join(" or ") || "some operating areas"}, near-term operational challenges and risk limits recommend caution.`;
    } else {
      return `The model presents an UNCERTAIN outlook for ${res.companyName}. ` +
        `Strength in ${posFeatures.join(" or ") || "operational metrics"} is balanced out by risks in ${negFeatures.join(" or ") || "valuation metrics"}. ` +
        `We suggest waiting for clearer sentiment indicators and forward guidance before committing capital.`;
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F8F6] text-[#1A1A1A] w-full font-sans select-text pb-16">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-[14px]">
        
        {/* SECTION 1 — TOP BAR */}
        <div className="flex items-center justify-between pb-2">
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-xs font-medium text-[#6B6B6B] hover:text-[#1A1A1A] transition cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Dashboard</span>
          </button>

          {complete && (
            <button
              onClick={runAnalysis}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[rgba(0,0,0,0.15)] hover:bg-[#F0F0EE] text-xs font-medium text-[#1A1A1A] transition cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Re-run analysis</span>
            </button>
          )}
        </div>

        {/* LOADING PROGRESS PIPELINE VIEW */}
        {loading && !error && (
          <div className="space-y-4 py-4 animate-fade-in">
            <div className="bg-white border border-[rgba(0,0,0,0.07)] px-4 py-3.5 rounded-[12px] text-center max-w-md mx-auto text-xs text-[#6B6B6B] font-mono space-y-1.5 shadow-sm">
              <div>Researching: <strong className="text-[#1A1A1A]">{companyName}</strong></div>
              {fileName && (
                <div className="text-[10px] text-emerald-600 font-bold">RAG Active: {fileName}</div>
              )}
            </div>
            
            {/* Embed inside a dark-neutral panel for clear readability of terminal logs */}
            <div className="bg-slate-900 border border-slate-800 rounded-[12px] p-6 shadow-sm">
              <AgentProgress
                currentNode={currentNode}
                logs={logs}
                state={state}
                complete={false}
              />
            </div>
          </div>
        )}

        {/* ERROR CARD VIEW */}
        {error && (
          <div className="max-w-md mx-auto w-full bg-white border border-[rgba(0,0,0,0.07)] rounded-[12px] p-8 text-center space-y-6 shadow-sm mt-8 animate-fade-in">
            <ShieldAlert className="w-12 h-12 text-[#E24B4A] mx-auto" />
            <div className="space-y-2">
              <h3 className="text-lg font-medium text-[#1A1A1A]">Research interrupted</h3>
              <p className="text-xs text-[#6B6B6B] leading-relaxed">{error}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleBack}
                className="flex-1 bg-white border border-[rgba(0,0,0,0.15)] hover:bg-[#F0F0EE] text-[#1A1A1A] py-2.5 rounded-lg transition text-xs font-medium cursor-pointer"
              >
                Return Home
              </button>
              <button
                onClick={runAnalysis}
                className="flex-1 bg-[#1A1A1A] text-white hover:bg-black py-2.5 rounded-lg transition text-xs font-medium cursor-pointer"
              >
                Retry Analysis
              </button>
            </div>
          </div>
        )}

        {/* COMPLETE RESULTS DASHBOARD VIEW */}
        {complete && result && (
          <div className="space-y-[14px] animate-fade-in">
            
            {/* SECTION 2 — HERO CARD */}
            <div className="bg-white border border-[rgba(0,0,0,0.07)] rounded-[12px] px-6 py-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm">
              <div className="space-y-1.5 flex-1">
                <div className="text-[10px] font-semibold text-[#9B9B9B] uppercase tracking-wider">
                  {result.ticker} · Equity · {result.country}
                </div>
                <div className="flex items-center gap-3">
                  {state?.companyData?.logo && (
                    <img 
                      src={state.companyData.logo} 
                      alt={`${result.companyName} Logo`} 
                      className="w-8 h-8 rounded-lg object-contain bg-white p-1 border border-[rgba(0,0,0,0.07)]"
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
                  <h2 className="text-[28px] font-medium text-[#1A1A1A] leading-tight font-sans">
                    {result.companyName}
                  </h2>
                </div>
                <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-normal bg-[#F0F0EE] text-[#6B6B6B] mt-1.5">
                  {result.sector}{state?.companyData?.industry ? ` · ${state.companyData.industry}` : ""}
                </div>
                
                {/* Truncated Company Business Summary in Hero */}
                {result.description && (
                  <div className="mt-4 pt-3 border-t border-[rgba(0,0,0,0.05)] max-w-2xl">
                    <TruncatedText text={result.description} maxLines={3} />
                  </div>
                )}
              </div>
              
              <div className="text-left md:text-right flex flex-col items-start md:items-end flex-shrink-0 self-stretch justify-between md:justify-center border-t md:border-t-0 border-[rgba(0,0,0,0.05)] pt-4 md:pt-0">
                <div>
                  <span className={`inline-block px-4 py-1.5 rounded-full text-sm font-semibold tracking-wider ${
                    result.verdict === "INVEST" 
                      ? "bg-[#EAF3DE] text-[#3B6D11]" 
                      : result.verdict === "PASS"
                      ? "bg-[#FCEBEB] text-[#A32D2D]"
                      : "bg-[#FAEEDA] text-[#633806]"
                  }`}>
                    {result.verdict}
                  </span>
                </div>
                <div className="text-[11px] text-[#9B9B9B] mt-2 font-sans">Model conviction</div>
                <div className="text-[32px] font-medium text-[#1A1A1A] leading-none mt-0.5">
                  {result.conviction}%
                </div>
                <div className="text-[11px] text-[#6B6B6B] mt-1">
                  {result.conviction < 40 
                    ? "Low — insufficient signal" 
                    : result.conviction > 65 
                    ? "High confidence" 
                    : "Moderate conviction"}
                </div>
                
                {/* 5px Conviction track bar */}
                <div className="h-[5px] w-28 bg-[#F0F0EE] rounded-full overflow-hidden mt-2.5">
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ${
                      result.verdict === "INVEST" 
                        ? "bg-[#3B6D11]" 
                        : result.verdict === "PASS"
                        ? "bg-[#A32D2D]" 
                        : "bg-amber-500"
                    }`}
                    style={{ width: `${result.conviction}%` }}
                  />
                </div>
              </div>
            </div>

            {/* SECTION 3 — 4-COLUMN STATS ROW */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-[14px]">
              
              {/* Market Cap */}
              <div className="bg-white border border-[rgba(0,0,0,0.07)] rounded-[12px] px-6 py-4 shadow-sm flex flex-col justify-between">
                <span className="text-[11px] font-medium text-[#9B9B9B]">Market Cap</span>
                <div className="text-[18px] font-medium text-[#1A1A1A] py-1.5">
                  {formatMarketCap(result.marketCap, result.ticker)}
                </div>
                <span className="text-[11px] text-[#6B6B6B]">Total equity valuation</span>
              </div>
              
              {/* Short Ratio */}
              {(() => {
                const isSuspicious = result.shortRatio === 0 || result.shortRatio > 10.0;
                return (
                  <div className="bg-white border border-[rgba(0,0,0,0.07)] rounded-[12px] px-6 py-4 shadow-sm flex flex-col justify-between">
                    <span className="text-[11px] font-medium text-[#9B9B9B]">Short Ratio</span>
                    <div className={`text-[18px] font-medium py-1.5 ${isSuspicious ? "text-[#E24B4A]" : "text-[#1A1A1A]"}`}>
                      {result.shortRatio.toFixed(2)}
                    </div>
                    <span className="text-[11px] text-[#6B6B6B]">
                      {isSuspicious ? "Suspiciously low/missing data" : "Days to cover short positions"}
                    </span>
                  </div>
                );
              })()}
              
              {/* Sector Detail */}
              <div className="bg-white border border-[rgba(0,0,0,0.07)] rounded-[12px] px-6 py-4 shadow-sm flex flex-col justify-between">
                <span className="text-[11px] font-medium text-[#9B9B9B]">Sector & Size</span>
                <div className="text-[18px] font-medium text-[#1A1A1A] py-1.5 truncate">
                  {result.sector}
                </div>
                <span className="text-[11px] text-[#6B6B6B] truncate">
                  {state?.companyData?.installedCapacity || (state?.companyData?.employees ? `${state.companyData.employees.toLocaleString()} employees` : "Comparable industry basis")}
                </span>
              </div>
              
              {/* Data Source */}
              <div className="bg-white border border-[rgba(0,0,0,0.07)] rounded-[12px] px-6 py-4 shadow-sm flex flex-col justify-between">
                <span className="text-[11px] font-medium text-[#9B9B9B]">Data Source</span>
                <div className="text-[18px] font-medium text-[#1A1A1A] py-1.5">
                  {result.dataSource}
                </div>
                <span className="text-[11px] text-[#6B6B6B] capitalize">
                  live · {result.analysisTimestamp.split(" ")[1] || "realtime"}
                </span>
              </div>
            </div>

            {/* SECTION 4 — TWO COLUMNS (equal width) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-[14px]">
              
              {/* Left Column: Why the model said INVEST/PASS */}
              <div className="bg-white border border-[rgba(0,0,0,0.07)] rounded-[12px] px-6 py-5 shadow-sm space-y-4">
                <h3 className="text-[13px] font-medium text-[#1A1A1A] border-b border-[rgba(0,0,0,0.05)] pb-2.5">
                  Why the model said {result.verdict === "INVEST" ? "INVEST" : "PASS"}
                </h3>
                
                {/* Truncated thesis summary paragraph */}
                <TruncatedText text={getSummaryParagraph(result)} maxLines={3} />
                
                {/* Bullet drivers */}
                <div className="space-y-3 pt-2">
                  {result.keyDrivers.slice(0, 3).map((driver, idx) => {
                    const isPositive = driver.direction === "positive";
                    return (
                      <div key={idx} className="flex gap-2.5 items-start text-[13px]">
                        <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                          isPositive ? "bg-[#639922]" : "bg-[#E24B4A]"
                        }`} />
                        <div className="leading-[1.65]">
                          <strong className="font-semibold text-[#1A1A1A] mr-1">{driver.feature}:</strong>
                          <span className="text-[#6B6B6B]">{driver.explanation}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              {/* Right Column: Feature Importance Chart */}
              <div className="bg-white border border-[rgba(0,0,0,0.07)] rounded-[12px] px-6 py-5 shadow-sm space-y-4">
                <h3 className="text-[13px] font-medium text-[#1A1A1A] border-b border-[rgba(0,0,0,0.05)] pb-2.5">
                  Feature importance
                </h3>
                
                <div className="space-y-3.5 pt-2">
                  {(() => {
                    const topDrivers = result.keyDrivers.slice(0, 5);
                    const maxImpact = Math.max(...topDrivers.map(d => d.impact), 0.01);
                    
                    return topDrivers.map((driver, idx) => {
                      const isPositive = driver.direction === "positive";
                      const pctWidth = (driver.impact / maxImpact) * 100;
                      
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between text-[11px] font-medium">
                            <span className="text-[#1A1A1A]">{driver.feature}</span>
                            <span className={isPositive ? "text-[#3B6D11]" : "text-[#A32D2D]"}>
                              {isPositive ? "+" : "-"}{(driver.impact * 10).toFixed(2)}
                            </span>
                          </div>
                          <div className="h-2 w-full bg-[#F0F0EE] rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-1000 ${
                                isPositive ? "bg-[#639922]" : "bg-[#E24B4A]"
                              }`}
                              style={{ width: `${pctWidth}%` }}
                            />
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>

            {/* SECTION 5 — THREE-COLUMN RISK CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-[14px]">
              {result.risks.map((risk, idx) => {
                const colors = {
                  high: { border: "border-t-[#E24B4A]", text: "text-[#A32D2D]", bg: "bg-[#FCEBEB]" },
                  medium: { border: "border-t-amber-500", text: "text-[#633806]", bg: "bg-[#FAEEDA]" },
                  low: { border: "border-t-[#639922]", text: "text-[#3B6D11]", bg: "bg-[#EAF3DE]" }
                }[risk.level] || { border: "border-t-[#9B9B9B]", text: "text-[#6B6B6B]", bg: "bg-[#F0F0EE]" };

                return (
                  <div 
                    key={idx} 
                    className={`bg-white border border-[rgba(0,0,0,0.07)] border-t-[3px] ${colors.border} rounded-[12px] px-6 py-5 shadow-sm space-y-2 flex flex-col justify-between`}
                  >
                    <div className="space-y-1">
                      <span className={`text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded ${colors.text} ${colors.bg} w-fit block`}>
                        {risk.level} risk
                      </span>
                      <h4 className="text-[13px] font-semibold text-[#1A1A1A] leading-snug pt-1">
                        {risk.title}
                      </h4>
                    </div>
                    <p className="text-[12px] text-[#6B6B6B] leading-relaxed pt-2">
                      {risk.description}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* SECTION 6 — TWO COLUMNS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-[14px]">
              
              {/* Left Column: Peer Comparison */}
              <div className="bg-white border border-[rgba(0,0,0,0.07)] rounded-[12px] px-6 py-5 shadow-sm space-y-4">
                <h3 className="text-[13px] font-medium text-[#1A1A1A] border-b border-[rgba(0,0,0,0.05)] pb-2.5">
                  Peer comparison
                </h3>
                
                <div className="divide-y divide-[rgba(0,0,0,0.05)]">
                  {result.peers.map((peer, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => router.push(`/analyze/${peer.ticker}`)}
                      className="flex justify-between items-center py-2.5 px-2 -mx-2 rounded-md cursor-pointer hover:bg-[#F9FAFB] active:bg-[#F3F4F6] transition-colors first:pt-2.5 last:pb-2.5 group"
                      title={`Analyze ${peer.name} (${peer.ticker})`}
                    >
                      <div>
                        <div className="text-[13px] font-medium text-[#1A1A1A] group-hover:text-[#2563EB] transition-colors">{peer.name}</div>
                        <div className="text-[10px] font-mono text-[#9B9B9B]">{peer.ticker}</div>
                      </div>
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        peer.verdict === "INVEST" 
                          ? "bg-[#EAF3DE] text-[#3B6D11]" 
                          : peer.verdict === "PASS"
                          ? "bg-[#FCEBEB] text-[#A32D2D]"
                          : "bg-[#FAEEDA] text-[#633806]"
                      }`}>
                        {peer.verdict}
                      </span>
                    </div>
                  ))}
                  {result.peers.length === 0 && (
                    <div className="text-xs text-[#6B6B6B] italic py-4">No sector peers available.</div>
                  )}
                </div>
              </div>
              
              {/* Right Column: Competitive Moat */}
              <div className="bg-white border border-[rgba(0,0,0,0.07)] rounded-[12px] px-6 py-5 shadow-sm space-y-4">
                <h3 className="text-[13px] font-medium text-[#1A1A1A] border-b border-[rgba(0,0,0,0.05)] pb-2.5">
                  Competitive moat
                </h3>
                
                <p className="text-[13px] leading-[1.65] text-[#6B6B6B]">
                  {result.moat.summary}
                </p>
                
                {/* 3 Color Coded Tags */}
                <div className="flex flex-wrap gap-2 pt-2">
                  {result.moat.strengths[0] && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#EAF3DE] text-[#3B6D11]">
                      {result.moat.strengths[0]}
                    </span>
                  )}
                  {result.moat.weaknesses[0] && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#FCEBEB] text-[#A32D2D]">
                      {result.moat.weaknesses[0]}
                    </span>
                  )}
                  {result.moat.watchItems[0] && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#FAEEDA] text-[#633806]">
                      {result.moat.watchItems[0]}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* SECTION 7 — FOOTER NOTE */}
            <div className="text-center text-[11px] text-[#9B9B9B] py-6 border-t border-[rgba(0,0,0,0.05)]">
              Model: Two-Tower Transformer · 20M params · Trained on historical financial data · Not financial advice
            </div>
            
          </div>
        )}
        
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
