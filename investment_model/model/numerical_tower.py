import torch
import torch.nn as nn
from typing import Tuple, Dict

class NumericalTower(nn.Module):
    """
    A Multi-Layer Perceptron (MLP) tower that processes structured financial ratios,
    applies a learned feature attention mechanism to identify driving ratios,
    and projects the tabular features into a joint latent space.
    """
    def __init__(self, n_features: int = 20, hidden_dims: Tuple[int, ...] = (128, 64, 32), dropout: float = 0.1):
        super().__init__()
        self.n_features = n_features
        
        # Batch normalization for raw input features (stabilizes training)
        self.bn_input = nn.BatchNorm1d(n_features)
        
        # Learnable feature importance weights (softmax normalized during forward pass)
        self.feature_weights = nn.Parameter(torch.zeros(n_features))
        
        # Architecture Layer 1: 20 -> 128
        self.fc1 = nn.Linear(n_features, 128)
        self.ln1 = nn.LayerNorm(128)
        self.act1 = nn.GELU()
        self.drop1 = nn.Dropout(dropout)
        
        # Architecture Layer 2: 128 -> 64
        self.fc2 = nn.Linear(128, 64)
        self.ln2 = nn.LayerNorm(64)
        self.act2 = nn.GELU()
        self.drop2 = nn.Dropout(dropout)
        
        # Architecture Layer 3: 64 -> 128 (residual mapping back to 128-dim)
        self.fc3 = nn.Linear(64, 128)
        self.ln3 = nn.LayerNorm(128)
        self.act3 = nn.GELU()
        
    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Args:
            x: Input tensor of shape (batch_size, n_features)
        Returns:
            Tuple of:
              - out: Projected embedding of shape (batch_size, 128)
              - attn_weights: Normalized feature importance scores of shape (n_features,)
        """
        # Ensure input is float32
        x = x.to(torch.float32)
        
        # Check batch size; if 1, BatchNorm1d requires training=False or eval mode
        if x.size(0) > 1:
            x_norm = self.bn_input(x)
        else:
            # Fallback for single-item batch inference without training stats update
            self.bn_input.eval()
            x_norm = self.bn_input(x)
            
        # Feature Importance soft gating
        attn_weights = torch.softmax(self.feature_weights, dim=0)
        x_weighted = x_norm * attn_weights
        
        # Block 1
        x1 = self.drop1(self.act1(self.ln1(self.fc1(x_weighted))))
        
        # Block 2
        x2 = self.drop2(self.act2(self.ln2(self.fc2(x1))))
        
        # Block 3 with residual connection to x1
        x3 = self.ln3(self.fc3(x2))
        out = self.act3(x3 + x1)
        
        return out, attn_weights


if __name__ == "__main__":
    # Test forward pass
    torch.manual_seed(42)
    model = NumericalTower(n_features=20)
    
    # Batch size 4, 20 features
    dummy_input = torch.randn(4, 20)
    out, weights = model(dummy_input)
    
    print("Numerical Tower Test:")
    print(f"Input shape:  {dummy_input.shape}")
    print(f"Output shape: {out.shape}")
    print(f"Weights shape: {weights.shape}")
    print(f"Weight sum:   {weights.sum().item():.4f}")
    assert out.shape == (4, 128)
    assert weights.shape == (20,)
    print("Test passed successfully!")
