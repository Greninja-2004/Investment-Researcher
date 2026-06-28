import os
import json
import torch
import requests
import numpy as np
import pandas as pd
import yfinance as yf
from typing import Dict, Any, List, Tuple

from investment_model.training.config import ModelConfig
from investment_model.model.tokenizer import SimpleBPETokenizer
from investment_model.model.investment_model import InvestmentModel
from investment_model.data_pipeline.build_features import NUMERICAL_FEATURE_KEYS

PROCESSED_DIR = "investment_model/data/processed"
CHECKPOINT_DIR = "investment_model/model"

def resolve_ticker(query: str) -> str:
    """
    Resolves a company name query (e.g. 'Apple') to a Yahoo Finance ticker (e.g. 'AAPL')
    using Yahoo Finance's auto-suggest API.
    """
    query = query.strip()
    if query.isupper() and len(query) <= 5:
        # Likely already a ticker
        return query
        
    url = f"https://query2.finance.yahoo.com/v1/finance/search?q={query}"
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        response = requests.get(url, headers=headers, timeout=5)
        if response.status_code == 200:
            data = response.json()
            quotes = data.get("quotes", [])
            if quotes:
                # return first equity symbol
                for q in quotes:
                    if q.get("quoteType") == "EQUITY":
                        return q.get("symbol")
    except Exception:
        pass
    return query.upper() # Fallback

def get_live_features_and_text(ticker_symbol: str) -> Tuple[Dict[str, float], str, str]:
    """
    Downloads live ratios and recent news headlines from Yahoo Finance.
    Returns:
      - metrics: dictionary of features
      - text: merged context string
      - raw_summary: raw description
    """
    ticker = yf.Ticker(ticker_symbol)
    info = ticker.info
    
    # Extract raw features from yfinance info
    metrics = {}
    
    # 1. PE Ratio
    pe = info.get("trailingPE")
    if pe is None:
        pe = info.get("forwardPE", np.nan)
    metrics["trailingPE"] = float(pe) if pe is not None else np.nan
    
    # 2. Price to Book
    metrics["priceToBook"] = float(info.get("priceToBook", np.nan))
    
    # 3. Debt to Equity
    metrics["debtToEquity"] = float(info.get("debtToEquity", np.nan))
    
    # 4. ROE
    metrics["returnOnEquity"] = float(info.get("returnOnEquity", np.nan))
    
    # 5. ROA
    metrics["returnOnAssets"] = float(info.get("returnOnAssets", np.nan))
    
    # 6. Revenue Growth
    metrics["revenueGrowth"] = float(info.get("revenueGrowth", np.nan))
    
    # 7. Profit Margin
    metrics["profitMargins"] = float(info.get("profitMargins", np.nan))
    
    # 8. Current Ratio
    metrics["currentRatio"] = float(info.get("currentRatio", np.nan))
    
    # 9. Quick Ratio
    metrics["quickRatio"] = float(info.get("quickRatio", np.nan))
    
    # 10. Free Cash Flow Yield
    fcf = info.get("freeCashflow")
    mcap = info.get("marketCap")
    if fcf is not None and mcap is not None and mcap > 0:
        metrics["freeCashflowYield"] = fcf / mcap
    else:
        metrics["freeCashflowYield"] = np.nan
        
    # 11. EBITDA Margin
    metrics["ebitdaMargins"] = float(info.get("ebitdaMargins", np.nan))
    
    # 12. Gross Margin
    metrics["grossMargins"] = float(info.get("grossMargins", np.nan))
    
    # 13. Operating Margin
    metrics["operatingMargins"] = float(info.get("operatingMargins", np.nan))
    
    # 14. Asset Turnover
    rev = info.get("totalRevenue")
    assets = info.get("totalAssets") # might be empty in info
    if rev is not None and assets is not None and assets > 0:
        metrics["assetTurnover"] = rev / assets
    else:
        metrics["assetTurnover"] = np.nan
        
    # 15. Log Revenue
    metrics["logRevenue"] = np.log10(rev) if rev is not None and rev > 0 else np.nan
    
    # 16. Market Cap
    metrics["marketCap"] = np.log10(mcap) if mcap is not None and mcap > 0 else np.nan
    
    # 17. Enterprise value to EBITDA
    metrics["enterpriseToEbitda"] = float(info.get("enterpriseToEbitda", np.nan))
    
    # 18. Dividend Yield
    metrics["dividendYield"] = float(info.get("dividendYield", 0.0)) if info.get("dividendYield") is not None else 0.0
    
    # 19. Beta
    metrics["beta"] = float(info.get("beta", 1.0)) if info.get("beta") is not None else 1.0
    
    # 20. Short Ratio
    metrics["shortRatio"] = float(info.get("shortRatio", 0.0)) if info.get("shortRatio") is not None else 0.0
    
    # Fill remaining NaNs with typical default values (0.0 after Z-score)
    for k in NUMERICAL_FEATURE_KEYS:
        if k not in metrics or pd.isna(metrics[k]):
            metrics[k] = 0.0 # will become mean after scaling
            
    # Compile text description and news headlines
    business_summary = info.get("longBusinessSummary", "No company description available.")
    news = ticker.news
    headlines = []
    if news:
        for art in news:
            title = art.get("title", "")
            if title:
                headlines.append(title)
                
    headlines_text = ". ".join(headlines)
    combined_text = f"Company: {ticker_symbol}. Sector: {info.get('sector', 'Unknown')}. Business: {business_summary}. Headlines: {headlines_text}"
    
    return metrics, combined_text, business_summary

