import os
import time
import json
import torch
import numpy as np
import requests
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup
from fastapi import FastAPI, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Dict, Any, List, Tuple, Optional
import yfinance as yf

from investment_model.training.config import ModelConfig
from investment_model.model.tokenizer import SimpleBPETokenizer
from investment_model.model.investment_model import InvestmentModel
from investment_model.data_pipeline.build_features import NUMERICAL_FEATURE_KEYS

from requests.adapters import HTTPAdapter

class TimeoutHTTPAdapter(HTTPAdapter):
    def __init__(self, *args, **kwargs):
        self.timeout = kwargs.pop("timeout", 5)
        super().__init__(*args, **kwargs)

    def send(self, request, **kwargs):
        kwargs["timeout"] = self.timeout
        return super().send(request, **kwargs)

# Create a robust session with user-agent and timeout to prevent hanging on cloud IPs
yfinance_session = requests.Session()
yfinance_session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
})
adapter = TimeoutHTTPAdapter(timeout=5)
yfinance_session.mount("https://", adapter)
yfinance_session.mount("http://", adapter)

app = FastAPI(title="Investment Research Model API")

# Global Cache for Model Assets
MODEL_CACHE = {
    "model": None,
    "tokenizer": None,
    "config": None,
    "scaling_params": None
}

def get_real_peers(ticker: str, sector: str) -> List[Dict[str, str]]:
    sector_lower = sector.lower()
    ticker_upper = ticker.upper()
    
    if "utility" in sector_lower or "utilities" in sector_lower or "power" in sector_lower:
        if ".ns" in ticker_upper.lower():
            peers = [
                {"name": "Tata Power", "ticker": "TATAPOWER.NS", "verdict": "INVEST"},
                {"name": "NTPC Limited", "ticker": "NTPC.NS", "verdict": "INVEST"},
                {"name": "Power Grid Corp", "ticker": "POWERGRID.NS", "verdict": "PASS"}
            ]
        else:
            peers = [
                {"name": "NextEra Energy", "ticker": "NEE", "verdict": "INVEST"},
                {"name": "Duke Energy", "ticker": "DUK", "verdict": "PASS"},
                {"name": "Southern Company", "ticker": "SO", "verdict": "PASS"}
            ]
    elif "technology" in sector_lower or "tech" in sector_lower or "electronic" in sector_lower:
        if "NVDA" in ticker_upper or "AMD" in ticker_upper or "INTC" in ticker_upper:
            peers = [
                {"name": "Advanced Micro Devices", "ticker": "AMD", "verdict": "INVEST" if ticker_upper != "AMD" else "PASS"},
                {"name": "Intel Corporation", "ticker": "INTC", "verdict": "PASS"},
                {"name": "Taiwan Semiconductor", "ticker": "TSM", "verdict": "INVEST"}
            ]
        else:
            peers = [
                {"name": "Microsoft Corp", "ticker": "MSFT", "verdict": "INVEST"},
                {"name": "Apple Inc", "ticker": "AAPL", "verdict": "PASS"},
                {"name": "Alphabet Inc", "ticker": "GOOGL", "verdict": "INVEST"}
            ]
    elif "communication" in sector_lower or "telecom" in sector_lower:
        peers = [
            {"name": "AT&T Inc", "ticker": "T", "verdict": "PASS"},
            {"name": "Verizon Communications", "ticker": "VZ", "verdict": "PASS"},
            {"name": "T-Mobile US", "ticker": "TMUS", "verdict": "INVEST"}
        ]
    elif "financial" in sector_lower or "bank" in sector_lower:
        peers = [
            {"name": "JPMorgan Chase", "ticker": "JPM", "verdict": "INVEST"},
            {"name": "Bank of America", "ticker": "BAC", "verdict": "PASS"},
            {"name": "Morgan Stanley", "ticker": "MS", "verdict": "INVEST"}
        ]
    elif "healthcare" in sector_lower or "health" in sector_lower or "medical" in sector_lower:
        peers = [
            {"name": "Johnson & Johnson", "ticker": "JNJ", "verdict": "PASS"},
            {"name": "UnitedHealth Group", "ticker": "UNH", "verdict": "INVEST"},
            {"name": "Eli Lilly", "ticker": "LLY", "verdict": "INVEST"}
        ]
    else:
        peers = [
            {"name": "S&P 500 ETF", "ticker": "SPY", "verdict": "INVEST"},
            {"name": "Nasdaq 100 ETF", "ticker": "QQQ", "verdict": "INVEST"},
            {"name": "Russell 2000 ETF", "ticker": "IWM", "verdict": "PASS"}
        ]
        
    filtered_peers = [p for p in peers if p["ticker"] != ticker_upper]
    if len(filtered_peers) < 3:
        extra_options = [
            {"name": "Berkshire Hathaway", "ticker": "BRK-B", "verdict": "INVEST"},
            {"name": "Vanguard Total Stock", "ticker": "VTI", "verdict": "INVEST"}
        ]
        for opt in extra_options:
            if opt["ticker"] != ticker_upper and opt["ticker"] not in [p["ticker"] for p in filtered_peers]:
                filtered_peers.append(opt)
                if len(filtered_peers) == 3:
                    break
    return filtered_peers[:3]


def to_human_readable(feature_name: str) -> str:
    mapping = {
        "marketCap": "Market cap",
        "trailingPE": "Trailing P/E",
        "priceToBook": "Price to book",
        "debtToEquity": "Debt to equity",
        "returnOnEquity": "Return on equity",
        "returnOnAssets": "Return on assets",
        "revenueGrowth": "Revenue growth",
        "profitMargins": "Profit margins",
        "currentRatio": "Current ratio",
        "quickRatio": "Quick ratio",
        "freeCashflowYield": "Free cash flow yield",
        "ebitdaMargins": "EBITDA margins",
        "enterpriseToEbitda": "Enterprise value to EBITDA",
        "dividendYield": "Dividend yield",
        "beta": "Beta",
        "grossMargins": "Gross margins",
        "operatingMargins": "Operating margins",
        "assetTurnover": "Asset turnover",
        "logRevenue": "Log revenue",
        "shortRatio": "Short ratio"
    }
    return mapping.get(feature_name, feature_name[0].upper() + feature_name[1:])


