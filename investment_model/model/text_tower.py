import math
import torch
import torch.nn as nn
from typing import Tuple, List, Optional

class MultiHeadAttention(nn.Module):
    """
    Multi-Head Attention mechanism from scratch.
    """
    def __init__(self, d_model: int = 128, n_heads: int = 4, dropout: float = 0.1):
        super().__init__()
        assert d_model % n_heads == 0, "d_model must be divisible by n_heads"
        
        self.d_model = d_model
        self.n_heads = n_heads
        self.d_k = d_model // n_heads
        
        self.w_q = nn.Linear(d_model, d_model)
        self.w_k = nn.Linear(d_model, d_model)
        self.w_v = nn.Linear(d_model, d_model)
        self.w_o = nn.Linear(d_model, d_model)
        
        self.dropout = nn.Dropout(dropout)
        
    def forward(self, q: torch.Tensor, k: torch.Tensor, v: torch.Tensor, mask: Optional[torch.Tensor] = None) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Args:
            q, k, v: Tensors of shape (batch_size, seq_len, d_model)
            mask: Optional attention mask of shape (batch_size, 1, 1, seq_len)
        Returns:
            Tuple of:
              - out: Attention output of shape (batch_size, seq_len, d_model)
              - attn: Attention weight matrices of shape (batch_size, n_heads, seq_len, seq_len)
        """
        batch_size, seq_len, _ = q.shape
        
        # Project and reshape into heads: (batch, n_heads, seq_len, d_k)
        query = self.w_q(q).view(batch_size, seq_len, self.n_heads, self.d_k).transpose(1, 2)
        key = self.w_k(k).view(batch_size, seq_len, self.n_heads, self.d_k).transpose(1, 2)
        value = self.w_v(v).view(batch_size, seq_len, self.n_heads, self.d_k).transpose(1, 2)
        
        # Scaled dot-product: (batch, n_heads, seq_len, seq_len)
        scores = torch.matmul(query, key.transpose(-2, -1)) / math.sqrt(self.d_k)
        
        if mask is not None:
            scores = scores.masked_fill(mask == 0, -1e9)
            
        attn = torch.softmax(scores, dim=-1)
        attn_dropped = self.dropout(attn)
        
        # Multiply by value: (batch, n_heads, seq_len, d_k)
        context = torch.matmul(attn_dropped, value)
        
        # Concatenate heads: (batch, seq_len, d_model)
        context = context.transpose(1, 2).contiguous().view(batch_size, seq_len, self.d_model)
        
        out = self.w_o(context)
        return out, attn

class FeedForward(nn.Module):
    """
    Position-wise Feed-Forward Network.
    """
    def __init__(self, d_model: int = 128, d_ff: int = 512, dropout: float = 0.1):
        super().__init__()
        self.linear1 = nn.Linear(d_model, d_ff)
        self.act = nn.GELU()
        self.dropout = nn.Dropout(dropout)
        self.linear2 = nn.Linear(d_ff, d_model)
        
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: shape (batch_size, seq_len, d_model)
        """
        return self.linear2(self.dropout(self.act(self.linear1(x))))