def predict_company(company_name: str, model_path: str = None) -> dict:
    """
    Runs complete inference on a company name.
    1. Resolve ticker
    2. Download financial features & headlines
    3. Tokenize and normalize
    4. Model forward pass on MPS
    5. Compile explainability metrics
    """
    import requests # imported here for safety
    
    # 1. Resolve ticker
    ticker = resolve_ticker(company_name)
    print(f"Resolved '{company_name}' to ticker: '{ticker}'")
    
    # 2. Fetch live data
    metrics, text_corpus, raw_summary = get_live_features_and_text(ticker)
    
    # 3. Load scaling params and normalize
    scaling_path = os.path.join(PROCESSED_DIR, "scaling_params.json")
    if os.path.exists(scaling_path):
        with open(scaling_path, "r") as f:
            mean_std = json.load(f)
            
        scaled_metrics = []
        for key in NUMERICAL_FEATURE_KEYS:
            val = metrics[key]
            mean = mean_std[key]["mean"]
            std = mean_std[key]["std"]
            scaled_metrics.append((val - mean) / std)
    else:
        # Fallback raw values if scaling info not found
        scaled_metrics = [metrics[key] for key in NUMERICAL_FEATURE_KEYS]
        
    X_num = torch.tensor(scaled_metrics, dtype=torch.float32).unsqueeze(0)
    
    # 4. Tokenize text
    tokenizer_path = os.path.join(PROCESSED_DIR, "tokenizer.json")
    tokenizer = SimpleBPETokenizer()
    if os.path.exists(tokenizer_path):
        tokenizer.load(tokenizer_path)
    else:
        # Quick fallback tokenizer initialization
        print("Warning: Trained tokenizer not found. Using untrained tokenizer vocabulary.")
        tokenizer.train([text_corpus])
        
    token_ids = tokenizer.encode(text_corpus, max_len=256)
    X_text = torch.tensor(token_ids, dtype=torch.long).unsqueeze(0)
    
    # 5. Device Setup & Load model
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    
    if model_path is None:
        model_path = os.path.join(CHECKPOINT_DIR, "best_model.pt")
        
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Trained model checkpoint not found at {model_path}. Train the model first.")
        
    checkpoint = torch.load(model_path, map_location=device, weights_only=False)
    config = checkpoint["config"]
    
    model = InvestmentModel(config)
    model.load_state_dict(checkpoint["model_state_dict"])
    model = model.to(device)
    model.eval()
    
    # 6. Run Inference
    with torch.no_grad():
        X_num = X_num.to(device)
        X_text = X_text.to(device)
        logits, explain = model(X_text, X_num)
        
        probs = torch.softmax(logits, dim=1).cpu().squeeze(0).numpy()
        pred_class = int(np.argmax(probs))
        
    class_names = ["PASS", "INVEST", "UNCERTAIN"]
    verdict = class_names[pred_class]
    confidence = float(probs[pred_class])
    
    # 7. Extract explainability details
    # Numerical drivers: weight * scaled_feature value
    num_weights = explain["numerical_weights"].cpu().numpy()
    num_weights_soft = np.exp(num_weights) / np.sum(np.exp(num_weights))
    
    numerical_drivers = []
    for idx, key in enumerate(NUMERICAL_FEATURE_KEYS):
        # Driver impact score = learned importance weight * absolute value of standardized metric
        impact = float(num_weights_soft[idx] * abs(scaled_metrics[idx]))
        numerical_drivers.append((key, impact, float(metrics[key])))
        
    # Sort numerical drivers by impact
    numerical_drivers.sort(key=lambda x: x[1], reverse=True)
    
    # Text signals: match tokens with fusion cross-attention weights
    fusion_attn = explain["fusion_attn"].cpu().squeeze(0).numpy()
    tokens = [tokenizer.inv_vocab.get(tid, "[UNK]") for tid in token_ids]
    
    # Group tokens and attention
    text_signals = []
    for i, token in enumerate(tokens):
        if token in tokenizer.special_tokens or token == "</w>":
            continue
        text_signals.append((token.replace("</w>", ""), float(fusion_attn[i])))
        
    # Merge subword tokens attention weights if split (simple cleanup)
    cleaned_signals = {}
    for word, weight in text_signals:
        cleaned_signals[word] = max(cleaned_signals.get(word, 0.0), weight)
        
    sorted_text_signals = sorted(cleaned_signals.items(), key=lambda x: x[1], reverse=True)[:10]
    
    # Compile output summary
    financial_summary = {key: float(metrics[key]) for key in NUMERICAL_FEATURE_KEYS}
    
    return {
        "company": ticker,
        "verdict": verdict,
        "confidence": confidence,
        "probabilities": {name: float(probs[i]) for i, name in enumerate(class_names)},
        "key_numerical_drivers": [(driver[0], driver[1], driver[2]) for driver in numerical_drivers[:8]],
        "key_text_signals": sorted_text_signals,
        "financial_summary": financial_summary,
        "business_summary": raw_summary[:300] + "..."
    }

if __name__ == "__main__":
    import sys
    query = sys.argv[1] if len(sys.argv) > 1 else "Apple"
    try:
        res = predict_company(query)
        print("\n================ INVESTMENT RESEARCH AGENT REPORT ================")
        print(f"Company:               {res['company']}")
        print(f"Recommendation:        {res['verdict']} (Confidence: {res['confidence']*100:.1f}%)")
        print("\n--- Key Financial Drivers (Impact Scores) ---")
        for feat, score, val in res["key_numerical_drivers"]:
            print(f"  * {feat:<20}: {score:.4f} (Raw Value: {val:.2f})")
            
        print("\n--- Key Sentiment Drivers (Attention Weights) ---")
        for word, weight in res["key_text_signals"]:
            print(f"  * '{word}': {weight:.4f}")
            
        print("\n--- Summary ---")
        print(res["business_summary"])
        print("==================================================================")
    except Exception as e:
        print(f"Error executing prediction: {e}")
        import traceback
        traceback.print_exc()