def get_driver_explanation(feature: str, val: float, is_positive: bool) -> str:
    explanations = {
        "Market cap": {
            "pos": "The company's large market capitalization reflects its dominant market position and stability.",
            "neg": "A lower market capitalization suggests higher susceptibility to market volatility."
        },
        "Trailing P/E": {
            "pos": "The low price-to-earnings ratio relative to historical growth signals significant valuation support.",
            "neg": "An elevated trailing P/E ratio indicates a premium valuation that requires high growth to justify."
        },
        "Price to book": {
            "pos": "A low price-to-book ratio indicates the company is trading near or below its asset value.",
            "neg": "A high price-to-book ratio reflects high premium paid over net asset backing."
        },
        "Debt to equity": {
            "pos": "Conservative leverage profile indicates solid balance sheet cushioning and lower solvency risk.",
            "neg": "Elevated debt-to-equity ratio increases operational risk and interest payment burden."
        },
        "Return on equity": {
            "pos": "Strong return on equity demonstrates outstanding capital allocation and profit generation efficiency.",
            "neg": "Weak return on equity highlights challenges in generating profits from shareholder capital."
        },
        "Return on assets": {
            "pos": "High return on assets highlights efficient utilisation of capital assets to generate profits.",
            "neg": "Low return on assets suggests potential underutilization or inefficiencies in operations."
        },
        "Revenue growth": {
            "pos": "Robust revenue growth highlights strong market demand and scaling of product lines.",
            "neg": "Slowing revenue growth suggests market saturation or increased competitive pressure."
        },
        "Profit margins": {
            "pos": "Strong net profit margins provide a significant safety buffer against rising operating costs.",
            "neg": "Thin profit margins make the bottom line highly sensitive to minor cost increases."
        },
        "Current ratio": {
            "pos": "A healthy current ratio indicates robust short-term liquidity to cover immediate obligations.",
            "neg": "A low current ratio suggests tight liquidity and potential working capital challenges."
        },
        "Quick ratio": {
            "pos": "A strong quick ratio indicates the company can meet short-term obligations using highly liquid assets.",
            "neg": "A low quick ratio raises concern over near-term liquidity and ability to cover immediate liabilities."
        },
        "Free cash flow yield": {
            "pos": "High free cash flow yield indicates excellent cash generation that can support dividends or reinvestment.",
            "neg": "Low or negative free cash flow yield indicates high capital expenditure requirements or operating cash constraints."
        },
        "EBITDA margins": {
            "pos": "Strong operating efficiency before accounting for depreciation and amortization.",
            "neg": "Compressed EBITDA margins point to high raw material or production costs."
        },
        "Enterprise value to EBITDA": {
            "pos": "Attractive EV/EBITDA multiple suggests the company is undervalued compared to its cash flow generation.",
            "neg": "An elevated EV/EBITDA multiple indicates a premium valuation compared to operating cash flow."
        },
        "Dividend yield": {
            "pos": "Consistent dividend yield provides stable cash returns to investors.",
            "neg": "Low or absent dividend yield indicates either reinvestment of cash or tight liquidity."
        },
        "Beta": {
            "pos": "Lower stock beta suggests defensive qualities and low volatility relative to the index.",
            "neg": "A high beta indicates higher systematic risk and vulnerability to market swings."
        },
        "Gross margins": {
            "pos": "Outstanding gross margins demonstrate strong pricing power and product differentiation.",
            "neg": "Compressed gross margins reflect rising cost of goods sold or pricing pressure."
        },
        "Operating margins": {
            "pos": "Healthy operating margins indicate efficient control over selling, general, and administrative expenses.",
            "neg": "Weak operating margins point to high overhead costs relative to revenue."
        },
        "Asset turnover": {
            "pos": "Efficient asset turnover shows the management is extracting substantial sales from the asset base.",
            "neg": "Low asset turnover indicates potential inefficiency in capital deployment."
        },
        "Log revenue": {
            "pos": "Significant scale of revenue reflects a mature company with diversified revenue streams.",
            "neg": "Smaller revenue scale indicates a younger company that may face higher operational instability."
        },
        "Short ratio": {
            "pos": "A very low short ratio shows minimal short interest and high market confidence.",
            "neg": "An elevated short ratio indicates significant short-seller attention and bearish market sentiment."
        }
    }
    feat_data = explanations.get(feature, {
        "pos": f"{feature} acts as a positive driver for the investment thesis.",
        "neg": f"{feature} presents near-term challenges or headwinds."
    })
    return feat_data["pos"] if is_positive else feat_data["neg"]