class TransformerBlock(nn.Module):
    """
    A single Pre-LayerNorm Transformer Encoder Block.
    """
    def __init__(self, d_model: int = 128, n_heads: int = 4, dropout: float = 0.1):
        super().__init__()
        self.ln1 = nn.LayerNorm(d_model)
        self.attn = MultiHeadAttention(d_model=d_model, n_heads=n_heads, dropout=dropout)
        self.ln2 = nn.LayerNorm(d_model)
        self.ff = FeedForward(d_model=d_model, d_ff=4 * d_model, dropout=dropout)
        self.dropout = nn.Dropout(dropout)
        
    def forward(self, x: torch.Tensor, mask: Optional[torch.Tensor] = None) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Args:
            x: shape (batch_size, seq_len, d_model)
            mask: Optional mask
        Returns:
            Tuple of (output, attention_weights)
        """
        # Pre-LN Multi-head self-attention
        x_norm = self.ln1(x)
        attn_out, attn_weights = self.attn(x_norm, x_norm, x_norm, mask=mask)
        x = x + self.dropout(attn_out)
        
        # Pre-LN Feed-forward network
        ff_out = self.ff(self.ln2(x))
        x = x + self.dropout(ff_out)
        
        return x, attn_weights

class TextTower(nn.Module):
    """
    Transformer Encoder Tower to process tokenized text inputs (headlines/paragraphs).
    """
    def __init__(self, vocab_size: int = 8000, d_model: int = 128, n_heads: int = 4, n_layers: int = 4, max_seq_len: int = 256, dropout: float = 0.1):
        super().__init__()
        self.d_model = d_model
        self.max_seq_len = max_seq_len
        
        # Embeddings
        self.token_embed = nn.Embedding(vocab_size, d_model)
        self.pos_embed = nn.Embedding(max_seq_len, d_model)
        
        # Transformer Blocks
        self.layers = nn.ModuleList([
            TransformerBlock(d_model=d_model, n_heads=n_heads, dropout=dropout)
            for _ in range(n_layers)
        ])
        
        self.ln_out = nn.LayerNorm(d_model)
        self.fc_out = nn.Linear(d_model, d_model)
        self.dropout = nn.Dropout(dropout)
        
    def forward(self, input_ids: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor, List[torch.Tensor]]:
        """
        Args:
            input_ids: Token IDs of shape (batch_size, seq_len)
        Returns:
            Tuple of:
              - out: Token embedding representation of the [CLS] token, shape (batch_size, 128)
              - seq_emb: Full sequence embeddings, shape (batch_size, seq_len, 128)
              - attentions: List of attention weights from each layer (useful for explainability)
        """
        batch_size, seq_len = input_ids.shape
        assert seq_len <= self.max_seq_len, f"Sequence length {seq_len} exceeds max_seq_len {self.max_seq_len}"
        
        # Create attention mask for padding token (assuming [PAD] has ID 0)
        # mask shape: (batch_size, 1, 1, seq_len)
        mask = (input_ids != 0).unsqueeze(1).unsqueeze(2).to(device=input_ids.device, dtype=torch.float32)
        
        # Position indices
        pos_indices = torch.arange(seq_len, device=input_ids.device).unsqueeze(0).expand(batch_size, -1)
        
        # Embedding sum
        x = self.token_embed(input_ids) + self.pos_embed(pos_indices)
        x = self.dropout(x)
        
        attentions = []
        # Pass through layers
        for layer in self.layers:
            x, attn_weights = layer(x, mask=mask)
            attentions.append(attn_weights)
            
        # Apply output normalization
        x = self.ln_out(x)
        
        # Extract [CLS] embedding (first token position, index 0)
        cls_embedding = x[:, 0, :] # Shape: (batch_size, d_model)
        
        # Project to final text representation
        out = self.fc_out(cls_embedding)
        
        return out, x, attentions


if __name__ == "__main__":
    # Quick TextTower sanity check
    torch.manual_seed(42)
    device = torch.device("cpu")
    
    tower = TextTower(vocab_size=1000, d_model=128, n_heads=4, n_layers=2, max_seq_len=64)
    tower = tower.to(device)
    
    # Batch size 2, Sequence length 64
    dummy_input = torch.randint(0, 1000, (2, 64)).to(device)
    # Set some padding tokens at the end
    dummy_input[0, 50:] = 0
    dummy_input[1, 55:] = 0
    
    out, seq_emb, attentions = tower(dummy_input)
    
    print("Text Tower Test:")
    print(f"Input shape:          {dummy_input.shape}")
    print(f"Output shape (CLS):   {out.shape}")
    print(f"Sequence emb shape:   {seq_emb.shape}")
    print(f"Number of layers:     {len(attentions)}")
    print(f"Layer 1 attention:    {attentions[0].shape}")
    
    assert out.shape == (2, 128)
    assert seq_emb.shape == (2, 64, 128)
    assert len(attentions) == 2
    assert attentions[0].shape == (2, 4, 64, 64)
    print("Test passed successfully!")
