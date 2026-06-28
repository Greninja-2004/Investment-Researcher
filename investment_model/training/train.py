import os
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from torch.optim.lr_scheduler import CosineAnnealingLR
import matplotlib.pyplot as plt
import numpy as np
from tqdm import tqdm
from sklearn.metrics import f1_score, accuracy_score

from investment_model.training.config import ModelConfig
from investment_model.training.dataset import MultimodalInvestmentDataset
from investment_model.model.investment_model import InvestmentModel

# Ensure directories exist
PROCESSED_DIR = "investment_model/data/processed"
CHECKPOINT_DIR = "investment_model/model"
os.makedirs(CHECKPOINT_DIR, exist_ok=True)

class WarmupCosineScheduler:
    """
    Cosine annealing learning rate scheduler with linear warmup.
    """
    def __init__(self, optimizer, warmup_steps: int, total_steps: int, base_lr: float):
        self.optimizer = optimizer
        self.warmup_steps = warmup_steps
        self.total_steps = total_steps
        self.base_lr = base_lr
        self.current_step = 0

    def step(self):
        self.current_step += 1
        if self.current_step < self.warmup_steps:
            # Linear warmup
            lr = self.base_lr * (self.current_step / self.warmup_steps)
        else:
            # Cosine decay
            progress = (self.current_step - self.warmup_steps) / (self.total_steps - self.warmup_steps)
            progress = min(max(progress, 0.0), 1.0)
            lr = 0.5 * self.base_lr * (1.0 + np.cos(np.pi * progress))
            
        for param_group in self.optimizer.param_groups:
            param_group['lr'] = lr

