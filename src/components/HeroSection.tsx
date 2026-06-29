"use client";

import React, { useState, useRef, DragEvent } from "react";
import { Search, Upload, FileText, CheckCircle, AlertCircle, X, Loader2 } from "lucide-react";

interface HeroSectionProps {
  onSearch: (companyName: string, vectorStoreId: string | null, fileName: string | null) => void;
  isLoading: boolean;
}

export default function HeroSection({ onSearch, isLoading }: HeroSectionProps) {
  const [query, setQuery] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [vectorStoreId, setVectorStoreId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File upload logic (matches SearchBar.tsx API interactions)
  const handleUpload = async (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith(".pdf") && !selectedFile.name.toLowerCase().endsWith(".txt")) {
      setUploadError("Only PDF and TXT files are supported.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setVectorStoreId(null);
    setFile(selectedFile);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to process document.");
      }

      setVectorStoreId(data.vectorStoreId);
    } catch (err: any) {
      setUploadError(err.message || "Error parsing document.");
      setFile(null);
    } finally {
      setUploading(false);
    }
  };

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleUpload(e.target.files[0]);
    }
  };

  const removeFile = () => {
    setFile(null);
    setVectorStoreId(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading || uploading) return;
    onSearch(query.trim(), vectorStoreId, file ? file.name : null);
  };

  const handleChipClick = (ticker: string) => {
    setQuery(ticker);
    onSearch(ticker, vectorStoreId, file ? file.name : null);
  };

  return (
    <section className="w-full relative overflow-hidden bg-[#F8F8F6] dark:bg-[#0a0b0f] text-slate-800 dark:text-slate-100 flex flex-col items-center transition-colors duration-300">
      {/* Subtle Indigo Grid Overlay */}
      <div className="absolute inset-0 grid-overlay opacity-100 pointer-events-none -z-10" />

      {/* Background Orbs */}
      <div className="absolute -top-[10%] -right-[10%] w-[600px] h-[600px] rounded-full bg-[#6366f1]/5 dark:bg-[#6366f1]/18 blur-[130px] pointer-events-none -z-10 animate-pulse duration-[8000ms] transition-colors duration-300" />
      <div className="absolute bottom-[20%] -left-[10%] w-[500px] h-[500px] rounded-full bg-[#10b981]/4 dark:bg-[#10b981]/12 blur-[120px] pointer-events-none -z-10 transition-colors duration-300" />

      {/* Ticker Strip */}
      <div className="w-full bg-white/60 dark:bg-black/45 border-b border-slate-200 dark:border-white/[0.04] py-2.5 backdrop-blur-sm overflow-hidden relative transition-colors duration-300">
        <div className="flex w-fit whitespace-nowrap animate-marquee">
          {/* Loop double lists for seamless marquee effect */}
          {[1, 2].map((loopIdx) => (
            <div key={loopIdx} className="flex gap-12 px-6 items-center text-[11px] font-mono tracking-wider text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="text-slate-400">SPY</span>
                <span className="text-slate-900 dark:text-white font-medium">$5,432.12</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">+1.24%</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-slate-400">QQQ</span>
                <span className="text-slate-900 dark:text-white font-medium">$482.50</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">+1.82%</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-slate-400">NVDA</span>
                <span className="text-slate-900 dark:text-white font-medium">$123.45</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">+4.21%</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-slate-400">AAPL</span>
                <span className="text-slate-900 dark:text-white font-medium">$210.30</span>
                <span className="text-rose-600 dark:text-rose-450 font-semibold">-0.45%</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-slate-400">TSLA</span>
                <span className="text-slate-900 dark:text-white font-medium">$187.90</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">+3.12%</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-slate-400">MSFT</span>
                <span className="text-slate-900 dark:text-white font-medium">$420.15</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">+0.75%</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-slate-400">PLTR</span>
                <span className="text-slate-900 dark:text-white font-medium">$26.40</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">+5.84%</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-slate-400">PTON</span>
                <span className="text-slate-900 dark:text-white font-medium">$3.82</span>
                <span className="text-rose-600 dark:text-rose-450 font-semibold">-8.24%</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-slate-400">AMZN</span>
                <span className="text-slate-900 dark:text-white font-medium">$189.50</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">+1.10%</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Hero Section Container */}
      <div className="max-w-6xl w-full mx-auto px-6 pt-16 md:pt-24 pb-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-16 items-center">
          
          {/* LEFT COLUMN: Controls & Description */}
          <div className="space-y-6 flex flex-col justify-center">
            
            {/* Eyebrow badge pill */}
            <div className="w-fit inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#6366f1]/5 dark:bg-[#6366f1]/10 border border-[#6366f1]/15 dark:border-[#6366f1]/25 text-[10px] font-bold tracking-widest text-[#6366f1] dark:text-[#818cf8] uppercase transition-colors duration-300">
              <span className="w-1.5 h-1.5 rounded-full bg-[#6366f1] pulse-indigo-dot" />
              <span>Powered by local neural network</span>
            </div>

            {/* Headline */}
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white tracking-tight leading-[1.1] font-space-grotesk transition-colors duration-300">
              Research any stock. <br />
              Get an <span className="bg-gradient-to-r from-[#818cf8] via-[#a78bfa] to-[#c084fc] bg-clip-text text-transparent">INVEST</span> or <span className="bg-gradient-to-r from-[#a78bfa] via-[#c084fc] to-[#f43f5e] bg-clip-text text-transparent">PASS</span> in seconds.
            </h2>

            {/* Subheading */}
            <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed max-w-lg opacity-85 transition-colors duration-300">
              Our custom two-tower fusion model maps deep balance sheet ratios alongside sentiment-scored transcripts. Run structural diagnostics, evaluate moat viability, and generate auditable convictions instantly.
            </p>

            {/* Search Bar Form */}
            <form onSubmit={handleSubmit} className="relative group max-w-lg w-full space-y-3">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-2xl blur opacity-10 dark:opacity-15 group-focus-within:opacity-25 dark:group-focus-within:opacity-30 transition duration-300" />
              
              <div className="relative flex items-center bg-white dark:bg-[#0d0e13]/80 border border-slate-200 dark:border-white/10 backdrop-blur-md rounded-xl overflow-hidden px-4 py-2 transition-colors duration-300 shadow-sm dark:shadow-none">
                <Search className="w-5 h-5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                
                <input
                  type="text"
                  placeholder="Search company (e.g. Nvidia, Peloton)..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={isLoading || uploading}
                  className="w-full bg-transparent px-3 py-3 outline-none text-slate-900 dark:text-white placeholder-slate-450 dark:placeholder-slate-500 text-base font-sans disabled:cursor-not-allowed"
                />

                <button
                  type="submit"
                  disabled={!query.trim() || isLoading || uploading}
                  className="flex items-center justify-center gap-2 bg-[#6366f1] hover:bg-[#5558e0] text-white font-semibold px-5 py-2.5 rounded-lg transition duration-150 shadow-lg shadow-indigo-900/10 dark:shadow-indigo-900/20 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 cursor-pointer text-sm font-space-grotesk"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Analyzing...</span>
                    </>
                  ) : (
                    <span>Analyze →</span>
                  )}
                </button>
              </div>
            </form>

            {/* Document upload trigger */}
            <div 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => !file && fileInputRef.current?.click()}
              className={`max-w-lg w-full border border-dashed rounded-xl p-4 text-center cursor-pointer transition-all duration-200 bg-white/40 dark:bg-[#0d0e13]/30 ${
                dragActive
                  ? "border-indigo-500 bg-indigo-500/5"
                  : file
                  ? "border-slate-300 dark:border-white/10 bg-white/70 dark:bg-[#0d0e13]/50 cursor-default"
                  : "border-slate-200 dark:border-white/10 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-white/60 dark:hover:bg-[#0d0e13]/40"
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".pdf,.txt"
                className="hidden"
              />

              {!file && !uploading && (
                <div className="flex items-center justify-center gap-2.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-355 transition text-xs font-mono">
                  <Upload className="w-4.5 h-4.5" />
                  <span>Attach financial statements for RAG context (.pdf, .txt)</span>
                </div>
              )}

              {uploading && (
                <div className="flex items-center justify-center gap-2.5 py-0.5">
                  <Loader2 className="w-4 h-4 text-indigo-550 dark:text-indigo-400 animate-spin" />
                  <span className="text-slate-500 dark:text-slate-400 text-xs font-mono">Indexing documents locally...</span>
                </div>
              )}

              {file && !uploading && (
                <div className="flex items-center justify-between bg-slate-100/50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.06] rounded-lg p-2.5 max-w-sm mx-auto">
                  <div className="flex items-center gap-2 text-left truncate">
                    <FileText className="w-4 h-4 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
                    <div className="truncate">
                      <div className="text-slate-900 dark:text-white text-xs font-semibold truncate max-w-[180px]">{file.name}</div>
                      <div className="text-slate-550 text-[9px] font-mono">RAG Index Loaded</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {vectorStoreId ? (
                      <CheckCircle className="w-4 h-4 text-emerald-650 dark:text-emerald-400" />
                    ) : (
                      <Loader2 className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 animate-spin" />
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile();
                      }}
                      className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 p-0.5 hover:bg-slate-200 dark:hover:bg-white/5 rounded transition cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {uploadError && (
                <div className="flex items-center gap-2 text-rose-600 dark:text-rose-450 justify-center mt-2 text-xs">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{uploadError}</span>
                </div>
              )}
            </div>

            {/* Quick Chips */}
            <div className="flex flex-wrap gap-2 text-xs items-center text-slate-500 dark:text-slate-400 pt-1.5">
              <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mr-1">Shortcuts:</span>
              {[
                { ticker: "NVDA", name: "Nvidia" },
                { ticker: "AAPL", name: "Apple" },
                { ticker: "TSLA", name: "Tesla" },
                { ticker: "AMZN", name: "Amazon" }
              ].map((chip) => (
                <button
                  key={chip.ticker}
                  type="button"
                  onClick={() => handleChipClick(chip.ticker)}
                  disabled={isLoading || uploading}
                  className="px-3 py-1 rounded-full bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] hover:bg-slate-50 dark:hover:bg-white/[0.08] hover:border-[#6366f1]/30 dark:hover:border-indigo-500/30 text-slate-700 dark:text-slate-300 hover:text-[#6366f1] dark:hover:text-white font-mono transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-[11px] shadow-sm dark:shadow-none"
                >
                  {chip.ticker}
                </button>
              ))}
            </div>

          </div>

          {/* RIGHT COLUMN: Stacked Signal Cards */}
          <div className="flex flex-col gap-4 max-w-md w-full justify-self-center md:justify-self-end">
            
            {/* Card 1: Nvidia Corp (Featured) */}
            <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] shadow-sm dark:shadow-none backdrop-blur-md rounded-xl p-4.5 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-all duration-200 glow-indigo relative group text-slate-900 dark:text-white">
              <div className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping opacity-75" />
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-[15px] font-space-grotesk">Nvidia Corp</h4>
                  <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">NVDA · Semiconductors</p>
                </div>
                <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-450 text-[10px] font-bold tracking-wider px-2 py-0.5 rounded font-space-grotesk">
                  INVEST
                </span>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  <span>Two-Tower Confidence</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">94%</span>
                </div>
                <div className="w-full h-[3px] bg-slate-100 dark:bg-white/[0.08] rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full w-[94%]" />
                </div>
              </div>
            </div>

            {/* Card 2: Microsoft Corp */}
            <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] shadow-sm dark:shadow-none backdrop-blur-md rounded-xl p-4 hover:bg-slate-50 dark:hover:bg-white/[0.05] hover:border-slate-400 dark:hover:border-slate-500/30 transition-all duration-200 text-slate-900 dark:text-white">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-[14px] font-space-grotesk">Microsoft Corp</h4>
                  <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">MSFT · Software & Cloud</p>
                </div>
                <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-450 text-[10px] font-bold tracking-wider px-2 py-0.5 rounded font-space-grotesk">
                  INVEST
                </span>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  <span>Two-Tower Confidence</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">82%</span>
                </div>
                <div className="w-full h-[3px] bg-slate-100 dark:bg-white/[0.08] rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full w-[82%]" />
                </div>
              </div>
            </div>

            {/* Card 3: Palantir Technologies */}
            <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] shadow-sm dark:shadow-none backdrop-blur-md rounded-xl p-4 hover:bg-slate-50 dark:hover:bg-white/[0.05] hover:border-slate-400 dark:hover:border-slate-500/30 transition-all duration-200 text-slate-900 dark:text-white">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-[14px] font-space-grotesk">Palantir Technologies</h4>
                  <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">PLTR · AI & Analytics</p>
                </div>
                <span className="bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-455 text-[10px] font-bold tracking-wider px-2 py-0.5 rounded font-space-grotesk">
                  WATCH
                </span>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  <span>Two-Tower Confidence</span>
                  <span className="text-amber-600 dark:text-amber-400 font-bold">65%</span>
                </div>
                <div className="w-full h-[3px] bg-slate-100 dark:bg-white/[0.08] rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full w-[65%]" />
                </div>
              </div>
            </div>

            {/* Card 4: Peloton Interactive */}
            <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] shadow-sm dark:shadow-none backdrop-blur-md rounded-xl p-4 hover:bg-slate-55/50 dark:hover:bg-white/[0.05] hover:border-slate-400 dark:hover:border-slate-500/30 transition-all duration-200 text-slate-900 dark:text-white">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-[14px] font-space-grotesk">Peloton Interactive</h4>
                  <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">PTON · Consumer Discretionary</p>
                </div>
                <span className="bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-450 text-[10px] font-bold tracking-wider px-2 py-0.5 rounded font-space-grotesk">
                  PASS
                </span>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  <span>Two-Tower Confidence</span>
                  <span className="text-rose-600 dark:text-rose-450 font-bold">18%</span>
                </div>
                <div className="w-full h-[3px] bg-slate-100 dark:bg-white/[0.08] rounded-full overflow-hidden">
                  <div className="h-full bg-rose-500 rounded-full w-[18%]" />
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 py-8 border-t border-slate-200 dark:border-white/[0.06] mt-16 md:mt-24 max-w-6xl w-full transition-colors duration-300">
          <div className="text-left">
            <div className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white font-space-grotesk tracking-tight">142,857</div>
            <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">Analyses Run</div>
          </div>
          <div className="text-left">
            <div className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white font-space-grotesk tracking-tight">89.4%</div>
            <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">Backtest Accuracy</div>
          </div>
          <div className="text-left">
            <div className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white font-space-grotesk tracking-tight">1.4s</div>
            <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">Analysis Time</div>
          </div>
          <div className="text-left">
            <div className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white font-space-grotesk tracking-tight">Yes</div>
            <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">Runs Locally</div>
          </div>
        </div>

      </div>
    </section>
  );
}
