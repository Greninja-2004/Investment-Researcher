import os
import json
import pandas as pd
import numpy as np
import torch
from typing import Dict, Any, List, Tuple, Optional
from investment_model.model.tokenizer import SimpleBPETokenizer

RAW_DIR = "investment_model/data/raw"
LABELS_DIR = "investment_model/data/labels"
PROCESSED_DIR = "investment_model/data/processed"
os.makedirs(PROCESSED_DIR, exist_ok=True)

# List of the 20 financial ratios/metrics we will extract
NUMERICAL_FEATURE_KEYS = [
    "marketCap", "trailingPE", "priceToBook", "debtToEquity", "returnOnEquity",
    "returnOnAssets", "revenueGrowth", "profitMargins", "currentRatio", "quickRatio",
    "freeCashflowYield", "ebitdaMargins", "enterpriseToEbitda", "dividendYield", "beta",
    "grossMargins", "operatingMargins", "assetTurnover", "logRevenue", "shortRatio"
]

def find_key_in_dict(d: dict, candidates: List[str]) -> Optional[Any]:
    """
    Search dictionary for first matching candidate key (case-insensitive).
    """
    for c in candidates:
        for k in d.keys():
            if k.lower().strip() == c.lower().strip():
                return d[k]
    return None

def extract_annual_metrics(ticker_data: dict, stmt_date: str) -> Dict[str, float]:
    """
    Extracts financial metrics for a specific statement date from raw statements.
    """
    metrics = {}
    
    financials = ticker_data.get("financials", {})
    balance_sheet = ticker_data.get("balance_sheet", {})
    cashflow = ticker_data.get("cashflow", {})
    info = ticker_data.get("info", {})
    
    # helper to pull from statements
    def get_statement_val(statement: dict, date_col: str, candidates: List[str]) -> float:
        col_data = statement.get(date_col, {})
        val = find_key_in_dict(col_data, candidates)
        return float(val) if val is not None and not pd.isna(val) else np.nan
        
    # Extract raw balance sheet values
    total_assets = get_statement_val(balance_sheet, stmt_date, ["Total Assets", "TotalAssets", "totalAssets"])
    total_liab = get_statement_val(balance_sheet, stmt_date, ["Total Liabilities Net Minor Interest", "Total Liabilities", "totalLiabilities", "totalLiab"])
    equity = get_statement_val(balance_sheet, stmt_date, ["Stockholders Equity", "Total Stockholder Equity", "stockholdersEquity", "totalEquity"])
    curr_assets = get_statement_val(balance_sheet, stmt_date, ["Total Current Assets", "currentAssets", "totalCurrentAssets"])
    curr_liab = get_statement_val(balance_sheet, stmt_date, ["Total Current Liabilities", "currentLiabilities", "totalCurrentLiabilities"])
    cash = get_statement_val(balance_sheet, stmt_date, ["Cash Cash Equivalents And Short Term Investments", "Cash And Cash Equivalents", "cash", "cashAndCashEquivalents"])
    rec = get_statement_val(balance_sheet, stmt_date, ["Receivables", "Accounts Receivable", "receivables", "netReceivables"])
    
    # Extract raw income statement values
    revenue = get_statement_val(financials, stmt_date, ["Total Revenue", "totalRevenue", "revenue"])
    net_income = get_statement_val(financials, stmt_date, ["Net Income", "netIncome"])
    ebitda = get_statement_val(financials, stmt_date, ["EBITDA", "ebitda"])
    gross_profit = get_statement_val(financials, stmt_date, ["Gross Profit", "grossProfit"])
    operating_income = get_statement_val(financials, stmt_date, ["Operating Income", "operatingIncome"])
    
    # Extract raw cashflow values
    operating_cf = get_statement_val(cashflow, stmt_date, ["Operating Cash Flow", "totalCashFromOperatingActivities", "operatingCashFlow"])
    capex = get_statement_val(cashflow, stmt_date, ["Capital Expenditure", "capitalExpenditures", "capitalExpenditure"])
    
    # Calculate computed ratios
    # 1. P/E (we use current info as fallback, or proxy)
    metrics["trailingPE"] = info.get("trailingPE", np.nan)
    metrics["priceToBook"] = info.get("priceToBook", np.nan)
    
    # 2. Debt to Equity
    if not np.isnan(total_liab) and not np.isnan(equity) and equity != 0:
        metrics["debtToEquity"] = total_liab / equity
    else:
        metrics["debtToEquity"] = info.get("debtToEquity", np.nan)
        
    # 3. ROE
    if not np.isnan(net_income) and not np.isnan(equity) and equity != 0:
        metrics["returnOnEquity"] = net_income / equity
    else:
        metrics["returnOnEquity"] = info.get("returnOnEquity", np.nan)
        
    # 4. ROA
    if not np.isnan(net_income) and not np.isnan(total_assets) and total_assets != 0:
        metrics["returnOnAssets"] = net_income / total_assets
    else:
        metrics["returnOnAssets"] = info.get("returnOnAssets", np.nan)
        
    # 5. Revenue Growth (look for previous year in statement)
    metrics["revenueGrowth"] = info.get("revenueGrowth", np.nan)
    # 6. Profit Margin
    if not np.isnan(net_income) and not np.isnan(revenue) and revenue != 0:
        metrics["profitMargins"] = net_income / revenue
    else:
        metrics["profitMargins"] = info.get("profitMargins", np.nan)
        
    # 7. Current Ratio
    if not np.isnan(curr_assets) and not np.isnan(curr_liab) and curr_liab != 0:
        metrics["currentRatio"] = curr_assets / curr_liab
    else:
        metrics["currentRatio"] = info.get("currentRatio", np.nan)
        
    # 8. Quick Ratio
    if not np.isnan(curr_liab) and curr_liab != 0:
        cash_val = cash if not np.isnan(cash) else 0.0
        rec_val = rec if not np.isnan(rec) else 0.0
        metrics["quickRatio"] = (cash_val + rec_val) / curr_liab
    else:
        metrics["quickRatio"] = info.get("quickRatio", np.nan)
        
    # 9. Free Cash Flow Yield (FCF = OpCF - CapEx)
    fcf = np.nan
    if not np.isnan(operating_cf):
        capex_val = capex if not np.isnan(capex) else 0.0
        fcf = operating_cf - abs(capex_val)
        
    mcap = info.get("marketCap", np.nan)
    if not np.isnan(fcf) and not np.isnan(mcap) and mcap != 0:
        metrics["freeCashflowYield"] = fcf / mcap
    else:
        metrics["freeCashflowYield"] = info.get("freeCashflow", 0.0) / (mcap if not np.isnan(mcap) and mcap != 0 else 1.0)
        
    # 10. EBITDA Margin
    if not np.isnan(ebitda) and not np.isnan(revenue) and revenue != 0:
        metrics["ebitdaMargins"] = ebitda / revenue
    else:
        metrics["ebitdaMargins"] = info.get("ebitdaMargins", np.nan)
        
    # 11. Gross Margin
    if not np.isnan(gross_profit) and not np.isnan(revenue) and revenue != 0:
        metrics["grossMargins"] = gross_profit / revenue
    else:
        metrics["grossMargins"] = info.get("grossMargins", np.nan)
        
    # 12. Operating Margin
    if not np.isnan(operating_income) and not np.isnan(revenue) and revenue != 0:
        metrics["operatingMargins"] = operating_income / revenue
    else:
        metrics["operatingMargins"] = info.get("operatingMargins", np.nan)
        
    # 13. Asset Turnover
    if not np.isnan(revenue) and not np.isnan(total_assets) and total_assets != 0:
        metrics["assetTurnover"] = revenue / total_assets
    else:
        metrics["assetTurnover"] = np.nan
        
    # 14. Log Revenue
    if not np.isnan(revenue) and revenue > 0:
        metrics["logRevenue"] = np.log10(revenue)
    else:
        metrics["logRevenue"] = np.log10(info.get("totalRevenue", 1.0)) if info.get("totalRevenue", 0) > 0 else np.nan
        
    # 15. Market Cap
    metrics["marketCap"] = np.log10(mcap) if not np.isnan(mcap) and mcap > 0 else np.nan
    
    # 16. Other info details
    metrics["enterpriseToEbitda"] = info.get("enterpriseToEbitda", np.nan)
    metrics["dividendYield"] = info.get("dividendYield", 0.0) if info.get("dividendYield") is not None else 0.0
    metrics["beta"] = info.get("beta", 1.0) if info.get("beta") is not None else 1.0
    metrics["shortRatio"] = info.get("shortRatio", 0.0) if info.get("shortRatio") is not None else 0.0
    
    return metrics

