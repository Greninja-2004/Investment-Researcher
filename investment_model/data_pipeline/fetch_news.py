import os
import json
import requests
import yfinance as yf
from datasets import load_dataset
from tqdm import tqdm
from typing import List, Dict, Any

RAW_DIR = "investment_model/data/raw"
os.makedirs(RAW_DIR, exist_ok=True)

def fetch_financial_phrasebank() -> List[str]:
    """
    Downloads the FinancialPhraseBank dataset directly from raw GitHub
    to bypass HuggingFace's deprecated python loading scripts.
    """
    print("Downloading FinancialPhraseBank from GitHub raw source...")
    urls = [
        "https://raw.githubusercontent.com/neoyipeng2018/FinancialPhraseBank-v1.0/master/Sentences_AllAgree.txt",
        "https://raw.githubusercontent.com/neoyipeng2018/FinancialPhraseBank-v1.0/main/Sentences_AllAgree.txt",
        "https://raw.githubusercontent.com/sunilgromane/FinancialPhraseBank-sentiment-analysis/master/FinancialPhraseBank-v1.0/Sentences_AllAgree.txt"
    ]
    
    sentences = []
    success = False
    for url in urls:
        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                text = response.content.decode("latin-1")
                # Format is sentence@sentiment
                lines = text.split("\n")
                for line in lines:
                    if "@" in line:
                        parts = line.split("@")
                        sentence = parts[0].strip()
                        if sentence:
                            sentences.append(sentence)
                print(f"Loaded {len(sentences)} sentences from FinancialPhraseBank via {url}.")
                success = True
                break
        except Exception as e:
            print(f"Error fetching from {url}: {e}")
            
    if not success:
        # Fallback sentences in case of network issues
        print("Warning: Failed to download FinancialPhraseBank. Using static fallback corpus.")
        sentences = [
            "Operating profit rose to EUR 12.5 mn from EUR 10.3 mn.",
            "Sales increased by 10% year-over-year.",
            "The company expects higher net sales and operating profit in 2021.",
            "The board has proposed a dividend of EUR 0.50 per share.",
            "Net income fell due to restructuring charges.",
            "Strong product demand driven by AI chips increases revenue.",
            "Inflation pressures and supply chain issues are negative drivers."
        ]
        
    return sentences

def fetch_yfinance_news(tickers: List[str]) -> Dict[str, List[str]]:
    """
    Retrieves recent news headlines for a list of tickers from yfinance.
    """
    print(f"Fetching yfinance news headlines for {len(tickers)} companies...")
    news_by_ticker = {}
    for ticker in tqdm(tickers):
        try:
            # yfinance ticker.news returns the 8 most recent articles
            yft = yf.Ticker(ticker)
            articles = yft.news
            headlines = []
            if articles:
                for art in articles:
                    title = art.get("title", "")
                    if title:
                        headlines.append(title)
            news_by_ticker[ticker] = headlines
        except Exception as e:
            # Silent fallback, some tickers may not return news
            news_by_ticker[ticker] = []
    return news_by_ticker

def main():
    # 1. Fetch FinancialPhraseBank
    fpb_sentences = fetch_financial_phrasebank()
    
    # 2. Get list of tickers with cached yfinance statements
    tickers = [f.replace("_raw.json", "") for f in os.listdir(RAW_DIR) if f.endswith("_raw.json")]
    # Process up to 50 tickers for local speed
    tickers_subset = tickers[:50]
    
    # 3. Fetch news headlines for these tickers
    yf_news = fetch_financial_phrasebank() if not tickers_subset else fetch_yfinance_news(tickers_subset)
    
    # Flatten yfinance news
    yf_headlines = []
    if isinstance(yf_news, dict):
        for h_list in yf_news.values():
            yf_headlines.extend(h_list)
            
    # Combine all text resources
    full_corpus = {
        "financial_phrasebank": fpb_sentences,
        "yfinance_headlines": yf_headlines,
        "raw_yf_news": yf_news if isinstance(yf_news, dict) else {}
    }
    
    output_path = os.path.join(RAW_DIR, "news_corpus.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(full_corpus, f, indent=2)
        
    print(f"News corpus saved to {output_path}. Total lines compiled: {len(fpb_sentences) + len(yf_headlines)}")

if __name__ == "__main__":
    main()
