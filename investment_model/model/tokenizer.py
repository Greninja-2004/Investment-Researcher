import re
import json
import collections
from typing import List, Dict, Tuple, Set

class SimpleBPETokenizer:
    """
    A custom Byte-Pair Encoding (BPE) tokenizer implemented from scratch.
    Specifically designed for local execution with financial datasets.
    """
    def __init__(self, vocab_size: int = 8000):
        self.vocab_size = vocab_size
        self.special_tokens = ["[PAD]", "[UNK]", "[CLS]", "[SEP]", "[MASK]"]
        
        # Initialize mapping
        self.vocab: Dict[str, int] = {}
        self.inv_vocab: Dict[int, str] = {}
        self.merges: Dict[Tuple[str, str], str] = {}
        
        # Pre-populate special tokens
        for idx, token in enumerate(self.special_tokens):
            self.vocab[token] = idx
            self.inv_vocab[idx] = token
            
        self.word_splitter = re.compile(r"\w+|[^\w\s]")

    def _get_stats(self, ids_list: List[List[str]]) -> Dict[Tuple[str, str], int]:
        counts = collections.defaultdict(int)
        for ids in ids_list:
            for i in range(len(ids) - 1):
                counts[(ids[i], ids[i+1])] += 1
        return counts

    def _merge_vocab(self, pair: Tuple[str, str], ids_list: List[List[str]]) -> List[List[str]]:
        new_ids_list = []
        p0, p1 = pair
        merged_str = p0 + p1
        for ids in ids_list:
            new_ids = []
            i = 0
            while i < len(ids):
                if i < len(ids) - 1 and ids[i] == p0 and ids[i+1] == p1:
                    new_ids.append(merged_str)
                    i += 2
                else:
                    new_ids.append(ids[i])
                    i += 1
            new_ids_list.append(new_ids)
        return new_ids_list

    def train(self, texts: List[str]):
        """
        Train BPE tokenizer on a list of texts.
        """
        # Step 1: Count initial character vocabulary
        words_vocab = collections.defaultdict(int)
        for text in texts:
            words = self.word_splitter.findall(text.lower())
            for word in words:
                words_vocab[word] += 1
                
        # Split words into character lists (using </w> for word ending representation)
        splits = []
        for word, freq in words_vocab.items():
            chars = list(word) + ["</w>"]
            splits.extend([chars] * freq)

        # Build initial alphabet vocab
        unique_chars = set()
        for chars in splits:
            unique_chars.update(chars)
            
        current_vocab_size = len(self.special_tokens)
        for char in sorted(list(unique_chars)):
            if char not in self.vocab:
                self.vocab[char] = current_vocab_size
                self.inv_vocab[current_vocab_size] = char
                current_vocab_size += 1

        # Perform BPE merges
        num_merges = self.vocab_size - current_vocab_size
        for step in range(num_merges):
            stats = self._get_stats(splits)
            if not stats:
                break
            best_pair = max(stats, key=stats.get)
            
            # Merge character sequence
            merged = best_pair[0] + best_pair[1]
            self.merges[best_pair] = merged
            
            # Add to vocabulary
            self.vocab[merged] = current_vocab_size
            self.inv_vocab[current_vocab_size] = merged
            current_vocab_size += 1
            
            # Update token lists
            splits = self._merge_vocab(best_pair, splits)
            
            if current_vocab_size >= self.vocab_size:
                break

    def encode(self, text: str, max_len: int = 256, add_special_tokens: bool = True) -> List[int]:
        """
        Encode raw string text into list of vocab integer token IDs.
        """
        if not text:
            # Handle empty inputs
            tokens = []
        else:
            words = self.word_splitter.findall(text.lower())
            tokens = []
            for word in words:
                chars = list(word) + ["</w>"]
                # Apply learned merges in order
                while len(chars) > 1:
                    merged_any = False
                    for i in range(len(chars) - 1):
                        pair = (chars[i], chars[i+1])
                        if pair in self.merges:
                            merged_token = self.merges[pair]
                            chars = chars[:i] + [merged_token] + chars[i+2:]
                            merged_any = True
                            break
                    if not merged_any:
                        break
                for token in chars:
                    tokens.append(token)

        # Convert to IDs
        ids = []
        if add_special_tokens:
            ids.append(self.vocab["[CLS]"])
            
        for t in tokens:
            if t in self.vocab:
                ids.append(self.vocab[t])
            else:
                ids.append(self.vocab["[UNK]"])
                
        if add_special_tokens:
            ids.append(self.vocab["[SEP]"])

        # Truncate / Padding
        if max_len is not None:
            if len(ids) > max_len:
                ids = ids[:max_len]
            else:
                padding_len = max_len - len(ids)
                ids = ids + [self.vocab["[PAD]"]] * padding_len
                
        return ids

    def decode(self, ids: List[int]) -> str:
        """
        Decode token IDs back to a readable string.
        """
        tokens = []
        for idx in ids:
            token = self.inv_vocab.get(idx, "[UNK]")
            if token in self.special_tokens:
                continue
            tokens.append(token)
            
        text = "".join(tokens).replace("</w>", " ")
        return text.strip()

    def save(self, filepath: str):
        """
        Save vocabulary and merges to file.
        """
        # Convert merges keys to strings for JSON compatibility
        serializable_merges = {f"{k[0]}\t{k[1]}": v for k, v in self.merges.items()}
        data = {
            "vocab": self.vocab,
            "merges": serializable_merges
        }
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def load(self, filepath: str):
        """
        Load vocabulary and merges from file.
        """
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        self.vocab = data["vocab"]
        self.inv_vocab = {int(v): k for k, v in self.vocab.items()}
        
        self.merges = {}
        for k, v in data["merges"].items():
            part1, part2 = k.split("\t")
            self.merges[(part1, part2)] = v
            
        self.vocab_size = len(self.vocab)


if __name__ == "__main__":
    # Quick tokenizer test
    texts = [
        "Apple reports record profit and earnings growth for the fourth quarter.",
        "Market indices fell as inflation worries increase.",
        "Investing in equities carries risk of loss.",
        "Revenue increased by twenty percent year-over-year."
    ]
    
    tokenizer = SimpleBPETokenizer(vocab_size=100)
    tokenizer.train(texts)
    
    sample = "Apple reports record profit."
    encoded = tokenizer.encode(sample, max_len=15)
    decoded = tokenizer.decode(encoded)
    
    print(f"Original: {sample}")
    print(f"Encoded:  {encoded}")
    print(f"Decoded:  {decoded}")