def train_and_save_tokenizer() -> SimpleBPETokenizer:
    """
    Compiles news corpus texts, trains the custom BPE tokenizer, and saves it.
    """
    tokenizer_path = os.path.join(PROCESSED_DIR, "tokenizer.json")
    tokenizer = SimpleBPETokenizer(vocab_size=8000)
    
    # Build a training text corpus
    texts = []
    
    # 1. News corpus
    news_corpus_path = os.path.join(RAW_DIR, "news_corpus.json")
    if os.path.exists(news_corpus_path):
        with open(news_corpus_path, "r") as f:
            corpus = json.load(f)
        texts.extend(corpus.get("financial_phrasebank", []))
        texts.extend(corpus.get("yfinance_headlines", []))
        
    # 2. SEC 10-K sections
    for file in os.listdir(RAW_DIR):
        if file.endswith("_sec.json"):
            with open(os.path.join(RAW_DIR, file), "r") as f:
                sec = json.load(f)
            texts.append(sec.get("business", ""))
            texts.append(sec.get("risk_factors", ""))
            
    # Remove empty texts
    texts = [t for t in texts if t and len(t.strip()) > 10]
    
    # Train BPE
    print(f"Training Custom BPE Tokenizer on {len(texts)} texts...")
    tokenizer.train(texts)
    tokenizer.save(tokenizer_path)
    print(f"Tokenizer saved to {tokenizer_path}.")
    
    return tokenizer

