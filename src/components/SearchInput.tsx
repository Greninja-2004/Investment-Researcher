"use client";

import React, { useState, useRef, DragEvent } from "react";
import { Search, Upload, FileText, CheckCircle, AlertCircle, X } from "lucide-react";

interface SearchInputProps {
  onSearch: (companyName: string, vectorStoreId: string | null, fileName: string | null) => void;
  disabled?: boolean;
}

export default function SearchInput({ onSearch, disabled }: SearchInputProps) {
  const [companyName, setCompanyName] = useState("");
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
    if (!companyName.trim() || disabled || uploading) return;
    onSearch(companyName, vectorStoreId, file ? file.name : null);
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <form onSubmit={handleSubmit} className="relative">
        <div className="flex items-center glass-panel rounded-2xl overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500/50 p-2">
          <Search className="w-6 h-6 text-zinc-400 ml-3" />
          <input
            type="text"
            placeholder="Search company (e.g. Apple, OpenAI, Nvidia)..."
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            disabled={disabled}
            className="w-full bg-transparent px-4 py-3 outline-none text-zinc-100 placeholder-zinc-500 font-sans text-lg"
          />
          <button
            type="submit"
            disabled={!companyName.trim() || disabled || uploading}
            className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-medium px-6 py-3 rounded-xl transition duration-150 flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Research
          </button>
        </div>
      </form>

      {/* RAG Drag & Drop Document Box */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => !file && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 ${
          dragActive
            ? "border-emerald-500 bg-emerald-500/5"
            : file
            ? "border-zinc-700 bg-zinc-900/30 cursor-default"
            : "border-zinc-800 hover:border-zinc-700 bg-zinc-900/10 hover:bg-zinc-900/20"
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
            <Upload className="w-8 h-8 text-zinc-400 mx-auto" />
            <div className="text-zinc-300 font-medium">
              Drag & drop a document to enable RAG-based analysis
            </div>
            <div className="text-zinc-500 text-sm">
              Supports 10-K report, earnings transcript, pitch deck (.pdf, .txt)
            </div>
          </div>
        )}

        {uploading && (
          <div className="space-y-2 py-2">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <div className="text-zinc-300">Processing and indexing uploaded document...</div>
          </div>
        )}

        {file && !uploading && (
          <div className="flex items-center justify-between bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 max-w-md mx-auto">
            <div className="flex items-center gap-3">
              <FileText className="w-6 h-6 text-emerald-500" />
              <div className="text-left">
                <div className="text-zinc-200 font-medium truncate max-w-[200px]">{file.name}</div>
                <div className="text-zinc-500 text-xs">RAG Context Loaded</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {vectorStoreId ? (
                <CheckCircle className="w-5 h-5 text-emerald-500" />
              ) : (
                <span className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile();
                }}
                className="text-zinc-500 hover:text-zinc-300 p-1 hover:bg-zinc-800 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {uploadError && (
          <div className="flex items-center gap-2 text-rose-500 justify-center mt-3 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>{uploadError}</span>
          </div>
        )}
      </div>
    </div>
  );
}
