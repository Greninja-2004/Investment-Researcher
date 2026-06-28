import os
import json
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, Any, List

RAW_DIR = "investment_model/data/raw"
LABELS_DIR = "investment_model/data/labels"
os.makedirs(LABELS_DIR, exist_ok=True)

def find_nearest_price(price_df: pd.DataFrame, target_date: datetime) -> float:
    """
    Finds the closing price on the nearest available trading day on or after target_date.
    """
    if price_df.empty:
        return np.nan
        
    # Search within a 10-day window
    for offset in range(10):
        check_date = (target_date + timedelta(days=offset)).strftime("%Y-%m-%d")
        if check_date in price_df.index:
            close_price = price_df.loc[check_date]
            # Handle if Series (e.g. multiple rows for same index, though rare in clean data)
            if isinstance(close_price, pd.Series):
                return float(close_price.iloc[0])
            # Handle if DataFrame
            elif isinstance(close_price, pd.DataFrame):
                return float(close_price['Close'].iloc[0])
            # Check if it has a 'Close' column
            elif hasattr(close_price, '__getitem__') and 'Close' in close_price:
                return float(close_price['Close'])
            else:
                return float(close_price)
                
    # If not found, look for nearest date in index
    try:
        idx_datetime = pd.to_datetime(price_df.index)
        time_deltas = np.abs(idx_datetime - target_date)
        nearest_idx = np.argmin(time_deltas)
        # Ensure it's not too far (e.g., max 15 days)
        if time_deltas[nearest_idx] < timedelta(days=15):
            val = price_df.iloc[nearest_idx]
            if isinstance(val, pd.Series) or isinstance(val, pd.DataFrame):
                return float(val['Close']) if 'Close' in val else float(val.iloc[0])
            return float(val)
    except Exception:
        pass
        
    return np.nan

def build_labels():
    """
    Builds INVEST/PASS/UNCERTAIN labels from raw financial data and stock price changes.
    Applies the rule:
      - 1-year forward return > +15% -> INVEST (1)
      - 1-year forward return < -5% -> PASS (0)
      - Else -> UNCERTAIN (2)
    Uses a time-aware split:
      - Train: statements published before 2022-01-01
      - Val: statements published in 2022
      - Test: statements published in 2023
    """
    files = [f for f in os.listdir(RAW_DIR) if f.endswith("_raw.json")]
    
    rows = []
    
    for file in files:
        ticker = file.replace("_raw.json", "")
        json_path = os.path.join(RAW_DIR, file)
        price_path = os.path.join(RAW_DIR, f"{ticker}_prices.parquet")
        
        if not os.path.exists(price_path):
            continue
            
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        # Load historical price dataframe
        price_df = pd.read_parquet(price_path)
        # Convert index to string YYYY-MM-DD for easier matching
        price_df.index = pd.to_datetime(price_df.index).strftime("%Y-%m-%d")
        
        # Financials typically keyed by date string (e.g. "2021-12-31")
        financials_dict = data.get("financials", {})
        if not financials_dict:
            continue
            
        dates = list(financials_dict.keys())
        
        for date_str in dates:
            try:
                stmt_date = datetime.strptime(date_str, "%Y-%m-%d")
            except ValueError:
                # Handle potential formats
                try:
                    stmt_date = datetime.strptime(date_str.split()[0], "%Y-%m-%d")
                except Exception:
                    continue
                    
            # 10-K/Q publication date: assume ~90 days after fiscal statement date
            pub_date = stmt_date + timedelta(days=90)
            target_1yr_date = pub_date + timedelta(days=365)
            
            # Retrieve prices
            price_start = find_nearest_price(price_df, pub_date)
            price_end = find_nearest_price(price_df, target_1yr_date)
            
            if np.isnan(price_start) or np.isnan(price_end) or price_start <= 0:
                continue
                
            # 1-year forward return
            forward_return = (price_end - price_start) / price_start
            
            # Classification logic
            if forward_return > 0.15:
                label = 1 # INVEST
            elif forward_return < -0.05:
                label = 0 # PASS
            else:
                label = 2 # UNCERTAIN
                
            rows.append({
                "ticker": ticker,
                "statement_date": date_str,
                "pub_date": pub_date.strftime("%Y-%m-%d"),
                "start_price": price_start,
                "end_price": price_end,
                "forward_return": forward_return,
                "label": label
            })
            
    df = pd.DataFrame(rows)
    
    if df.empty:
        print("Warning: No labels could be constructed. Ensure raw price and financials exist.")
        return
        
    # Sort chronologically to prevent lookahead bias when partitioning
    df = df.sort_values("pub_date").reset_index(drop=True)
    
    # Chronological percentage split: 70% Train, 15% Val, 15% Test
    n = len(df)
    train_end = int(n * 0.70)
    val_end = int(n * 0.85)
    
    splits = []
    for idx in range(n):
        if idx < train_end:
            splits.append("train")
        elif idx < val_end:
            splits.append("val")
        else:
            splits.append("test")
            
    df["split"] = splits
    
    # Save labels
    output_path = os.path.join(LABELS_DIR, "labels.parquet")
    df.to_parquet(output_path)
    print(f"Created label matrix in {output_path} with {len(df)} entries.")
    
    # Show statistics
    for split in ["train", "val", "test"]:
        split_df = df[df["split"] == split]
        if not split_df.empty:
            print(f"\n--- {split.upper()} Class Distribution ---")
            counts = split_df["label"].value_counts().sort_index()
            total = len(split_df)
            for lbl, count in counts.items():
                lbl_name = {1: "INVEST", 0: "PASS", 2: "UNCERTAIN"}[lbl]
                print(f"  {lbl_name} ({lbl}): {count} ({count/total*100:.1f}%)")
                
            # Compute class weights for cross entropy: weight = total_samples / (num_classes * class_samples)
            num_classes = 3
            weights = {}
            for lbl in [0, 1, 2]:
                class_count = counts.get(lbl, 0)
                if class_count > 0:
                    weights[lbl] = total / (num_classes * class_count)
                else:
                    weights[lbl] = 1.0
            print(f"  Suggested Class Weights: PASS: {weights.get(0, 1.0):.3f}, INVEST: {weights.get(1, 1.0):.3f}, UNCERTAIN: {weights.get(2, 1.0):.3f}")

if __name__ == "__main__":
    build_labels()