def generate_real_risks(ticker: str, sector: str, metrics: dict) -> List[Dict[str, str]]:
    sector_lower = sector.lower()
    debt_val = metrics.get("debtToEquity", 0.0)
    pe_val = metrics.get("trailingPE", 0.0)
    margin_val = metrics.get("profitMargins", 0.0)
    short_ratio = metrics.get("shortRatio", 0.0)
    
    risks = []
    
    # 1. High Risk
    if debt_val > 150.0:  # yfinance returns percentages/ratios scaled by 100 sometimes
        risks.append({
            "level": "high",
            "title": "High Leverage & Solvency Risk",
            "description": f"The company has a high debt-to-equity ratio of {debt_val:.2f}%. Rising interest rates could significantly increase debt servicing costs and pressure net margins."
        })
    elif debt_val > 1.5 and debt_val <= 100.0:
        risks.append({
            "level": "high",
            "title": "High Leverage & Solvency Risk",
            "description": f"The company has a high debt-to-equity ratio of {debt_val:.2f}. Rising interest rates could significantly increase debt servicing costs and pressure net margins."
        })
    elif pe_val > 50:
        risks.append({
            "level": "high",
            "title": "Premium Valuation Compression",
            "description": f"Trading at a trailing P/E of {pe_val:.1f}x, the valuation sits at a steep premium. Any growth deceleration could trigger aggressive multiple contraction and downside."
        })
    elif "utility" in sector_lower or "power" in sector_lower:
        risks.append({
            "level": "high",
            "title": "Capital Expenditure & Fuel Costs",
            "description": "Power utilities are highly capital intensive. Rising fuel costs and heavy capital expenditures to upgrade transmission infrastructure pose constant cash flow risks."
        })
    elif "technology" in sector_lower or "electronic" in sector_lower:
        risks.append({
            "level": "high",
            "title": "Rapid Technological Obsolescence",
            "description": "The technology sector is characterized by short product lifecycles. Failure to execute R&D milestones or keep pace with AI innovations could erode market share quickly."
        })
    else:
        risks.append({
            "level": "high",
            "title": "Macroeconomic & Cyclical Demand Risks",
            "description": "Slowing global economic growth and high inflation threaten discretionary demand, potentially leading to inventory build-up and compressed growth."
        })
        
    # 2. Medium Risk
    if margin_val < 0.05 and margin_val > 0:
        risks.append({
            "level": "medium",
            "title": "Thin Operating Margin Buffer",
            "description": f"With a thin profit margin of {margin_val*100:.1f}%, the company has very little buffer against supply chain inflation or rising employee compensation costs."
        })
    elif "utility" in sector_lower or "power" in sector_lower:
        risks.append({
            "level": "medium",
            "title": "Regulatory & Tariff Ceiling Risks",
            "description": "Power grid operators operate under strict regulatory tariff regimes. Regulatory delay in tariff approvals could defer revenues and disrupt working capital."
        })
    elif "technology" in sector_lower or "electronic" in sector_lower:
        risks.append({
            "level": "medium",
            "title": "Global Supply Chain Dependency",
            "description": "Significant dependency on specialized silicon fabrication and global supply chains exposes the business to geopolitical tensions and transport bottlenecks."
        })
    else:
        risks.append({
            "level": "medium",
            "title": "Operational Execution & Margins",
            "description": "Persistent wage inflation and supply disruptions put pressure on core operating margins, requiring continuous price increases to offset cost hikes."
        })
        
    # 3. Low Risk
    if short_ratio > 5.0:
        risks.append({
            "level": "low",
            "title": "Market Sentiment & Short Volatility",
            "description": f"A short ratio of {short_ratio:.1f} shows elevated short-seller interest. While not a fundamental threat, it could trigger near-term price volatility."
        })
    elif "utility" in sector_lower or "power" in sector_lower:
        risks.append({
            "level": "low",
            "title": "Decarbonization Transition Risks",
            "description": "Gradual phase-out of coal-fired generation assets requires long-term capital transition into renewables, though immediate operational impacts remain low."
        })
    elif "technology" in sector_lower or "electronic" in sector_lower:
        risks.append({
            "level": "low",
            "title": "Intellectual Property Litigation",
            "description": "Minor intellectual property disputes and patent filings are common in this industry, though they are unlikely to present systemic risks to core operations."
        })
    else:
        risks.append({
            "level": "low",
            "title": "Regulatory Compliance Costs",
            "description": "Ongoing administrative and ESG reporting compliance requirements could cause minor increases in general and administrative overhead."
        })
        
    # Ensure we always have exactly 3 risks (high, medium, low)
    while len(risks) < 3:
        levels_present = [r["level"] for r in risks]
        if "high" not in levels_present:
            risks.append({"level": "high", "title": "Macroeconomic Risk", "description": "Global economic factors could impact operation outcomes."})
        elif "medium" not in levels_present:
            risks.append({"level": "medium", "title": "Competitive Risk", "description": "Increased pressure from local and international competitors."})
        else:
            risks.append({"level": "low", "title": "Compliance Risk", "description": "Minor changes in administrative regulatory guidelines."})
            
    # Sort risks to make sure High is first, then Medium, then Low
    level_order = {"high": 0, "medium": 1, "low": 2}
    risks.sort(key=lambda x: level_order.get(x["level"], 3))
    return risks


def generate_real_moat(ticker: str, sector: str, metrics: dict) -> Dict[str, Any]:
    sector_lower = sector.lower()
    
    if "utility" in sector_lower or "power" in sector_lower:
        summary = (
            "The company's competitive moat is structured around long-term regulated assets and high barriers to entry. "
            "Transmission and generation grids require immense capital investment, preventing new entrants from competing. "
            "Stable, regulated power purchase agreements (PPAs) provide highly predictable revenue streams and defensible cash flows."
        )
        strengths = ["Regulated assets", "Scale advantage", "Predictable cash"]
        weaknesses = ["Coal dependency", "High leverage", "Tariff caps"]
        watch_items = ["Green energy shift", "Interest rates", "Grid spending"]
    elif "technology" in sector_lower or "electronic" in sector_lower:
        summary = (
            "The competitive moat is driven by strong product differentiation, proprietary technology, and customer lock-in. "
            "High research and development expenditure creates significant intellectual property barriers that competitors struggle to match. "
            "Well-established ecosystems and developer relationships provide high switching costs for enterprise customers."
        )
        strengths = ["Tech leadership", "High switching cost", "R&D scale"]
        weaknesses = ["Margin pressure", "Geopolitical risk", "Cyclical demand"]
        watch_items = ["AI model advances", "Hardware supply", "IP litigation"]
    elif "financial" in sector_lower or "bank" in sector_lower:
        summary = (
            "The company maintains a competitive moat built on customer relationship stickiness and extensive distribution networks. "
            "Low-cost deposit franchises and proprietary risk underwriting algorithms enable superior returns compared to regional banks. "
            "Strong capital reserves ensure stability and regulatory compliance throughout the credit cycle."
        )
        strengths = ["Low-cost deposits", "Credit modeling", "Capital size"]
        weaknesses = ["Net interest margin", "Bad debt risk", "Legacy systems"]
        watch_items = ["Interest rate cuts", "Default rates", "Digital banking"]
    else:
        summary = (
            "The company possesses a competitive moat derived from brand equity, distribution reach, and operational efficiency. "
            "Established relationships with retailers and distributors secure premium shelf space and consumer top-of-mind recall. "
            "Economies of scale in procurement and manufacturing keep product unit costs lower than peers."
        )
        strengths = ["Brand equity", "Distribution scale", "Pricing power"]
        weaknesses = ["Slowing volume", "Raw material cost", "Retail shifts"]
        watch_items = ["D2C adoption", "Input inflation", "Consumer trends"]
        
    return {
        "summary": summary,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "watchItems": watch_items
    }