def build_features():
    """
    Main entry point to assemble normalized features and tokenized sequences.
    """
    # 1. Load labels
    labels_path = os.path.join(LABELS_DIR, "labels.parquet")
    if not os.path.exists(labels_path):
        print("Error: Run build_labels.py first.")
        return
        
    labels_df = pd.read_parquet(labels_path)
    
    # 2. Train or Load Tokenizer
    tokenizer = train_and_save_tokenizer()
    
    # 3. Pull numerical metrics and text data for each row
    rows_num = []
    rows_text = []
    valid_indices = []
    
    # Keep track of sector mapping for median imputation
    sector_map = {}
    
    print("Extracting features from raw statements...")
    for idx, row in labels_df.iterrows():
        ticker = row["ticker"]
        stmt_date = row["statement_date"]
        
        json_path = os.path.join(RAW_DIR, f"{ticker}_raw.json")
        sec_path = os.path.join(RAW_DIR, f"{ticker}_sec.json")
        
        if not os.path.exists(json_path):
            continue
            
        with open(json_path, "r") as f:
            raw_data = json.load(f)
            
        # Parse sector
        info = raw_data.get("info", {})
        sector = info.get("sector", "Unknown")
        sector_map[ticker] = sector
        
        # Extract numerical metrics
        metrics = extract_annual_metrics(raw_data, stmt_date)
        metrics["sector"] = sector
        rows_num.append(metrics)
        
        # Unstructured text extraction
        business = ""
        risk_factors = ""
        if os.path.exists(sec_path):
            with open(sec_path, "r") as f:
                sec_data = json.load(f)
            business = sec_data.get("business", "")
            risk_factors = sec_data.get("risk_factors", "")
            
        # News headlines fallback if SEC is small
        headlines = ""
        news_corpus_path = os.path.join(RAW_DIR, "news_corpus.json")
        if os.path.exists(news_corpus_path):
            with open(news_corpus_path, "r") as f:
                corpus = json.load(f)
            raw_news = corpus.get("raw_yf_news", {})
            headlines = ". ".join(raw_news.get(ticker, []))
            
        combined_text = f"Company: {ticker}. Sector: {sector}. Business: {business}. Risks: {risk_factors}. Headlines: {headlines}"
        # Tokenize (using 256 limit)
        token_ids = tokenizer.encode(combined_text, max_len=256)
        rows_text.append(token_ids)
        
        valid_indices.append(idx)
        
    # Align labels with existing features
    labels_df = labels_df.loc[valid_indices].reset_index(drop=True)
    num_df = pd.DataFrame(rows_num)
    
    # 4. Handle missing values: Median imputation by sector (or general median if sector missing)
    for col in NUMERICAL_FEATURE_KEYS:
        if col in num_df.columns:
            # Impute per sector
            num_df[col] = num_df.groupby("sector")[col].transform(lambda x: x.fillna(x.median()))
            # Global fallback for remaining NaNs
            global_median = num_df[col].median()
            if pd.isna(global_median):
                global_median = 0.0 # final fallback
            num_df[col] = num_df[col].fillna(global_median)
        else:
            num_df[col] = 0.0 # fill missing columns entirely
            
    # Winsorize / clip outliers (1% and 99%)
    for col in NUMERICAL_FEATURE_KEYS:
        lower = num_df[col].quantile(0.01)
        upper = num_df[col].quantile(0.99)
        if lower < upper:
            num_df[col] = np.clip(num_df[col], lower, upper)
            
    # Normalize: Z-score scaling
    mean_std = {}
    for col in NUMERICAL_FEATURE_KEYS:
        mean = num_df[col].mean()
        std = num_df[col].std()
        std = std if std > 1e-5 else 1.0
        num_df[col] = (num_df[col] - mean) / std
        mean_std[col] = {"mean": float(mean), "std": float(std)}
        
    # Save scaling params for production inference
    scaling_path = os.path.join(PROCESSED_DIR, "scaling_params.json")
    with open(scaling_path, "w") as f:
        json.dump(mean_std, f, indent=2)
        
    # 5. Package and Save Tensors
    X_num = torch.tensor(num_df[NUMERICAL_FEATURE_KEYS].values, dtype=torch.float32)
    X_text = torch.tensor(rows_text, dtype=torch.long)
    y = torch.tensor(labels_df["label"].values, dtype=torch.long)
    
    # Create temporal splits
    splits = labels_df["split"].values
    
    train_idx = np.where(splits == "train")[0]
    val_idx = np.where(splits == "val")[0]
    test_idx = np.where(splits == "test")[0]
    
    processed_data = {
        "train": (X_num[train_idx], X_text[train_idx], y[train_idx]),
        "val": (X_num[val_idx], X_text[val_idx], y[val_idx]),
        "test": (X_num[test_idx], X_text[test_idx], y[test_idx]),
        "tickers": labels_df["ticker"].values,
        "statement_dates": labels_df["statement_date"].values,
        "splits": splits
    }
    
    output_pt_path = os.path.join(PROCESSED_DIR, "dataset.pt")
    torch.save(processed_data, output_pt_path)
    print(f"Processed dataset saved successfully to {output_pt_path}.")
    print(f"Train samples: {len(train_idx)}, Val: {len(val_idx)}, Test: {len(test_idx)}")

if __name__ == "__main__":
    build_features()