def train():
    # Load config
    config = ModelConfig()
    
    # 1. Device Setup (with MPS fallback to CPU)
    if config.device == "mps" and torch.backends.mps.is_available():
        device = torch.device("mps")
        print("Using Apple Metal Performance Shaders (MPS) backend.")
    elif torch.cuda.is_available():
        device = torch.device("cuda")
        print("Using NVIDIA CUDA backend.")
    else:
        device = torch.device("cpu")
        print("Using CPU backend.")

    # 2. Load Processed Data
    data_path = os.path.join(PROCESSED_DIR, "dataset.pt")
    if not os.path.exists(data_path):
        print(f"Error: Processed dataset not found at {data_path}. Run build_features.py first.")
        return
        
    data = torch.load(data_path, weights_only=False)
    X_num_train, X_text_train, y_train = data["train"]
    X_num_val, X_text_val, y_val = data["val"]
    
    train_dataset = MultimodalInvestmentDataset(X_num_train, X_text_train, y_train)
    val_dataset = MultimodalInvestmentDataset(X_num_val, X_text_val, y_val)
    
    # Dataloaders - set pin_memory=False for MPS to prevent unified memory lock contention
    train_loader = DataLoader(
        train_dataset, 
        batch_size=config.batch_size, 
        shuffle=True, 
        pin_memory=False
    )
    val_loader = DataLoader(
        val_dataset, 
        batch_size=config.batch_size, 
        shuffle=False, 
        pin_memory=False
    )
    
    # 3. Handle Class Imbalance & Loss Setup
    # Calculate class counts to build weight vector
    class_counts = torch.bincount(y_train)
    total_samples = len(y_train)
    num_classes = config.num_classes
    
    # Safeguard against zero counts
    class_counts = torch.where(class_counts == 0, torch.ones_like(class_counts), class_counts)
    class_weights = total_samples / (num_classes * class_counts.float())
    class_weights = class_weights.to(device)
    
    criterion = nn.CrossEntropyLoss(weight=class_weights)
    
    # 4. Model Setup
    model = InvestmentModel(config).to(device)
    
    # Enable gradient checkpointing if requested
    # We can activate checkpointing on the transformer block layer modules
    # to save memory during backpropagation
    # model.text_tower.layers
    
    optimizer = optim.AdamW(model.parameters(), lr=config.learning_rate, weight_decay=0.01)
    
    total_steps = len(train_loader) * config.max_epochs
    scheduler = WarmupCosineScheduler(
        optimizer, 
        warmup_steps=config.warmup_steps, 
        total_steps=total_steps, 
        base_lr=config.learning_rate
    )
    
    # Metrics logging
    history = {
        "train_loss": [],
        "val_loss": [],
        "val_acc": [],
        "val_f1": []
    }
    
    best_val_f1 = -1.0
    patience_counter = 0
    patience = 5
    
    print(f"Starting training for {config.max_epochs} epochs...")
    
    for epoch in range(1, config.max_epochs + 1):
        # --- Training Phase ---
        model.train()
        train_loss = 0.0
        
        for batch_num, batch_text, batch_y in train_loader:
            batch_num = batch_num.to(device)
            batch_text = batch_text.to(device)
            batch_y = batch_y.to(device)
            
            optimizer.zero_grad()
            
            # Autocast / Mixed Precision wrapper
            # On Apple M3, float16 is native.
            device_type = "mps" if device.type == "mps" else "cuda" if device.type == "cuda" else "cpu"
            use_amp = (device_type in ["mps", "cuda"])
            
            # Perform forward/backward with mixed precision
            try:
                if use_amp:
                    with torch.amp.autocast(device_type=device_type, dtype=torch.float16):
                        logits, _ = model(batch_text, batch_num)
                        loss = criterion(logits, batch_y)
                else:
                    logits, _ = model(batch_text, batch_num)
                    loss = criterion(logits, batch_y)
            except Exception as e:
                # If MPS float16 autocast fails (some PyTorch versions have MPS AMP bugs), fall back to float32
                logits, _ = model(batch_text, batch_num)
                loss = criterion(logits, batch_y)
                
            loss.backward()
            
            # Gradient clipping to prevent gradient explosion
            torch.nn.utils.clip_grad_norm_(model.parameters(), config.gradient_clip)
            
            optimizer.step()
            scheduler.step()
            
            train_loss += loss.item()
            
        avg_train_loss = train_loss / len(train_loader)
        
        # --- Validation Phase ---
        model.eval()
        val_loss = 0.0
        all_preds = []
        all_targets = []
        
        with torch.no_grad():
            for batch_num, batch_text, batch_y in val_loader:
                batch_num = batch_num.to(device)
                batch_text = batch_text.to(device)
                batch_y = batch_y.to(device)
                
                logits, _ = model(batch_text, batch_num)
                loss = criterion(logits, batch_y)
                val_loss += loss.item()
                
                preds = torch.argmax(logits, dim=1).cpu().numpy()
                all_preds.extend(preds)
                all_targets.extend(batch_y.cpu().numpy())
                
        # Flush MPS memory cache to prevent heap fragmentation on Apple Silicon
        if device.type == "mps":
            torch.mps.empty_cache()
            
        avg_val_loss = val_loss / len(val_loader)
        val_acc = accuracy_score(all_targets, all_preds)
        val_f1 = f1_score(all_targets, all_preds, average="macro")
        
        # Log progress
        print(f"Epoch {epoch:02d}/{config.max_epochs:02d} | "
              f"Train Loss: {avg_train_loss:.4f} | "
              f"Val Loss: {avg_val_loss:.4f} | "
              f"Val Acc: {val_acc:.4f} | "
              f"Val F1: {val_f1:.4f}")
              
        history["train_loss"].append(avg_train_loss)
        history["val_loss"].append(avg_val_loss)
        history["val_acc"].append(val_acc)
        history["val_f1"].append(val_f1)
        
        # Checkpointing: Save best model by Macro F1 score
        if val_f1 > best_val_f1:
            best_val_f1 = val_f1
            checkpoint_path = os.path.join(CHECKPOINT_DIR, "best_model.pt")
            torch.save({
                'epoch': epoch,
                'model_state_dict': model.state_dict(),
                'optimizer_state_dict': optimizer.state_dict(),
                'val_f1': val_f1,
                'config': config
            }, checkpoint_path)
            print(f"  --> Saved new best checkpoint to {checkpoint_path}")
            patience_counter = 0
        else:
            patience_counter += 1
            
        # Early stopping
        if patience_counter >= patience:
            print(f"Early stopping triggered after {epoch} epochs (no improvement in Val F1 for {patience} epochs).")
            break
            
    # 5. Plot and save training curves
    plt.figure(figsize=(12, 5))
    
    # Loss plot
    plt.subplot(1, 2, 1)
    plt.plot(history["train_loss"], label="Train Loss")
    plt.plot(history["val_loss"], label="Val Loss")
    plt.xlabel("Epoch")
    plt.ylabel("Loss")
    plt.title("Loss Curves")
    plt.legend()
    plt.grid(True)
    
    # Metrics plot
    plt.subplot(1, 2, 2)
    plt.plot(history["val_acc"], label="Val Accuracy")
    plt.plot(history["val_f1"], label="Val F1 (Macro)")
    plt.xlabel("Epoch")
    plt.ylabel("Score")
    plt.title("Validation Metrics")
    plt.legend()
    plt.grid(True)
    
    plt.tight_layout()
    curves_path = os.path.join(PROCESSED_DIR, "training_curves.png")
    plt.savefig(curves_path)
    plt.close()
    print(f"Saved training curves plot to {curves_path}.")

if __name__ == "__main__":
    train()
