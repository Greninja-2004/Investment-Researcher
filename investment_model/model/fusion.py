import math
import torch
import torch.nn as nn
from typing import Tuple, Optional

class CrossAttentionFusion(nn.Module):
    """
    A single-head cross-attention layer where numerical embeddings (query)
    attend to the text sequence representations (key, value) to perform
    modal-aware fusion.
    """
    def __init__(self, d_model: int = 128, dropout: float = 0.1):
        super().__init__()
        self.d_model = d_model
        
        self.w_q = nn.Linear(d_model, d_model)
        self.w_k = nn.Linear(d_model, d_model)
        self.w_v = nn.Linear(d_model, d_model)
        self.w_o = nn.Linear(d_model, d_model)
        
        self.dropout = nn.Dropout(dropout)
        
    def forward(self, numerical_emb: torch.Tensor, text_seq_emb: torch.Tensor, text_mask: Optional[torch.Tensor] = None) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Args:
            numerical_emb: Tabular embedding of shape (batch_size, d_model)
            text_seq_emb: Text sequence embeddings of shape (batch_size, seq_len, d_model)
            text_mask: Optional boolean mask of shape (batch_size, seq_len) where True/1 indicates valid tokens.
        Returns:
            Tuple of:
              - out: Fused representation of shape (batch_size, d_model)
              - attn_weights: Attention distribution over text sequence of shape (batch_size, seq_len)
        """
        batch_size, seq_len, _ = text_seq_emb.shape
        
        # Project Query (numerical): (batch_size, 1, d_model)
        q = self.w_q(numerical_emb.unsqueeze(1))
        
        # Project Key and Value (text): (batch_size, seq_len, d_model)
        k = self.w_k(text_seq_emb)
        v = self.w_v(text_seq_emb)
        
        # Calculate attention scores: (batch_size, 1, seq_len)
        scores = torch.matmul(q, k.transpose(-2, -1)) / math.sqrt(self.d_model)
        
        if text_mask is not None:
            # text_mask is (batch, seq_len) -> unsqueeze to (batch, 1, seq_len)
            mask = text_mask.unsqueeze(1)
            scores = scores.masked_fill(mask == 0, -1e9)
            
        # Attention weights: (batch_size, 1, seq_len) -> squeeze to (batch_size, seq_len)
        attn_weights = torch.softmax(scores, dim=-1)
        attn_dropped = self.dropout(attn_weights)
        
        # Weighted sum: (batch_size, 1, d_model)
        context = torch.matmul(attn_dropped, v)
        
        # Squeeze and project output: (batch_size, d_model)
        fused = context.squeeze(1)
        out = self.w_o(fused)
        
        return out, attn_weights.squeeze(1)


if __name__ == "__main__":
    # Sanity check
    torch.manual_seed(42)
    fusion = CrossAttentionFusion(d_model=128)
    
    num_emb = torch.randn(4, 128)
    text_seq = torch.randn(4, 50, 128)
    mask = torch.ones(4, 50)
    mask[0, 40:] = 0 # pad last 10 tokens for first item
    
    out, attn = fusion(num_emb, text_seq, mask)
    
    print("Cross Attention Fusion Test:")
    print(f"Numerical emb shape: {num_emb.shape}")
    print(f"Text seq shape:      {text_seq.shape}")
    print(f"Output shape:         {out.shape}")
    print(f"Attn weights shape:   {attn.shape}")
    
    assert out.shape == (4, 128)
    assert attn.shape == (4, 50)
    print("Test passed successfully!")