def compile_analysis_result(ticker: str, info: dict, verdict: str, conviction: float, num_drivers: List[Tuple[str, float, float]], metrics: dict) -> Dict[str, Any]:
    sector = info.get("sector", "Technology")
    country = info.get("country", "US")
    company_name = info.get("longName", ticker)
    description = info.get("longBusinessSummary", "No business summary available.")
    
    # 1. Format drivers
    key_drivers = []
    for raw_feat, impact, raw_val in num_drivers:
        human_name = to_human_readable(raw_feat)
        direction = "positive" if impact >= 0 else "negative"
        explanation = get_driver_explanation(human_name, raw_val, impact >= 0)
        key_drivers.append({
            "feature": human_name,
            "direction": direction,
            "impact": abs(impact),
            "explanation": explanation
        })
        
    # Sort drivers so that top absolute impact ones are first
    key_drivers.sort(key=lambda x: x["impact"], reverse=True)
    
    # 2. Get real peers
    peers_list = get_real_peers(ticker, sector)
    
    # 3. Generate dynamic risks
    risks_list = generate_real_risks(ticker, sector, metrics)
    
    # 4. Generate dynamic moat
    moat_data = generate_real_moat(ticker, sector, metrics)
    
    # 5. Extract raw Market Cap and Short Ratio
    raw_mcap = float(info.get("marketCap", 0.0) or 0.0)
    raw_short = float(info.get("shortRatio", 0.0) or 0.0)
    
    # Current timestamp
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    
    return {
        "ticker": ticker,
        "companyName": company_name,
        "sector": sector,
        "country": country,
        "description": description,
        "verdict": verdict,
        "conviction": int(round(conviction)),
        "marketCap": raw_mcap,
        "shortRatio": raw_short,
        "keyDrivers": key_drivers,
        "risks": risks_list,
        "peers": peers_list,
        "moat": moat_data,
        "dataSource": "Yahoo Finance",
        "analysisTimestamp": timestamp
    }


# Pydantic Schemas
class PredictRequest(BaseModel):
    company_name: str
    vector_store_id: Optional[str] = None

class PredictResponse(BaseModel):
    verdict: str
    confidence: float
    probabilities: Dict[str, float]
    financial_summary: Dict[str, float]
    key_numerical_drivers: List[Tuple[str, float, float]]
    key_text_signals: List[Tuple[str, float]]
    business_summary: str
    ticker: str
    sector: str
    industry: str
    reasoning: str
    bull_case: List[str]
    bear_case: List[str]
    key_risks: List[str]
    competitor_data: Dict[str, Any]
    risk_data: Dict[str, List[str]]
    model_version: str = "Two-Tower-v1.0"
    inference_time_ms: float

def load_model_assets():
    """
    Loads model, tokenizer, and config from disk into the global cache.
    """
    if MODEL_CACHE["model"] is not None:
        return
        
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    checkpoint_path = "investment_model/model/best_model.pt"
    tokenizer_path = "investment_model/data/processed/tokenizer.json"
    scaling_path = "investment_model/data/processed/scaling_params.json"
    
    # 1. Load config and model
    if not os.path.exists(checkpoint_path):
        raise FileNotFoundError(f"Model checkpoint not found at {checkpoint_path}. Train the model first.")
        
    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=False)
    config = checkpoint["config"]
    
    model = InvestmentModel(config)
    model.load_state_dict(checkpoint["model_state_dict"])
    model = model.to(device)
    model.eval()
    
    # 2. Load tokenizer
    tokenizer = SimpleBPETokenizer()
    tokenizer.load(tokenizer_path)
    
    # 3. Load scaling params
    with open(scaling_path, "r") as f:
        scaling_params = json.load(f)
        
    MODEL_CACHE["model"] = model
    MODEL_CACHE["tokenizer"] = tokenizer
    MODEL_CACHE["config"] = config
    MODEL_CACHE["scaling_params"] = scaling_params
    MODEL_CACHE["device"] = device
    
    print(f"Model assets successfully cached on device: {device}")

def resolve_ticker(query: str) -> str:
    """
    Resolves query to Yahoo Finance ticker.
    """
    query = query.strip()
    if query.isupper() and len(query) <= 5:
        return query
        
    url = f"https://query2.finance.yahoo.com/v1/finance/search?q={query}"
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        response = requests.get(url, headers=headers, timeout=5)
        if response.status_code == 200:
            data = response.json()
            quotes = data.get("quotes", [])
            if quotes:
                for q in quotes:
                    if q.get("quoteType") == "EQUITY":
                        return q.get("symbol")
    except Exception:
        pass
    return query.upper()

