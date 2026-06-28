from dataclasses import dataclass, field
from typing import List, Tuple

@dataclass
class ModelConfig:
    # Text tower
    vocab_size: int = 8000       # small BPE vocab for financial text
    max_seq_len: int = 256       # news headline + snippet
    d_model: int = 128           # embedding dim (small!)
    n_heads: int = 4
    n_layers: int = 4
    dropout: float = 0.1

    # Numerical tower
    n_numerical_features: int = 20
    mlp_hidden_dims: Tuple[int, ...] = (128, 64, 32)

    # Training
    batch_size: int = 16         # safe for 8GB MPS
    learning_rate: float = 3e-4
    warmup_steps: int = 500
    max_epochs: int = 30
    gradient_clip: float = 1.0
    device: str = "mps"          # Apple Silicon

    # Classes
    num_classes: int = 3         # INVEST (1), PASS (0), UNCERTAIN (2)
