import os
import json
import torch
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from typing import List

from investment_model.inference.predict import predict_company, resolve_ticker, get_live_features_and_text
from investment_model.model.tokenizer import SimpleBPETokenizer
from investment_model.model.investment_model import InvestmentModel
from investment_model.training.config import ModelConfig
from investment_model.data_pipeline.build_features import NUMERICAL_FEATURE_KEYS

PROCESSED_DIR = "investment_model/data/processed"
CHECKPOINT_DIR = "investment_model/model"
OUTPUT_DIR = "investment_model/data/processed"
os.makedirs(OUTPUT_DIR, exist_ok=True)

def generate_explanation_report(company_name: str):
    """
    Retrieves live data for a company, runs inference, and generates detailed
    visualizations of the text attention weights and numerical importance drivers.
    Saves results as local png files.
    """
    ticker = resolve_ticker(company_name)
    print(f"Generating explanation report for {ticker}...")
    
    # 1. Fetch live features and text
    metrics, text_corpus, _ = get_live_features_and_text(ticker)
    
    # 2. Setup Device and load model
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    checkpoint_path = os.path.join(CHECKPOINT_DIR, "best_model.pt")
    if not os.path.exists(checkpoint_path):
        raise FileNotFoundError(f"Trained model checkpoint not found at {checkpoint_path}. Train the model first.")
        
    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=False)
    config = checkpoint["config"]
    
    model = InvestmentModel(config)
    model.load_state_dict(checkpoint["model_state_dict"])
    model = model.to(device)
    model.eval()
    
    # 3. Load Scaling params and normalize
    scaling_path = os.path.join(PROCESSED_DIR, "scaling_params.json")
    if os.path.exists(scaling_path):
        with open(scaling_path, "r") as f:
            mean_std = json.load(f)
        scaled_metrics = [(metrics[key] - mean_std[key]["mean"]) / mean_std[key]["std"] for key in NUMERICAL_FEATURE_KEYS]
    else:
        scaled_metrics = [metrics[key] for key in NUMERICAL_FEATURE_KEYS]
        
    X_num = torch.tensor(scaled_metrics, dtype=torch.float32).unsqueeze(0).to(device)
    
    # 4. Tokenize
    tokenizer_path = os.path.join(PROCESSED_DIR, "tokenizer.json")
    tokenizer = SimpleBPETokenizer()
    tokenizer.load(tokenizer_path)
    
    token_ids = tokenizer.encode(text_corpus, max_len=256)
    X_text = torch.tensor(token_ids, dtype=torch.long).unsqueeze(0).to(device)
    
    # 5. Forward Pass
    with torch.no_grad():
        logits, explain = model(X_text, X_num)
        probs = torch.softmax(logits, dim=1).cpu().squeeze(0).numpy()
        fusion_attn = explain["fusion_attn"].cpu().squeeze(0).numpy()
        num_weights = explain["numerical_weights"].cpu().numpy()
        
    class_names = ["PASS", "INVEST", "UNCERTAIN"]
    pred_idx = np.argmax(probs)
    verdict = class_names[pred_idx]
    confidence = probs[pred_idx]
    
    # 6. Plot numerical weights vs actual value impacts
    num_importance = np.exp(num_weights) / np.sum(np.exp(num_weights))
    impacts = num_importance * np.abs(np.array(scaled_metrics))
    
    plt.figure(figsize=(10, 6))
    sorted_idx = np.argsort(impacts)
    
    colors = ['lightgreen' if verdict == "INVEST" else 'lightcoral' if verdict == "PASS" else 'lightblue'] * len(sorted_idx)
    
    plt.barh([NUMERICAL_FEATURE_KEYS[i] for i in sorted_idx], impacts[sorted_idx], color='dodgerblue')
    plt.xlabel("Driving Impact Score (Gating Weight * Absolute Standardized Value)")
    plt.title(f"Numerical Financial Ratio Impacts for {ticker} ({verdict})")
    plt.tight_layout()
    num_fig_path = os.path.join(OUTPUT_DIR, f"{ticker}_numerical_drivers.png")
    plt.savefig(num_fig_path)
    plt.close()
    print(f"Saved numerical driver chart to {num_fig_path}")
    
    # 7. Plot text attention signals
    tokens = [tokenizer.inv_vocab.get(tid, "[UNK]") for tid in token_ids]
    non_pad_indices = [i for i, t in enumerate(tokens) if t not in ["[PAD]", "[UNK]"]]
    
    if non_pad_indices:
        non_pad_tokens = [tokens[i] for i in non_pad_indices]
        non_pad_weights = fusion_attn[non_pad_indices]
        if non_pad_weights.sum() > 0:
            non_pad_weights = non_pad_weights / non_pad_weights.sum()
            
        top_indices = np.argsort(non_pad_weights)[::-1][:20]
        top_tokens = [non_pad_tokens[i].replace("</w>", "") for i in top_indices]
        top_weights = [non_pad_weights[i] for i in top_indices]
        
        plt.figure(figsize=(10, 5))
        sns.barplot(x=top_weights, y=top_tokens, palette="magma")
        plt.xlabel("Relative Attention Weight")
        plt.title(f"Top News & Filing Tokens Attended to for {ticker}")
        plt.tight_layout()
        text_fig_path = os.path.join(OUTPUT_DIR, f"{ticker}_text_attention.png")
        plt.savefig(text_fig_path)
        plt.close()
        print(f"Saved text attention chart to {text_fig_path}")
        
    print(f"\nModel Explanation Summary for {ticker}:")
    print(f"  Verdict: {verdict} (confidence: {confidence*100:.1f}%)")
    print(f"  Top 3 Numerical Drivers:")
    sorted_driver_idx = np.argsort(impacts)[::-1]
    for k in range(3):
        idx = sorted_driver_idx[k]
        feat = NUMERICAL_FEATURE_KEYS[idx]
        val = metrics[feat]
        print(f"    - {feat}: raw value {val:.2f} (impact score: {impacts[idx]:.4f})")
        
    if non_pad_indices:
        print(f"  Top 3 Text Tokens:")
        for k in range(min(3, len(top_tokens))):
            print(f"    - '{top_tokens[k]}': attention weight {top_weights[k]:.4f}")

if __name__ == "__main__":
    import sys
    query = sys.argv[1] if len(sys.argv) > 1 else "Apple"
    import requests # safety import
    generate_explanation_report(query)
