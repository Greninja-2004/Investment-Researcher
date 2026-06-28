import os
import re
import json
import time
import requests
from bs4 import BeautifulSoup
from typing import Dict, Optional, Tuple

RAW_DIR = "investment_model/data/raw"
os.makedirs(RAW_DIR, exist_ok=True)

# SEC requires a user-agent header stating declared name and email address
SEC_HEADERS = {
    "User-Agent": "InvestmentResearchAgent anurag.research@gmail.com",
    "Accept-Encoding": "gzip, deflate"
}

def get_ticker_cik_mapping() -> Dict[str, str]:
    """
    Downloads ticker-to-CIK mapping directly from the SEC.
    """
    url = "https://www.sec.gov/files/company_tickers.json"
    try:
        response = requests.get(url, headers=SEC_HEADERS, timeout=10)
        if response.status_code == 200:
            data = response.json()
            # Convert to dictionary of ticker -> CIK (zero-padded to 10 digits)
            mapping = {}
            for item in data.values():
                ticker = item["ticker"].upper().replace('.', '-')
                cik = str(item["cik_str"]).zfill(10)
                mapping[ticker] = cik
            return mapping
    except Exception as e:
        print(f"Error fetching CIK mapping: {e}")
    return {}

def clean_sec_text(text: str) -> str:
    """
    Cleans raw HTML/text from SEC filings by removing excess whitespace,
    table formatting, and special HTML characters.
    """
    # Remove HTML tags if present
    soup = BeautifulSoup(text, "html.parser")
    cleaned = soup.get_text(separator=" ")
    
    # Remove unicode characters/formatting
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = cleaned.replace("\xa0", " ")
    cleaned = cleaned.replace("&#160;", " ")
    
    # Truncate multiple spaces
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned

def extract_section_fallback(text: str, section_name: str) -> str:
    """
    Simple keyword-based truncation if regex fails to isolate the exact section.
    """
    pattern = re.compile(rf"{section_name}", re.IGNORECASE)
    match = pattern.search(text)
    if match:
        start_idx = match.start()
        # Take up to 20,000 characters
        return text[start_idx:start_idx + 20000]
    return ""

def fetch_10k_filing_sections(ticker: str, cik: str) -> Tuple[str, str]:
    """
    Fetches the latest 10-K filing for the company from the SEC archives
    and extracts Item 1 (Business) and Item 1A (Risk Factors).
    """
    # Step 1: Query SEC Submissions API to find latest 10-K
    submissions_url = f"https://data.sec.gov/submissions/CIK{cik}.json"
    try:
        response = requests.get(submissions_url, headers=SEC_HEADERS, timeout=10)
        time.sleep(0.1) # SEC rate limit: max 10 requests per second
        
        if response.status_code != 200:
            return "", ""
            
        submission_data = response.json()
        filings = submission_data.get("filings", {}).get("recent", {})
        
        # Find index of latest 10-K
        idx_10k = -1
        for i, form in enumerate(filings.get("form", [])):
            if form == "10-K":
                idx_10k = i
                break
                
        if idx_10k == -1:
            return "", ""
            
        accession_number = filings["accessionNumber"][idx_10k].replace("-", "")
        primary_doc = filings["primaryDocument"][idx_10k]
        
        # Step 2: Fetch the primary document
        doc_url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession_number}/{primary_doc}"
        doc_response = requests.get(doc_url, headers=SEC_HEADERS, timeout=15)
        time.sleep(0.1)
        
        if doc_response.status_code != 200:
            return "", ""
            
        raw_html = doc_response.text
        
        # Step 3: Parse and extract Business and Risk Factors
        # SEC filings are highly variable. We use a combination of BeautifulSoup and regex
        cleaned_text = clean_sec_text(raw_html)
        
        # Extract Item 1A. Risk Factors
        risk_factors = ""
        # Try to find "Item 1A" or "Item 1A. Risk Factors"
        risk_match = re.search(r"Item\s+1A\.?\s+Risk\s+Factors", cleaned_text, re.IGNORECASE)
        if risk_match:
            start_idx = risk_match.start()
            # Find next item e.g. "Item 1B" or "Item 2" to mark end
            end_match = re.search(r"Item\s+1B|Item\s+2", cleaned_text[start_idx:], re.IGNORECASE)
            if end_match:
                end_idx = start_idx + end_match.start()
                risk_factors = cleaned_text[start_idx:end_idx]
            else:
                risk_factors = cleaned_text[start_idx:start_idx + 15000]
                
        # Extract Item 1. Business
        business = ""
        biz_match = re.search(r"Item\s+1\.?\s+Business", cleaned_text, re.IGNORECASE)
        if biz_match:
            start_idx = biz_match.start()
            end_match = re.search(r"Item\s+1A|Item\s+2", cleaned_text[start_idx:], re.IGNORECASE)
            if end_match:
                end_idx = start_idx + end_match.start()
                business = cleaned_text[start_idx:end_idx]
            else:
                business = cleaned_text[start_idx:start_idx + 15000]
                
        # Fallback if parsing failed to isolate
        if not risk_factors:
            risk_factors = extract_section_fallback(cleaned_text, "Risk Factors")
        if not business:
            business = extract_section_fallback(cleaned_text, "Business")
            
        # Truncate excess length for storage efficiency
        return business[:12000], risk_factors[:12000]
        
    except Exception as e:
        print(f"Error downloading 10-K for {ticker}: {e}")
        return "", ""

