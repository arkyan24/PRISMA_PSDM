"""
IndoBERT Sentiment Analysis Model Wrapper
Prisma — PR Intelligence & Social Media Analytics

Provides high-performance inference using Hugging Face Transformers
with the canonical Indonesian BERT model fine-tuned for sentiment analysis.
"""

import os
import sys
import logging
from typing import List, Dict, Any, Optional
from functools import lru_cache

logger = logging.getLogger("indobert_service")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

DEFAULT_MODEL_NAME = "mdhugol/indonesia-bert-sentiment-classification"
MODEL_VERSION = "1.0.0"

# Standard Indonesian Sentiment 3-Class Mapping
# mdhugol/indonesia-bert-sentiment-classification:
# 0 -> LABEL_0 (Positive)
# 1 -> LABEL_1 (Neutral)
# 2 -> LABEL_2 (Negative)
ID2SENTIMENT = {
    0: "positif",
    1: "netral",
    2: "negatif"
}

LABEL_STR_MAP = {
    "label_0": "positif",
    "label_1": "netral",
    "label_2": "negatif",
    "positive": "positif",
    "neutral": "netral",
    "netral": "netral",
    "negative": "negatif",
    "positif": "positif",
    "negatif": "negatif"
}


class IndoBERTSentimentClassifier:
    _instance: Optional["IndoBERTSentimentClassifier"] = None

    def __init__(self, model_name: Optional[str] = None, device_name: Optional[str] = None):
        import torch
        from transformers import AutoTokenizer, AutoModelForSequenceClassification

        self.model_name = model_name or os.environ.get("SENTIMENT_MODEL_ID", DEFAULT_MODEL_NAME)
        
        # Device selection: support CUDA if available, fallback gracefully to CPU
        forced_device = device_name or os.environ.get("SENTIMENT_DEVICE", "").strip().lower()
        if forced_device in ["cuda", "cpu"]:
            self.device = torch.device(forced_device)
        else:
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            
        logger.info(f"Loading IndoBERT model '{self.model_name}' on device: {self.device}...")
        
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
        self.model = AutoModelForSequenceClassification.from_pretrained(self.model_name)
        self.model.to(self.device)
        self.model.eval()

        # Cache for exact repeated queries (e.g. recurring headlines)
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._max_cache_size = 5000

        logger.info(f"Model '{self.model_name}' successfully loaded and ready.")

    @classmethod
    def get_instance(cls, model_name: Optional[str] = None, device_name: Optional[str] = None) -> "IndoBERTSentimentClassifier":
        if cls._instance is None:
            cls._instance = cls(model_name=model_name, device_name=device_name)
        return cls._instance

    def _map_logits_to_probabilities(self, logits) -> Dict[str, float]:
        import torch
        probs = torch.softmax(logits, dim=-1).cpu().numpy()[0]
        
        # Match class index
        # 0: positif, 1: netral, 2: negatif
        prob_pos = float(probs[0])
        prob_neu = float(probs[1])
        prob_neg = float(probs[2])
        
        return {
            "positif": round(prob_pos, 4),
            "netral": round(prob_neu, 4),
            "neutral": round(prob_neu, 4),  # Alias for compatibility with database / frontend
            "negatif": round(prob_neg, 4)
        }

    def _determine_label_and_score(self, probs: Dict[str, float]):
        # The predicted label is the one with highest probability
        best_label = "netral"
        max_p = -1.0
        for lbl in ["positif", "negatif", "netral"]:
            if probs[lbl] > max_p:
                max_p = probs[lbl]
                best_label = lbl

        confidence = round(max_p, 4)
        # Score is directional sentiment (-1.0 to 1.0): positive prob minus negative prob
        sentiment_score = round(probs["positif"] - probs["negatif"], 4)

        return best_label, sentiment_score, confidence

    def predict(self, text: Optional[str]) -> Dict[str, Any]:
        """
        Classifies a single text string into positive, negative, or neutral.
        """
        if not text or not isinstance(text, str) or not text.strip():
            return {
                "label": "netral",
                "score": 0.0,
                "confidence": 0.5,
                "probabilities": {
                    "positif": 0.25,
                    "netral": 0.5,
                    "neutral": 0.5,
                    "negatif": 0.25
                },
                "model": self.model_name,
                "version": MODEL_VERSION,
                "status": "empty_input",
                "device": str(self.device)
            }

        cleaned = text.strip()
        cache_key = cleaned
        if cache_key in self._cache:
            return self._cache[cache_key]

        import torch

        # Tokenize with standard model tokenizer, max_length 512
        inputs = self.tokenizer(
            cleaned,
            return_tensors="pt",
            truncation=True,
            max_length=512,
            padding=True
        )
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = self.model(**inputs)
            logits = outputs.logits

        probs = self._map_logits_to_probabilities(logits)
        label, score, confidence = self._determine_label_and_score(probs)

        result = {
            "label": label,
            "score": score,
            "confidence": confidence,
            "probabilities": probs,
            "model": self.model_name,
            "version": MODEL_VERSION,
            "status": "success",
            "device": str(self.device)
        }

        if len(self._cache) < self._max_cache_size:
            self._cache[cache_key] = result

        return result

    def predict_batch(self, texts: List[str], batch_size: int = 16) -> List[Dict[str, Any]]:
        """
        Classifies a batch of texts efficiently.
        """
        import torch

        results: List[Optional[Dict[str, Any]]] = [None] * len(texts)
        texts_to_process_idx = []
        texts_to_process_vals = []

        for idx, t in enumerate(texts):
            if not t or not isinstance(t, str) or not t.strip():
                results[idx] = self.predict(t)
            elif t.strip() in self._cache:
                results[idx] = self._cache[t.strip()]
            else:
                texts_to_process_idx.append(idx)
                texts_to_process_vals.append(t.strip())

        if texts_to_process_vals:
            for i in range(0, len(texts_to_process_vals), batch_size):
                batch_texts = texts_to_process_vals[i:i + batch_size]
                batch_indices = texts_to_process_idx[i:i + batch_size]

                inputs = self.tokenizer(
                    batch_texts,
                    return_tensors="pt",
                    truncation=True,
                    max_length=512,
                    padding=True
                )
                inputs = {k: v.to(self.device) for k, v in inputs.items()}

                with torch.no_grad():
                    outputs = self.model(**inputs)
                    logits = outputs.logits
                    probs_batch = torch.softmax(logits, dim=-1).cpu().numpy()

                for j, original_idx in enumerate(batch_indices):
                    probs_arr = probs_batch[j]
                    probs = {
                        "positif": round(float(probs_arr[0]), 4),
                        "netral": round(float(probs_arr[1]), 4),
                        "neutral": round(float(probs_arr[1]), 4),
                        "negatif": round(float(probs_arr[2]), 4)
                    }
                    label, score, confidence = self._determine_label_and_score(probs)
                    res = {
                        "label": label,
                        "score": score,
                        "confidence": confidence,
                        "probabilities": probs,
                        "model": self.model_name,
                        "version": MODEL_VERSION,
                        "status": "success",
                        "device": str(self.device)
                    }
                    if len(self._cache) < self._max_cache_size:
                        self._cache[batch_texts[j]] = res
                    results[original_idx] = res

        return results
