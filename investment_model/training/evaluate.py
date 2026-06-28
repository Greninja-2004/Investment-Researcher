import os
import torch
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import classification_report, confusion_matrix
from typing import Dict, Any, List

from investment_model.training.config import ModelConfig
from investment_model.model.tokenizer import SimpleBPETokenizer
from investment_model.model.investment_model import InvestmentModel

PROCESSED_DIR = "investment_model/data/processed"
CHECKPOINT_DIR = "investment_model/model"
EVAL_DIR = "investment_model/data/processed"
os.makedirs(EVAL_DIR, exist_ok=True)

def visualize_attention_map(tokens: List[str], attn_weights: np.ndarray, save_path: str):
    """
    Plots attention weights as a bar chart or matrix.
    """
    plt.figure(figsize=(12, 4))
    
    # Take top 25 non-pad tokens for readability
    non_pad_indices = [i for i, t in enumerate(tokens) if t not in ["[PAD]", "[UNK]"]]
    if not non_pad_indices:
        return
        
    non_pad_tokens = [tokens[i] for i in non_pad_indices]
    non_pad_weights = attn_weights[non_pad_indices]
    
    # Normalize weights to sum to 1
    if non_pad_weights.sum() > 0:
        non_pad_weights = non_pad_weights / non_pad_weights.sum()
        
    # Sort by weight
    sorted_idx = np.argsort(non_pad_weights)[::-1][:20]
    top_tokens = [non_pad_tokens[i] for i in sorted_idx]
    top_weights = [non_pad_weights[i] for i in sorted_idx]
    
    sns.barplot(x=top_weights, y=top_tokens, palette="viridis")
    plt.xlabel("Attention Weight")
    plt.title("Top Text Tokens Driving the Prediction (Cross-Attention)")
    plt.tight_layout()
    plt.savefig(save_path)
    plt.close()