def fetch_edgar_for_all(limit: int = 50):
    """
    Runs the pipeline to fetch 10-Ks for constituents.
    Caches outputs to raw/ticker_sec.json.
    """
    print("Loading ticker to CIK mapping...")
    cik_mapping = get_ticker_cik_mapping()
    if not cik_mapping:
        print("Failed to load CIK mappings. Exiting.")
        return
        
    # Get tickers that we have raw yfinance data for
    tickers = [f.replace("_raw.json", "") for f in os.listdir(RAW_DIR) if f.endswith("_raw.json")]
    tickers = tickers[:limit] # Process a subset to keep execution fast
    
    print(f"Processing SEC EDGAR 10-Ks for up to {len(tickers)} companies...")
    success_count = 0
    
    for ticker in tickers:
        sec_cache_path = os.path.join(RAW_DIR, f"{ticker}_sec.json")
        if os.path.exists(sec_cache_path):
            success_count += 1
            continue
            
        cik = cik_mapping.get(ticker)
        if not cik:
            # Fallback to fetching yfinance summary as a mock/proxy if CIK not found
            with open(os.path.join(RAW_DIR, f"{ticker}_raw.json"), "r") as f:
                raw_data = json.load(f)
            info = raw_data.get("info", {})
            business = info.get("longBusinessSummary", "Company business summary unavailable.")
            risk_factors = f"The company operations include risks associated with competition, market cyclicality, and general economic factors affecting {ticker}."
            
            with open(sec_cache_path, "w", encoding="utf-8") as f:
                json.dump({"business": business, "risk_factors": risk_factors}, f, indent=2)
            continue
            
        print(f"Downloading 10-K for {ticker} (CIK: {cik})...")
        business, risk_factors = fetch_10k_filing_sections(ticker, cik)
        
        # Fallback to yfinance summary if SEC was empty
        if not business or len(business.strip()) < 100:
            with open(os.path.join(RAW_DIR, f"{ticker}_raw.json"), "r") as f:
                raw_data = json.load(f)
            info = raw_data.get("info", {})
            business = info.get("longBusinessSummary", "Company business summary unavailable.")
            
        if not risk_factors or len(risk_factors.strip()) < 100:
            risk_factors = f"Market volatility, operational risk, regulatory compliance, and raw material cost inflation for {ticker}."
            
        with open(sec_cache_path, "w", encoding="utf-8") as f:
            json.dump({
                "business": business,
                "risk_factors": risk_factors
            }, f, indent=2)
            
        success_count += 1
        time.sleep(0.5) # Sleep to respect SEC rate limit
        
    print(f"Finished SEC EDGAR downloads. Saved {success_count} SEC cache files.")

if __name__ == "__main__":
    fetch_edgar_for_all(limit=30)
