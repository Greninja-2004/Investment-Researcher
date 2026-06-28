import torch
import torch.nn as nn
from typing import Tuple, Dict, Any

from investment_model.training.config import ModelConfig
from investment_model.model.numerical_tower import NumericalTower
from investment_model.model.text_tower import TextTower
from investment_model.model.fusion import CrossAttentionFusion

class InvestmentModel(nn.Module):
    """
    Two-Tower Fusion Neural Network that combines numerical financial ratios
    with news text sequence inputs via cross-attention.
    Outputs classification logits for: INVEST (0), PASS (1), or UNCERTAIN (2).
    """
    def __init__(self, config: ModelConfig):
        super().__init__()
        self.config = config
        
        # Text Tower (Transformer Encoder)
        self.text_tower = TextTower(
            vocab_size=config.vocab_size,
            d_model=config.d_model,
            n_heads=config.n_heads,
            n_layers=config.n_layers,
            max_seq_len=config.max_seq_len,
            dropout=config.dropout
        )
        
        # Numerical Tower (MLP)
        self.numerical_tower = NumericalTower(
            n_features=config.n_numerical_features,
            dropout=config.dropout
        )
        
        # Cross-Attention Fusion layer
        self.fusion = CrossAttentionFusion(
            d_model=config.d_model,
            dropout=config.dropout
        )
        
        # Final Decision MLP (Bottleneck to classification classes)
        self.classifier = nn.Sequential(
            nn.Linear(config.d_model, 64),
            nn.GELU(),
            nn.Dropout(config.dropout),
            nn.Linear(64, config.num_classes)
        )
        
    def forward(self, input_ids: torch.Tensor, numerical_features: torch.Tensor) -> Tuple[torch.Tensor, Dict[str, Any]]:
        """
        Args:
            input_ids: Tokenized text input, shape (batch_size, seq_len)
            numerical_features: Normalized financial ratios, shape (batch_size, n_numerical_features)
        Returns:
            Tuple of:
              - logits: raw logits of shape (batch_size, num_classes)
              - explainability_data: Dict with attention weights for interpretability:
                  * "text_attn": List of shape (n_layers, batch, n_heads, seq_len, seq_len)
                  * "fusion_attn": shape (batch, seq_len) - how numerical features attend to text tokens
                  * "numerical_weights": shape (n_numerical_features,) - static learned importance of each ratio
        """
        # 1. Forward pass through towers
        # text_cls: (batch_size, 128), text_seq: (batch_size, seq_len, 128)
        text_cls, text_seq, text_attns = self.text_tower(input_ids)
        
        # num_emb: (batch_size, 128), num_weights: (n_numerical_features,)
        num_emb, num_weights = self.numerical_tower(numerical_features)
        
        # 2. Build text sequence mask to ignore padding (value 0) in cross-attention
        # shape: (batch_size, seq_len)
        text_mask = (input_ids != 0).to(device=input_ids.device, dtype=torch.float32)
        
        # 3. Fuse representations
        # fused: (batch_size, 128), fusion_attn: (batch_size, seq_len)
        fused, fusion_attn = self.fusion(num_emb, text_seq, text_mask)
        
        # 4. Final Classification logits
        logits = self.classifier(fused)
        
        explainability_data = {
            "text_attn": text_attns,
            "fusion_attn": fusion_attn,
            "numerical_weights": num_weights
        }
        
        return logits, explainability_data


if __name__ == "__main__":
    # Test full model forward pass
    torch.manual_seed(42)
    config = ModelConfig()
    model = InvestmentModel(config)
    
    # Batch size 2, Sequence length 64, Numerical features 20
    dummy_input_ids = torch.randint(1, config.vocab_size, (2, 64))
    # Add some padding
    dummy_input_ids[0, 50:] = 0
    
    dummy_numerical = torch.randn(2, 20)
    
    logits, explain = model(dummy_input_ids, dummy_numerical)
    
    print("Investment Model Test:")
    print(f"Logits shape: {logits.shape}")
    print(f"Fusion attention shape: {explain['fusion_attn'].shape}")
    print(f"Numerical weights shape: {explain['numerical_weights'].shape}")
    print(f"Number of text self-attns: {len(explain['text_attn'])}")
    
    assert logits.shape == (2, 3)
    assert explain['fusion_attn'].shape == (2, 64)
    assert explain['numerical_weights'].shape == (20,)
    print("Test passed successfully!")
