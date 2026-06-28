import os
import sys
import argparse
import time
import requests
import xml.etree.ElementTree as ET
import numpy as np
import yfinance as yf
import torch
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

# Add workspace root to PYTHONPATH so we can run directly
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from investment_model.inference.predict import resolve_ticker, get_live_features_and_text, predict_company

def parse_args():
    parser = argparse.ArgumentParser(description="Investment Model Standalone CLI Demo")
    parser.add_argument(
        "--company", 
        type=str, 
        default="Apple", 
        help="Company name or ticker symbol (e.g. 'Apple', 'TSLA', 'Rivian')"
    )
    return parser.parse_args()

def main():
    args = parse_args()
    console = Console()
    
    console.print(f"[bold violet]Investment Research Agent - Local Model Inference Demo[/bold violet]")
    console.print(f"Analyzing [bold yellow]{args.company}[/bold yellow] using local custom PyTorch model...")
    
    with console.status("[bold green]Running on-device pipeline...[/bold green]") as status:
        try:
            # 1. Run local prediction
            # This calls resolve_ticker, fetches yfinance metrics, news, scales, and runs inference.
            res = predict_company(args.company)
        except Exception as e:
            console.print(f"[bold red]Inference failed: {e}[/bold red]")
            import traceback
            console.print(traceback.format_exc())
            sys.exit(1)
            
    # 2. Render Results Header
    verdict = res["verdict"]
    confidence = res["confidence"] * 100.0
    probabilities = {k: v * 100.0 for k, v in res["probabilities"].items()}
    
    color_map = {
        "INVEST": "green",
        "PASS": "red",
        "UNCERTAIN": "yellow"
    }
    color = color_map.get(verdict, "white")
    
    verdict_text = f"[bold {color}]{verdict}[/bold {color}]"
    
    header_content = (
        f"Ticker resolved: [bold]{res['company']}[/bold]\n"
        f"Verdict: {verdict_text} (Conviction: [bold]{confidence:.1f}%[/bold])\n"
        f"Probabilities: INVEST: {probabilities['INVEST']:.1f}% | PASS: {probabilities['PASS']:.1f}% | UNCERTAIN: {probabilities['UNCERTAIN']:.1f}%"
    )
    console.print(Panel(header_content, title="Investment Decision", border_style=color))
    
    # 3. Render Numerical Drivers Table
    table_num = Table(title="Top Financial Ratio Drivers (Numerical Tower)", header_style="bold magenta")
    table_num.add_column("Ratio Name", style="cyan")
    table_num.add_column("Raw Value", justify="right", style="white")
    table_num.add_column("Decision Impact Score", justify="right")
    
    for feat, score, val in res["key_numerical_drivers"]:
        impact_color = "green" if score >= 0 else "red"
        score_text = f"[bold {impact_color}]{score:+.4f}[/bold {impact_color}]"
        table_num.add_row(feat, f"{val:.2f}", score_text)
        
    console.print(table_num)
    
    # 4. Render News Sentiment Attention Table
    table_text = Table(title="Top News & Filing Context Focus (Text Tower Attention)", header_style="bold violet")
    table_text.add_column("Word / Subword Token", style="cyan")
    table_text.add_column("Cross-Attention Weight", justify="right", style="yellow")
    
    for word, weight in res["key_text_signals"]:
        table_text.add_row(f"'{word}'", f"{weight:.4f}")
        
    console.print(table_text)
    
    # 5. Business Summary Panel
    console.print(Panel(res["business_summary"], title="Business Operations Summary", border_style="blue"))
    console.print("[dim]Disclaimer: Educational tool only. No actual financial advice.[/dim]")

if __name__ == "__main__":
    main()
