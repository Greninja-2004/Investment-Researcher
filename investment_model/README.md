# Custom Multimodal Two-Tower Stock Investment Classifier

An educational, local-first machine learning system built from scratch in Python using PyTorch. The model combines structured corporate financial statement ratios with unstructured market sentiment/company descriptions to classify stock symbols as **INVEST** (1), **PASS** (0), or **UNCERTAIN** (2).

This system is optimized for local training and inference on **Apple Silicon (M1/M2/M3) Macbooks with 8GB RAM** using the Metal Performance Shaders (MPS) backend, operating under a tight memory footprint (~1.2GB RAM during training).

---

## 1. Architecture Overview

The system uses a late-fusion **Two-Tower** layout, allowing the numerical financial tower and the text sentiment/description tower to encode their inputs independently before joining in a cross-attention fusion bottleneck.

```
 Tabular Input (20 Ratios)
       │
       ▼
 ┌───────────────┐
 │Numerical Tower│ (BatchNorm -> Learnable Feature Gating -> ResMLP)
 └───────┬───────┘
         │ (128-dim Vector Query)
         ▼
 ┌───────────────┐
 │Cross-Attention│ <── (128-dim Sequence Key/Value) ── [CLS] & text sequence representation
 │    Fusion     │
 └───────┬───────┘
         │ (128-dim Joint Latent bottleneck)
         ▼
 ┌───────────────┐
 │Classifier Head│ (Linear -> GELU -> Dropout -> Linear)
 └───────┬───────┘
         │
         ▼
 Verdict: INVEST / PASS / UNCERTAIN
```

### Components
*   **Numerical Tower:** An input Batch Normalization layer, followed by a learned soft-gating attention vector over the 20 financial ratios (which outputs feature importances). Then projects through a 3-layer residual MLP (dimension 20 -> 128 -> 64 -> 128) with Swish/GELU activations.
*   **Text Tower:** A custom-built (from scratch) 4-block, 4-head Transformer Encoder with Positional Embeddings and Pre-LayerNorm (pre-LN). Encodes a 256-token sequence of combined company descriptions (10-K risk/business sections) and recent headlines.
*   **Cross-Attention Fusion:** A single-head cross-attention layer where the numerical embedding vector acts as the Query, attending to the text sequence representations (Keys/Values). This allows the financial ratios to dynamically attend to specific segments of text.
*   **Classifier:** A 2-layer classification MLP outputting raw class logits.

---

## 2. Feature Specification (20 Financial Ratios)

The model evaluates these 20 metrics (Winsorized at 1% and 99%, Standardized using Z-score):

1.  `marketCap` (Log10 market capitalization)
2.  `trailingPE` (Price-to-Earnings Ratio)
3.  `priceToBook` (Price-to-Book Ratio)
4.  `debtToEquity` (Debt-to-Equity ratio)
5.  `returnOnEquity` (Return on Equity)
6.  `returnOnAssets` (Return on Assets)
7.  `revenueGrowth` (Year-over-Year revenue growth)
8.  `profitMargins` (Net profit margin)
9.  `currentRatio` (Current assets / Current liabilities)
10. `quickRatio` (Liquid assets / Current liabilities)
11. `freeCashflowYield` (Free cash flow / Market Cap)
12. `ebitdaMargins` (EBITDA margin)
13. `enterpriseToEbitda` (EV/EBITDA ratio)
14. `dividendYield` (Annual dividend yield)
15. `beta` (Systematic risk coefficient)
16. `grossMargins` (Gross margin)
17. `operatingMargins` (Operating income margin)
18. `assetTurnover` (Total revenue / Total assets)
19. `logRevenue` (Log10 total revenue)
20. `shortRatio` (Float short percent/short ratio)

---

## 3. Installation & Local Setup

### Prerequisites
*   Python 3.10+
*   MacOS with Apple Silicon (recommended)

### Installation
Initialize a virtual environment and install the required dependencies:

```bash
# Initialize venv
python3 -m venv .venv

# Activate venv
source .venv/bin/activate

# Install requirements
.venv/bin/pip install -r investment_model/requirements.txt
```

---

## 4. Running the Data & Training Pipelines

Run the steps in order:

### Step A: Download Yahoo Finance Financials & Price History
Fetches 7 years of daily stock prices and annual balance sheet, income statement, and cash flow statements for S&P 500 components (default limits to 40 tickers for speed):
```bash
./.venv/bin/python -m investment_model.data_pipeline.fetch_yahoo
```

### Step B: Fetch SEC EDGAR 10-K Risks & Business Descriptions
Downloads latest 10-K sections from SEC databases (falls back to Yahoo summaries if blocked/no CIK matches):
```bash
./.venv/bin/python -m investment_model.data_pipeline.fetch_edgar
```

### Step C: Fetch News headlines & Sentiment Sentences
Downloads news headlines for constituents and HuggingFace's `FinancialPhraseBank` dataset to compile a vocabulary corpus:
```bash
./.venv/bin/python -m investment_model.data_pipeline.fetch_news
```

### Step D: Build Labels
Calculates 1-year forward absolute returns from filing publication date + 90 days. Label construction:
*   Return > +15%: **INVEST** (1)
*   Return < -5%: **PASS** (0)
*   Else: **UNCERTAIN** (2)
```bash
./.venv/bin/python -m investment_model.data_pipeline.build_labels
```

### Step E: Build Features
Normalizes ratios, performs sector-based median imputation, trains the BPE tokenizer (vocab size 8,000) on the news corpus, and packages datasets:
```bash
./.venv/bin/python -m investment_model.data_pipeline.build_features
```

### Step F: Train the Model
Trains the model on Apple Silicon MPS with Warmup Cosine scheduler, Mixed-Precision (Autocast), and gradient clipping:
```bash
./.venv/bin/python -m investment_model.training.train
```

### Step G: Run Evaluation & Backtest
Generates performance metrics on the test set (Precision/Recall, backtest outperformance, attention visualizations, and numerical feature importance bar charts):
```bash
./.venv/bin/python -m investment_model.training.evaluate
```

---

## 5. Inference & Model Interpretability

### Predicting a Company
To predict on any stock symbol or name (queries auto-resolve using Yahoo Finance Search API):

```bash
./.venv/bin/python -m investment_model.inference.predict "NVIDIA"
```

### Generating Explanation Report
This generates attention heatmap charts showing which news text words drove the decision, and bar charts showing which financial ratios had the highest impact on the decision:

```bash
./.venv/bin/python -m investment_model.inference.explain "Apple"
```
The charts will be saved to `investment_model/data/processed/`.

---

## 6. Disclaimer

**Educational project only.** The stock classification model, calculations, backtest simulations, and recommendations generated by this software are for educational and demonstrations purposes. They **do not** constitute investment advice or financial services. Equities markets carry substantial risk of loss.