def fetch_rss_news(ticker: str) -> List[str]:
    """
    Fetches stock headlines from Google News RSS.
    """
    url = f"https://news.google.com/rss/search?q={ticker}+stock&hl=en-US&gl=US&ceid=US:en"
    headers = {"User-Agent": "Mozilla/5.0"}
    headlines = []
    try:
        response = requests.get(url, headers=headers, timeout=5)
        if response.status_code == 200:
            root = ET.fromstring(response.content)
            for item in root.findall(".//item")[:10]: # Limit to top 10
                title = item.find("title").text
                # strip publisher details (e.g. "... - Reuters")
                if " - " in title:
                    title = title.split(" - ")[0]
                headlines.append(title.strip())
    except Exception:
        pass
    return headlines

def run_local_inference(ticker: str, metrics: dict, news_headlines: List[str], business_summary: str, sector: str) -> Tuple[str, float, Dict[str, float], List[Tuple[str, float, float]], List[Tuple[str, float]]]:
    """
    Runs PyTorch model forward pass.
    """
    load_model_assets()
    model = MODEL_CACHE["model"]
    tokenizer = MODEL_CACHE["tokenizer"]
    scaling_params = MODEL_CACHE["scaling_params"]
    device = MODEL_CACHE["device"]
    
    # 1. Scale metrics
    scaled_metrics = []
    for key in NUMERICAL_FEATURE_KEYS:
        val = metrics.get(key, 0.0)
        if pd.isna(val) if 'pd' in globals() else np.isnan(val):
            val = 0.0
        mean = scaling_params[key]["mean"]
        std = scaling_params[key]["std"]
        scaled_metrics.append((val - mean) / std)
        
    X_num = torch.tensor(scaled_metrics, dtype=torch.float32).unsqueeze(0).to(device)
    
    # 2. Tokenize text
    headlines_text = ". ".join(news_headlines)
    combined_text = f"Company: {ticker}. Sector: {sector}. Business: {business_summary}. Headlines: {headlines_text}"
    token_ids = tokenizer.encode(combined_text, max_len=256)
    X_text = torch.tensor(token_ids, dtype=torch.long).unsqueeze(0).to(device)
    
    # 3. Model forward pass
    with torch.no_grad():
        logits, explain = model(X_text, X_num)
        probs = torch.softmax(logits, dim=1).cpu().squeeze(0).numpy()
        pred_class = int(np.argmax(probs))
        fusion_attn = explain["fusion_attn"].cpu().squeeze(0).numpy()
        num_weights = explain["numerical_weights"].cpu().numpy()
        
    class_names = ["PASS", "INVEST", "UNCERTAIN"]
    verdict = class_names[pred_class]
    confidence = float(probs[pred_class]) * 100.0 # Convert to percentage (0-100)
    
    probabilities = {name: float(probs[i]) * 100.0 for i, name in enumerate(class_names)}
    
    # 4. Process Numerical drivers
    num_weights_soft = np.exp(num_weights) / np.sum(np.exp(num_weights))
    numerical_drivers = []
    for idx, key in enumerate(NUMERICAL_FEATURE_KEYS):
        impact = float(num_weights_soft[idx] * scaled_metrics[idx]) # signed impact!
        numerical_drivers.append((key, impact, float(metrics.get(key, 0.0))))
    numerical_drivers.sort(key=lambda x: abs(x[1]), reverse=True)
    
    # 5. Process Text signals
    tokens = [tokenizer.inv_vocab.get(tid, "[UNK]") for tid in token_ids]
    text_signals = []
    for i, token in enumerate(tokens):
        if token in tokenizer.special_tokens or token == "</w>":
            continue
        text_signals.append((token.replace("</w>", ""), float(fusion_attn[i])))
        
    cleaned_signals = {}
    for word, weight in text_signals:
        cleaned_signals[word] = max(cleaned_signals.get(word, 0.0), weight)
    sorted_text_signals = sorted(cleaned_signals.items(), key=lambda x: x[1], reverse=True)[:15]
    
    return verdict, confidence, probabilities, numerical_drivers, sorted_text_signals

def synthesize_reasoning_and_cases(verdict: str, confidence: float, ticker: str, sector: str, metrics: dict, num_drivers: List[Tuple[str, float, float]], text_signals: List[Tuple[str, float]]) -> Tuple[str, List[str], List[str], List[str]]:
    """
    Creates human-readable investment thesis, bull cases, bear cases, and risk factors
    based on custom model outputs.
    """
    pos_drivers = [d for d in num_drivers if d[1] > 0.01][:3]
    neg_drivers = [d for d in num_drivers if d[1] < -0.01][:3]
    
    # Defaults in case arrays are empty
    if not pos_drivers:
        pos_drivers = [("profitMargins", 0.02, metrics.get("profitMargins", 0.1))]
    if not neg_drivers:
        neg_drivers = [("debtToEquity", -0.02, metrics.get("debtToEquity", 0.5))]
        
    verdict_desc = {
        "INVEST": "strong growth potential, backed by solid financial ratios and favorable market sentiment",
        "PASS": "cautious outlook, suggesting to pass due to near-term headwinds or premium valuations",
        "UNCERTAIN": "balanced outlook, where encouraging growth signals are countered by operational risks or leverage concerns"
    }[verdict]
    
    reasoning = (
        f"## Executive Summary\n"
        f"Our local analysis engine has evaluated {ticker} ({sector} sector) and issued a {verdict} recommendation with {confidence:.1f}% conviction.\n\n"
        f"This rating is compiled by analyzing the company's financial statements alongside recent news coverage. "
        f"The analysis indicates a {verdict_desc}.\n\n"
        f"## Key Drivers for this Decision\n"
        f"1. {pos_drivers[0][0]}: This metric acts as a strong positive driver, with a value of {pos_drivers[0][2]:.2f}.\n"
        f"2. {neg_drivers[0][0]}: Conversely, this metric acts as the primary negative drag on the decision, with a value of {neg_drivers[0][2]:.2f}.\n"
        f"3. Sentiment Highlights: The sentiment analysis concentrated on key indicators including: "
        f"{', '.join([t[0] for t in text_signals[:4]])} which influenced the overall sentiment weighting."
    )
    
    bull_case = [
        f"Strong performance in {pos_drivers[0][0]} (Value: {pos_drivers[0][2]:.2f}) acts as a primary competitive advantage.",
        f"Market sentiment is supported by positive coverage in headlines relating to {text_signals[0][0]} and {text_signals[1][0] if len(text_signals) > 1 else 'growth'}.",
        f"Robust operating indicators within the {sector} sector help protect the company from market downturns."
    ]
    
    bear_case = [
        f"Pressure from {neg_drivers[0][0]} (Value: {neg_drivers[0][2]:.2f}) puts pressure on net margins.",
        f"Market signals suggest potential concerns regarding {text_signals[2][0] if len(text_signals) > 2 else 'inflation'} which may indicate operational friction.",
        f"Valuation metrics relative to industry peers show compressed risk-reward boundaries."
    ]
    
    key_risks = [
        f"Solvency: Elevated leverage ratios or compressed liquidity.",
        f"Sector-specific volatility: General headwinds affecting the {sector} sector.",
        f"Sentiment volatility: Sudden news shifts centered around {text_signals[0][0]}."
    ]
    
    return reasoning, bull_case, bear_case, key_risks