def evaluate():
    # 1. Device Setup
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    print(f"Running evaluation on device: {device}")
    
    # 2. Load Checkpoint
    checkpoint_path = os.path.join(CHECKPOINT_DIR, "best_model.pt")
    if not os.path.exists(checkpoint_path):
        print(f"Error: Model checkpoint not found at {checkpoint_path}. Train the model first.")
        return
        
    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=False)
    config = checkpoint["config"]
    
    model = InvestmentModel(config)
    model.load_state_dict(checkpoint["model_state_dict"])
    model = model.to(device)
    model.eval()
    
    # 3. Load Processed Dataset
    data_path = os.path.join(PROCESSED_DIR, "dataset.pt")
    data = torch.load(data_path, weights_only=False)
    X_num_test, X_text_test, y_test = data["test"]
    tickers = data["tickers"]
    splits = data["splits"]
    
    # Filter labels_df rows that correspond to test set
    test_idx = np.where(splits == "test")[0]
    test_tickers = tickers[test_idx]
    
    # Find original test dataframe details by loading labels.parquet
    labels_path = os.path.join("investment_model/data/labels/labels.parquet")
    labels_df = pd.read_parquet(labels_path)
    test_labels_df = labels_df[labels_df["split"] == "test"].reset_index(drop=True)
    
    # 4. Load Tokenizer
    tokenizer_path = os.path.join(PROCESSED_DIR, "tokenizer.json")
    tokenizer = SimpleBPETokenizer()
    tokenizer.load(tokenizer_path)
    
    # 5. Run Inference on Test Set
    all_logits = []
    all_fusion_attns = []
    all_num_weights = None
    
    with torch.no_grad():
        for i in range(len(X_num_test)):
            num_in = X_num_test[i].unsqueeze(0).to(device)
            text_in = X_text_test[i].unsqueeze(0).to(device)
            
            logits, explain = model(text_in, num_in)
            
            all_logits.append(logits.cpu().numpy())
            all_fusion_attns.append(explain["fusion_attn"].cpu().squeeze(0).numpy())
            
            # numerical weights are constant across samples (model parameter)
            if all_num_weights is None:
                all_num_weights = explain["numerical_weights"].cpu().numpy()
                
    all_logits = np.concatenate(all_logits, axis=0)
    probs = torch.softmax(torch.tensor(all_logits), dim=1).numpy()
    preds = np.argmax(all_logits, axis=1)
    targets = y_test.numpy()
    
    # 6. Generate Classification Report
    print("\n================ TEST SET PERFORMANCE ================")
    class_names = ["PASS", "INVEST", "UNCERTAIN"]
    print(classification_report(targets, preds, target_names=class_names, labels=[0, 1, 2]))
    
    # 7. Confusion Matrix
    cm = confusion_matrix(targets, preds, labels=[0, 1, 2])
    plt.figure(figsize=(6, 5))
    sns.heatmap(cm, annot=True, fmt="d", xticklabels=class_names, yticklabels=class_names, cmap="Blues")
    plt.xlabel("Predicted Label")
    plt.ylabel("True Label")
    plt.title("Confusion Matrix - Test Set")
    cm_path = os.path.join(EVAL_DIR, "confusion_matrix.png")
    plt.savefig(cm_path)
    plt.close()
    print(f"Saved confusion matrix plot to {cm_path}.")
    
    # 8. Numerical Feature Importance Attribution
    from investment_model.data_pipeline.build_features import NUMERICAL_FEATURE_KEYS
    plt.figure(figsize=(10, 6))
    # Softmax of learned weights represents importance percentage
    num_importance = np.exp(all_num_weights) / np.sum(np.exp(all_num_weights))
    
    sorted_num_idx = np.argsort(num_importance)
    plt.barh([NUMERICAL_FEATURE_KEYS[i] for i in sorted_num_idx], num_importance[sorted_num_idx], color="salmon")
    plt.xlabel("Learned Gating Importance Score")
    plt.title("Numerical Financial Ratio Importance (Learned Weights)")
    plt.tight_layout()
    num_imp_path = os.path.join(EVAL_DIR, "numerical_importance.png")
    plt.savefig(num_imp_path)
    plt.close()
    print(f"Saved numerical feature importance plot to {num_imp_path}.")
    
    # 9. Attention Visualization for the top-confidence INVEST prediction
    invest_probs = probs[:, 1]
    best_invest_idx = np.argmax(invest_probs)
    
    best_ticker = test_tickers[best_invest_idx]
    best_token_ids = X_text_test[best_invest_idx].tolist()
    best_attn = all_fusion_attns[best_invest_idx]
    
    # Decode token list
    tokens = [tokenizer.inv_vocab.get(tid, "[UNK]") for tid in best_token_ids]
    
    attn_viz_path = os.path.join(EVAL_DIR, f"{best_ticker}_attention.png")
    visualize_attention_map(tokens, best_attn, attn_viz_path)
    print(f"Saved news attention visualization for {best_ticker} to {attn_viz_path}.")
    
    # 10. Backtesting Simulation
    test_labels_df["predicted_label"] = preds
    test_labels_df["prob_invest"] = probs[:, 1]
    test_labels_df["prob_pass"] = probs[:, 0]
    
    # Calculate returns of portfolio matching model decisions
    # We construct portfolio with 'INVEST' vs 'PASS' vs 'ALL' (Benchmark equivalent)
    invest_portfolio = test_labels_df[test_labels_df["predicted_label"] == 1]
    pass_portfolio = test_labels_df[test_labels_df["predicted_label"] == 0]
    
    print("\n================ BACKTEST PERFORMANCE SIMULATION ================")
    print(f"Total Test stocks evaluated: {len(test_labels_df)}")
    print(f"Benchmark average return (All test stocks): {test_labels_df['forward_return'].mean()*100:.2f}%")
    
    if not invest_portfolio.empty:
        print(f"INVEST Portfolio average return: {invest_portfolio['forward_return'].mean()*100:.2f}% "
              f"({len(invest_portfolio)} stocks selected)")
    else:
        print("INVEST Portfolio: 0 stocks selected by model.")
        
    if not pass_portfolio.empty:
        print(f"PASS Portfolio average return: {pass_portfolio['forward_return'].mean()*100:.2f}% "
              f"({len(pass_portfolio)} stocks selected)")
    else:
        print("PASS Portfolio: 0 stocks selected by model.")
        
    # High-confidence INVEST portfolio (Top 10% highest confidence score)
    top_10_percent_cutoff = test_labels_df["prob_invest"].quantile(0.9)
    high_conv_portfolio = test_labels_df[test_labels_df["prob_invest"] >= top_10_percent_cutoff]
    
    if not high_conv_portfolio.empty:
        print(f"High-Conviction (Top 10%) INVEST Portfolio average return: {high_conv_portfolio['forward_return'].mean()*100:.2f}% "
              f"({len(high_conv_portfolio)} stocks selected)")
        
        # Outperformance over benchmark
        alpha = high_conv_portfolio['forward_return'].mean() - test_labels_df['forward_return'].mean()
        print(f"Model Portfolio Alpha vs Benchmark: {alpha*100:+.2f}%")
    else:
        print("High-Conviction Portfolio: 0 stocks.")

if __name__ == "__main__":
    evaluate()
