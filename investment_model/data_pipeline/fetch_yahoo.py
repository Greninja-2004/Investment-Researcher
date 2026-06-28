import os
import time
import json
import pandas as pd
import requests
from bs4 import BeautifulSoup
import yfinance as yf
from tqdm import tqdm
from typing import List, Dict, Any

# Define paths
RAW_DIR = "investment_model/data/raw"
os.makedirs(RAW_DIR, exist_ok=True)

def get_sp500_tickers() -> List[str]:
    """
    Scrape S&P 500 tickers from Wikipedia.
    """
    url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
    try:
        response = requests.get(url, timeout=10)
        soup = BeautifulSoup(response.text, 'html.parser')
        table = soup.find('table', {'id': 'constituents'})
        tickers = []
        for row in table.find_all('tr')[1:]:
            ticker = row.find_all('td')[0].text.strip()
            # Replace dot with hyphen for yfinance compatibility (e.g., BRK.B -> BRK-B)
            ticker = ticker.replace('.', '-')
            tickers.append(ticker)
        return sorted(tickers)
    except Exception as e:
        print(f"Error scraping S&P 500 tickers: {e}")
        # Fallback list of top 20 tickers
        return ["AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "META", "BRK-B", "TSLA", "LLY", "V", 
                "JPM", "UNH", "MA", "AVGO", "HD", "PG", "COST", "JNJ", "MRK", "NFLX"]

def fetch_ticker_data(ticker_symbol: str) -> bool:
    """
    Download annual financials, balance sheet, cashflow, and 7 years of stock price history.
    Saves results locally as parquet and JSON files.
    """
    ticker_path = os.path.join(RAW_DIR, f"{ticker_symbol}_raw.json")
    price_path = os.path.join(RAW_DIR, f"{ticker_symbol}_prices.parquet")
    
    # Check if cached
    if os.path.exists(ticker_path) and os.path.exists(price_path):
        return True
        
    try:
        ticker = yf.Ticker(ticker_symbol)
        
        # Download historical prices (7 years)
        hist = ticker.history(period="7y")
        if hist.empty:
            return False
        hist.to_parquet(price_path)
        
        # Download financials
        financials = ticker.financials
        balance_sheet = ticker.balance_sheet
        cashflow = ticker.cashflow
        
        # Check if statements are empty
        if financials.empty or balance_sheet.empty or cashflow.empty:
            return False
            
        # Convert pandas DataFrames to JSON-compatible dictionaries
        data = {
            "info": ticker.info if hasattr(ticker, "info") else {},
            "financials": financials.to_dict() if hasattr(financials, "to_dict") else {},
            "balance_sheet": balance_sheet.to_dict() if hasattr(balance_sheet, "to_dict") else {},
            "cashflow": cashflow.to_dict() if hasattr(cashflow, "to_dict") else {}
        }
        
        # Save json cache
        # Clean datetime keys in nested dicts to strings
        def clean_keys(d: Any) -> Any:
            if isinstance(d, dict):
                return {str(k): clean_keys(v) for k, v in d.items()}
            return d
            
        cleaned_data = clean_keys(data)
        with open(ticker_path, "w", encoding="utf-8") as f:
            json.dump(cleaned_data, f, indent=2)
            
        return True
    except Exception as e:
        # Avoid crashing training script if single ticker fails
        print(f"Error fetching {ticker_symbol}: {e}")
        return False

def main():
    print("Sourcing S&P 500 tickers...")
    tickers = get_sp500_tickers()
    
    # Allow limiting for faster execution
    limit = int(os.environ.get("SP500_LIMIT", "40"))
    if limit > 0:
        print(f"Limiting download to first {limit} tickers for speed (set SP500_LIMIT=0 to download all).")
        tickers = tickers[:limit]
        
    print(f"Beginning downloads for {len(tickers)} tickers...")
    
    success_count = 0
    # Process with rate-limit friendly delay
    for ticker in tqdm(tickers):
        success = fetch_ticker_data(ticker)
        if success:
            success_count += 1
        time.sleep(0.5) # Sleep to avoid rate limits
        
    print(f"Completed download phase. Successfully cached {success_count}/{len(tickers)} tickers.")

if __name__ == "__main__":
    main()
