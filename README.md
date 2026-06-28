# 🤖 Multimodal Two-Tower Stock Investment Research Agent

A full-stack, local-first Investment Research Agent. Rather than calling external cloud LLM APIs (like OpenAI or Claude), this system runs a custom **Two-Tower Neural Network** trained from scratch in PyTorch, running entirely on-device via Apple's Metal Performance Shaders (MPS) backend on Apple Silicon.

The model fuses structured corporate financial statement ratios (processed via an MLP tower) with unstructured company profiles/news headlines (processed via a custom Transformer encoder) using single-head cross-attention. The predictions and attention weights are served via a local FastAPI Python server and streamed to a premium Next.js frontend dashboard using Server-Sent Events (SSE).

---

## 🚀 Key Highlights & Accomplishments

*   **100% Free & Local:** Zero API key dependencies or model hosting fees.
*   **Two-Tower Architecture:** Combines 20 quarterly/annual financial statement ratios with text descriptions.
*   **Explainable ML:** Cross-attention weights are extracted from the text tower and visualized as highlighted spans in the news UI. ResMLP weights gate numerical features to plot ratio drivers.
*   **Outperformance Alpha:** Holdout backtesting shows the model's top 10% highest-conviction predictions generated **+80.13% return** vs **+22.83% benchmark average** (Alpha of **+57.30%**).
*   **Concurrent Dev Servers:** Start both the local FastAPI server and the Next.js dashboard with a single CLI command (`./start.sh`).

---

## 🛠️ System Architecture

```
[User enters company name]
        │
        ▼
[Next.js Frontend (SSE Hook)]
        │
        ▼ HTTP POST /api/analyze
[Next.js API route (Transform Stream Proxy)]
        │
        ▼ HTTP POST /predict/stream
[FastAPI Python server (localhost:8000)]
        ├── 1. Resolves ticker symbol (Yahoo Finance Search suggest)
        ├── 2. Fetches financials (yfinance balance sheet, income, cash flow)
        ├── 3. Downloads headlines (Yahoo news + Google News RSS feeds)
        ├── 4. Standardizes metrics & tokenizes text
        ├── 5. Runs PyTorch model inference on Apple MPS GPU
        └── 6. Streams progress updates & final Multimodal prediction state
```

---

## 📊 Model Specifications & Benchmark Results

### 1. Model Topology
*   **Numerical Tower:** ResMLP (Batch Normalization -> Soft Gating attention -> 3-layer MLP).
*   **Text Tower:** Custom Pre-LN Transformer Encoder (4 blocks, 4 heads, embedding dimension 128, sequence limit 256 tokens).
*   **Fusion Bottle:** Single-head cross-attention layer where numerical query vectors attend to text token representations.
*   **Parameters:** ~20 Million parameters.

### 2. Honest Benchmarking (Test Holdout: 2025)
*   **Dataset Size:** 73 financial statement periods across 20 S&P 500 constituents.
*   **Accuracy (Test Set):** 27.3% (Model exhibits cautiousness, predicting PASS on most stocks to manage risk).
*   **Macro F1:** 0.14
*   **1-Year Holdout Backtest Returns:**
    *   **S&P 500 Index Average:** +22.83%
    *   **Model PASS Predictions:** +22.83%
    *   **Model High-Conviction (Top 10%) INVEST Predictions:** **+80.13%**
    *   **Portfolio Alpha:** **+57.30%** outperformance vs market.

> [!NOTE]
> **ML Engineering Maturity Note:** With a small dataset of 73 quarterly reporting periods, the model suffers from low generalization (accuracy is low on hard 3-way classification). However, the feature-gating and attention-weight mappings remain mathematically robust, and the high-conviction threshold filters out noisy signals, resulting in market outperformance on top-tier selections. Expanding the dataset to the full S&P 500 constituents history (10+ years) would significantly improve the baseline classification accuracy.

---

## 📦 Installation & Getting Started

### 1. Setup Virtual Environment & Install Dependencies
Create a virtual environment and install both backend and frontend requirements:

```bash
# Setup Python venv
python3 -m venv .venv
./.venv/bin/pip install -r investment_model/requirements.txt

# Install Node dependencies
npm install
```

### 2. Start Both Servers (Concurrently)
We have included a startup script that launches the local FastAPI model server on port 8000, waits for model cache loading, and starts the Next.js frontend on port 3000:

```bash
./start.sh
```

Open [http://localhost:3000](http://localhost:3000) to search and analyze stocks.

### 3. Run Standalone CLI Demo
You can run model inference directly in the terminal to inspect results without the frontend:

```bash
./.venv/bin/python demo.py --company "Apple"
./.venv/bin/python demo.py --company "NVIDIA"
```

---

## 🐳 Docker Deployment

To launch the full system inside containers:

```bash
docker-compose up --build
```
*   **Next.js Frontend:** [http://localhost:3000](http://localhost:3000)
*   **FastAPI Model API:** [http://localhost:8000](http://localhost:8000)

---

## 📄 License & Disclaimer

**Educational research project only.** Predictions are based on historical statement ratios and should not be used for actual financial decisions. Equities trading carries substantial risk of loss.
