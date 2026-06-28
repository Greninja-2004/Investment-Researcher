"use client";

import React, { useState, useRef, DragEvent } from "react";
import { Search, Upload, FileText, CheckCircle, AlertCircle, X, Loader2 } from "lucide-react";

interface SearchBarProps {
  onSearch: (companyName: string, vectorStoreId: string | null, fileName: string | null) => void;
  isLoading: boolean;
}

export default function SearchBar({ onSearch, isLoading }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [vectorStoreId, setVectorStoreId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <form onSubmit={handleSubmit} className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-600 to-emerald-500 rounded-2xl blur opacity-20 group-focus-within:opacity-40 transition duration-300" />
        
        <div className="relative flex items-center bg-white border border-[rgba(0,0,0,0.07)] rounded-2xl overflow-hidden px-4 py-2 shadow-sm">
          <Search className="w-5 h-5 text-slate-400 flex-shrink-0" />
          
          <input
            type="text"
            placeholder="Search company (e.g. Apple, Nvidia, Tesla)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isLoading || uploading}
            className="w-full bg-transparent px-3 py-3 outline-none text-[#1A1A1A] placeholder-slate-400 text-lg font-sans disabled:cursor-not-allowed"
          />

          <button
            type="submit"
            disabled={!query.trim() || isLoading || uploading}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold px-6 py-3 rounded-xl transition duration-150 shadow-lg shadow-violet-900/10 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Running Agent...</span>
              </>
            ) : (
              <span>Analyze</span>
            )}
          </button>
        </div>
      </form>

      {/* RAG PDF Drag & Drop Upload Container */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => !file && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 ${
          dragActive
            ? "border-emerald-500 bg-emerald-50/5"
            : file
            ? "border-[rgba(0,0,0,0.07)] bg-white cursor-default shadow-sm"
            : "border-[rgba(0,0,0,0.07)] hover:border-slate-300 bg-white hover:bg-slate-50/50 shadow-sm"
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
          <div className="space-y-2">
            <Upload className="w-8 h-8 text-slate-400 mx-auto" />
            <div className="text-[#6B6B6B] text-sm font-medium">
              Drag & drop a financial report to enable RAG-based context
            </div>
            <div className="text-slate-400 text-xs">
              Supports 10-K filings, earnings call transcripts, or pitch decks (.pdf, .txt)
            </div>
          </div>
        )}

        {uploading && (
          <div className="space-y-2 py-2">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
            <div className="text-[#6B6B6B] text-xs font-mono">Splitting & Indexing vectors locally...</div>
          </div>
        )}

        {file && !uploading && (
          <div className="flex items-center justify-between bg-[#F8F8F6] border border-[rgba(0,0,0,0.07)] rounded-xl p-3.5 max-w-md mx-auto">
            <div className="flex items-center gap-3 text-left">
              <FileText className="w-5 h-5 text-emerald-600" />
              <div>
                <div className="text-[#1A1A1A] text-xs font-semibold truncate max-w-[200px]">{file.name}</div>
                <div className="text-[#6B6B6B] text-[10px] font-mono">Local TF-IDF Vector Index Loaded</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {vectorStoreId ? (
                <CheckCircle className="w-4.5 h-4.5 text-emerald-650" />
              ) : (
                <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile();
                }}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded transition cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>
        )}

        {uploadError && (
          <div className="flex items-center gap-2 text-rose-600 justify-center mt-3 text-xs">
            <AlertCircle className="w-4 h-4" />
            <span>{uploadError}</span>
          </div>
        )}
      </div>
    </div>
  );
}