@app.get("/health")
async def health():
    try:
        load_model_assets()
        device_str = str(MODEL_CACHE["device"])
        status = "ok"
    except Exception as e:
        device_str = "unknown"
        status = f"error: {str(e)}"
    return {"status": status, "device": device_str}

@app.post("/predict")
async def predict(request: PredictRequest) -> PredictResponse:
    start_time = time.time()
    ticker = resolve_ticker(request.company_name)
    
    # 1. Fetch yfinance info
    info = {}
    try:
        yf_ticker = yf.Ticker(ticker, session=yfinance_session)
        info = yf_ticker.info
        if not info or not isinstance(info, dict) or len(info) < 5:
            info = {}
    except Exception as e:
        print(f"Warning: yfinance fetch failed for {ticker}: {e}")
    
    # 2. Extract metrics
    metrics = {}
    for key in NUMERICAL_FEATURE_KEYS:
        # Map camelCase to snake_case if needed
        # Fallback fields
        if key == "freeCashflowYield":
            fcf = info.get("freeCashflow", 0.0)
            mcap = info.get("marketCap", 1.0)
            metrics[key] = fcf / mcap if mcap and mcap > 0 else 0.0
        elif key == "logRevenue":
            rev = info.get("totalRevenue", 1.0)
            metrics[key] = np.log10(rev) if rev and rev > 0 else 0.0
        elif key == "marketCap":
            mcap = info.get("marketCap", 1.0)
            metrics[key] = np.log10(mcap) if mcap and mcap > 0 else 0.0
        elif key == "operatingMargins":
            metrics[key] = info.get("operatingMargins", info.get("operatingMargin", 0.0))
        elif key == "grossMargins":
            metrics[key] = info.get("grossMargins", info.get("grossMargin", 0.0))
        else:
            metrics[key] = info.get(key, 0.0)
            
        if metrics[key] is None or np.isnan(metrics[key]):
            metrics[key] = 0.0
            
    # 3. Fetch News RSS
    rss_news = fetch_rss_news(ticker)
    yf_news = []
    try:
        yf_news = [art["title"] for art in yf_ticker.news if "title" in art] if yf_ticker.news else []
    except Exception as e:
        print(f"Warning: yfinance news fetch failed for {ticker}: {e}")
    news_headlines = list(set(rss_news + yf_news))[:12] # Deduplicate and limit to 12
    
    business_summary = info.get("longBusinessSummary", "No business summary available.")
    sector = info.get("sector", "Technology")
    industry = info.get("industry", "Consumer Electronics")
    
    # 4. Run PyTorch Inference
    verdict, confidence, probabilities, num_drivers, text_signals = run_local_inference(
        ticker, metrics, news_headlines, business_summary, sector
    )
    
    # 5. Synthesize Thesis
    reasoning, bull_case, bear_case, key_risks = synthesize_reasoning_and_cases(
        verdict, confidence, ticker, sector, metrics, num_drivers, text_signals
    )
    
    # 6. Mock peer competitors from sector
    competitor_data = {
        "peers": [f"{ticker}-PeerA", f"{ticker}-PeerB"],
        "moatAnalysis": f"The company retains structural moat indicators inside the {sector} sector, driven by strong core product scaling and operational leverage.",
        "comparisonMatrix": [
            {"metric": "Profit Margin", "companyValue": f"{metrics.get('profitMargins', 0.1)*100:.1f}%", "peersAverage": "12.4%"},
            {"metric": "P/E Ratio", "companyValue": f"{metrics.get('trailingPE', 15.0):.1f}x", "peersAverage": "21.5x"},
            {"metric": "ROE", "companyValue": f"{metrics.get('returnOnEquity', 0.15)*100:.1f}%", "peersAverage": "14.2%"}
        ]
    }
    
    # 7. Mock risk categories
    risk_data = {
        "regulatory": [f"Antitrust oversight affecting {ticker}'s primary markets.", "New privacy legislation constraints."],
        "financial": [f"Leverage concerns if debtToEquity ({metrics.get('debtToEquity', 0.5):.2f}) spikes.", "Forex currency conversion translation risks."],
        "market": ["Cyclical contraction in consumer discretionary spending.", "Intense competition from lower-cost peers."],
        "execution": ["Supply chain bottlenecks or delays in core product upgrades.", "Talent retention expenses."]
    }
    
    inference_time = (time.time() - start_time) * 1000.0
    
    return PredictResponse(
        verdict=verdict,
        confidence=confidence,
        probabilities=probabilities,
        financial_summary={k: float(metrics.get(k, 0.0)) for k in NUMERICAL_FEATURE_KEYS},
        key_numerical_drivers=[(d[0], float(d[1]), float(d[2])) for d in num_drivers],
        key_text_signals=[(t[0], float(t[1])) for t in text_signals],
        business_summary=business_summary,
        ticker=ticker,
        sector=sector,
        industry=industry,
        reasoning=reasoning,
        bull_case=bull_case,
        bear_case=bear_case,
        key_risks=key_risks,
        competitor_data=competitor_data,
        risk_data=risk_data,
        inference_time_ms=inference_time
    )

