import torch
from torch.utils.data import Dataset
from typing import Tuple

class MultimodalInvestmentDataset(Dataset):
    """
    A PyTorch Dataset that loads numerical financial features and tokenized text sequence inputs
    alongside the INVEST/PASS/UNCERTAIN label.
    """
    def __init__(self, X_num: torch.Tensor, X_text: torch.Tensor, y: torch.Tensor):
        assert len(X_num) == len(X_text) == len(y), "All input tensors must have the same length."
        self.X_num = X_num
        self.X_text = X_text
        self.y = y

    def __len__(self) -> int:
        return len(self.y)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Returns:
            numerical_features: shape (20,)
            input_ids: shape (seq_len,)
            label: scalar (long)
        """
        return self.X_num[idx], self.X_text[idx], self.y[idx]