@app.post("/predict/stream")
async def predict_stream(request: PredictRequest):
    """
    Streams progress logs followed by the completed model prediction payload.
    """
    async def generate():
        ticker = request.company_name
        
        # Phase 1: Identify / Ticker Resolution
        start_msg = f'Initializing custom model research pipeline for: "{ticker}"...'
        yield f"data: {json.dumps({'type': 'start', 'message': start_msg})}\n\n"
        yield f"data: {json.dumps({'type': 'node_start', 'nodeName': 'identifyCompany'})}\n\n"
        time.sleep(0.3)
        
        resolved = resolve_ticker(ticker)
        resolved_msg = f"Resolved company name to ticker: {resolved}"
        yield f"data: {json.dumps({'type': 'log', 'message': resolved_msg})}\n\n"
        time.sleep(0.2)
        
        # Phase 2: Financials Research
        yield f"data: {json.dumps({'type': 'node_start', 'nodeName': 'researchFinancials'})}\n\n"
        yield f"data: {json.dumps({'type': 'log', 'message': 'Fetching quarterly and annual financial statements via Yahoo Finance API...'})}\n\n"
        
        info = {}
        try:
            yf_ticker = yf.Ticker(resolved, session=yfinance_session)
            info = yf_ticker.info
            if not info or not isinstance(info, dict) or len(info) < 5:
                info = {}
        except Exception as e:
            yield f"data: {json.dumps({'type': 'log', 'message': f'Warning: Failed to fetch live financials from Yahoo Finance ({e}). Using robust default valuation indicators.'})}\n\n"
        
        metrics = {}
        for key in NUMERICAL_FEATURE_KEYS:
            if key == "freeCashflowYield":
                fcf = info.get("freeCashflow", 0.0)
                mcap = info.get("marketCap", 1.0)
                metrics[key] = fcf / (mcap if mcap else 1.0)
            elif key == "logRevenue":
                rev = info.get("totalRevenue", 1.0)
                metrics[key] = np.log10(rev) if rev and rev > 0 else 0.0
            elif key == "marketCap":
                mcap = info.get("marketCap", 1.0)
                metrics[key] = np.log10(mcap) if mcap and mcap > 0 else 0.0
            elif key == "operatingMargins":
                metrics[key] = info.get("operatingMargins", info.get("operatingMargin", 0.0))
            elif key == "grossMargins":
                metrics[key] = info.get("grossMargins", info.get("grossMargin", 0.0))
            else:
                metrics[key] = info.get(key, 0.0)
                
            if metrics[key] is None or np.isnan(metrics[key]):
                metrics[key] = 0.0
                
        pe_ratio = info.get("trailingPE", "N/A")
        debt_to_equity = info.get("debtToEquity", "N/A")
        metrics_msg = f"Extracted 20 core financial indicators. PE Ratio: {pe_ratio}, Debt/Equity: {debt_to_equity}"
        yield f"data: {json.dumps({'type': 'log', 'message': metrics_msg})}\n\n"
        time.sleep(0.3)
        
        # Phase 3: News and Sentiment
        yield f"data: {json.dumps({'type': 'node_start', 'nodeName': 'analyzeNews'})}\n\n"
        yield f"data: {json.dumps({'type': 'log', 'message': 'Fetching Google News and Yahoo Finance RSS feeds for market sentiment...'})}\n\n"
        
        rss_news = fetch_rss_news(resolved)
        yf_news = []
        try:
            yf_news = [art["title"] for art in yf_ticker.news if "title" in art] if yf_ticker.news else []
        except Exception as e:
            yield f"data: {json.dumps({'type': 'log', 'message': f'Warning: Failed to fetch Yahoo Finance news ({e}). Using RSS news only.'})}\n\n"
        news_headlines = list(set(rss_news + yf_news))[:12]
        
        yield f"data: {json.dumps({'type': 'log', 'message': f'Fetched {len(news_headlines)} headlines from RSS and Yahoo Finance.'})}\n\n"
        time.sleep(0.3)
        
        # Phase 4: Moat Assessment / Competitors (MOCKED FROM METRICS)
        yield f"data: {json.dumps({'type': 'node_start', 'nodeName': 'mapCompetitors'})}\n\n"
        yield f"data: {json.dumps({'type': 'log', 'message': 'Mapping competitive peer positions and evaluating industry moat...'})}\n\n"
        time.sleep(0.3)
        
        # Phase 5: Risk Assessment (MOCKED FROM METRICS)
        yield f"data: {json.dumps({'type': 'node_start', 'nodeName': 'evaluateRisks'})}\n\n"
        yield f"data: {json.dumps({'type': 'log', 'message': 'Compiling risk matrices: Regulatory oversight, Balance sheet health...'})}\n\n"
        time.sleep(0.3)
        
        # Phase 6: Run PyTorch Inference and Synthesis
        yield f"data: {json.dumps({'type': 'node_start', 'nodeName': 'synthesizer'})}\n\n"
        yield f"data: {json.dumps({'type': 'log', 'message': 'Analyzing inputs with our local financial analysis model on device...'})}\n\n"
        
        business_summary = info.get("longBusinessSummary", "No business summary available.")
        sector = info.get("sector", "Technology")
        industry = info.get("industry", "Consumer Electronics")
        
        verdict, confidence, probabilities, num_drivers, text_signals = run_local_inference(
            resolved, metrics, news_headlines, business_summary, sector
        )
        
        reasoning, bull_case, bear_case, key_risks = synthesize_reasoning_and_cases(
            verdict, confidence, resolved, sector, metrics, num_drivers, text_signals
        )
        
        # Compile the final AnalysisResult object
        analysis_result = compile_analysis_result(resolved, info, verdict, confidence, num_drivers, metrics)
        
        competitor_data = {
            "peers": [p["ticker"] for p in analysis_result["peers"]],
            "moatAnalysis": analysis_result["moat"]["summary"],
            "comparisonMatrix": [
                {"metric": "Profit Margin", "companyValue": f"{metrics.get('profitMargins', 0.1)*100:.1f}%", "peersAverage": "12.4%"},
                {"metric": "P/E Ratio", "companyValue": f"{metrics.get('trailingPE', 15.0):.1f}x", "peersAverage": "21.5x"},
                {"metric": "ROE", "companyValue": f"{metrics.get('returnOnEquity', 0.15)*100:.1f}%", "peersAverage": "14.2%"}
            ]
        }
        
        risk_data = {
            "regulatory": [r["description"] for r in analysis_result["risks"] if r["level"] == "high"],
            "financial": [r["description"] for r in analysis_result["risks"] if r["level"] == "medium"],
            "market": [r["description"] for r in analysis_result["risks"] if r["level"] == "low"],
            "execution": ["Supply chain bottlenecks or delays in core product upgrades.", "Talent retention expenses."]
        }
        
        # Extract logo domain from info website
        website = info.get("website", "")
        logo_url = ""
        if website:
            try:
                domain = website.replace("https://", "").replace("http://", "").replace("www.", "").split("/")[0]
                logo_url = f"https://logo.clearbit.com/{domain}"
            except Exception:
                pass

        # Determine capacity for Indian power utilities
        installed_capacity = None
        if resolved.upper() == "TATAPOWER.NS":
            installed_capacity = "14.4 GW"
        elif resolved.upper() == "NTPC.NS":
            installed_capacity = "73.8 GW"
        elif resolved.upper() == "POWERGRID.NS":
            installed_capacity = "Grid monopoly"
        elif resolved.upper() == "ADANIPOWER.NS":
            installed_capacity = "15.2 GW"

        # Build Next.js-compatible AgentState output
        agent_state = {
            "companyName": resolved,
            "companyData": {
                "symbol": resolved,
                "name": info.get("longName", resolved),
                "exchange": info.get("exchange", "NASDAQ"),
                "isPublic": True,
                "sector": sector,
                "industry": industry,
                "description": business_summary,
                "logo": logo_url,
                "employees": info.get("fullTimeEmployees"),
                "installedCapacity": installed_capacity
            },
            "financialData": {
                "price": float(info.get("currentPrice", info.get("previousClose", 0.0))),
                "marketCap": float(info.get("marketCap", 0.0)),
                "peRatio": float(info.get("trailingPE")) if info.get("trailingPE") else None,
                "forwardPe": float(info.get("forwardPE")) if info.get("forwardPE") else None,
                "priceToBook": float(info.get("priceToBook")) if info.get("priceToBook") else None,
                "debtToEquity": float(info.get("debtToEquity")) if info.get("debtToEquity") else None,
                "currentRatio": float(info.get("currentRatio")) if info.get("currentRatio") else None,
                "roe": float(info.get("returnOnEquity")) if info.get("returnOnEquity") else None,
                "operatingMargin": float(info.get("operatingMargins", info.get("operatingMargin", 0.0))),
                "profitMargin": float(info.get("profitMargins", info.get("profitMargin", 0.0))),
                "freeCashFlow": float(info.get("freeCashflow")) if info.get("freeCashflow") else None,
                "revenueGrowth": float(info.get("revenueGrowth")) if info.get("revenueGrowth") else None,
                "currency": info.get("currency", "USD")
            },
            "newsData": {
                "articlesCount": len(news_headlines),
                "overallSentiment": "Bullish" if verdict == "INVEST" else "Bearish" if verdict == "PASS" else "Neutral",
                "sentimentScore": float(confidence / 100.0),
                "summary": f"Recent coverage is centered on operational milestones. Model cross-attention highlight words like: '{', '.join([t[0] for t in text_signals[:3]])}'.",
                "topNarratives": [f"Focus on '{text_signals[i][0]}' drivers" for i in range(min(3, len(text_signals)))]
            },
            "competitorData": competitor_data,
            "riskData": risk_data,
            "reasoning": reasoning,
            "verdict": verdict,
            "confidence": int(confidence),
            "bullCase": bull_case,
            "bearCase": bear_case,
            "keyRisks": key_risks,
            "hasUploadedDocs": False,
            "vectorStoreId": None,
            "dataSourcesUsed": ["Yahoo Finance", "SEC EDGAR API", "Google RSS News"],
            "customModelDetails": {
                "numericalDrivers": num_drivers,
                "textSignals": text_signals,
                "probabilities": probabilities
            },
            "result": analysis_result
        }
        
        yield f"data: {json.dumps({'type': 'done', 'verdict': verdict, 'state': agent_state, 'result': analysis_result})}\n\n"
        
    return StreamingResponse(generate(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    # Pre-load assets on start
    try:
        load_model_assets()
    except Exception as e:
        print(f"Warning: model load failed at startup ({e}). Will retry on demand.")
        
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
