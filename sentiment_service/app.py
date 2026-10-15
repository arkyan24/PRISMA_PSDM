"""
FastAPI Sentiment Analysis Service
Prisma — PR Intelligence & Social Media Analytics
"""

import os
import sys
import time
import logging
from typing import List, Dict, Any, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Ensure current directory is in sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from model import IndoBERTSentimentClassifier, MODEL_VERSION, DEFAULT_MODEL_NAME

logger = logging.getLogger("sentiment_api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

classifier: Optional[IndoBERTSentimentClassifier] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global classifier
    logger.info("Initializing IndoBERT sentiment analysis model on startup...")
    start_t = time.time()
    try:
        classifier = IndoBERTSentimentClassifier.get_instance()
        logger.info(f"Model initialization completed in {time.time() - start_t:.2f}s")
    except Exception as e:
        logger.error(f"Failed to load IndoBERT model: {e}", exc_info=True)
    yield
    logger.info("Shutting down sentiment service.")


app = FastAPI(
    title="Prisma IndoBERT Sentiment API",
    description="High-accuracy Indonesian NLP Sentiment Analysis for Prisma PR Intelligence",
    version=MODEL_VERSION,
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SingleTextRequest(BaseModel):
    text: Optional[str] = Field(default="", description="Text in Indonesian to analyze")


class BatchTextRequest(BaseModel):
    texts: List[str] = Field(default=[], description="List of Indonesian texts to analyze in batch")


class SentimentProbabilities(BaseModel):
    positif: float
    netral: float
    neutral: float
    negatif: float


class SentimentResult(BaseModel):
    label: str
    score: float
    confidence: float
    probabilities: SentimentProbabilities
    model: str
    version: str
    status: str
    device: str
    elapsed_ms: Optional[float] = None


@app.get("/")
def index():
    return {
        "service": "Prisma IndoBERT Sentiment API",
        "version": MODEL_VERSION,
        "default_model": DEFAULT_MODEL_NAME,
        "status": "ready" if classifier is not None else "initializing"
    }


@app.get("/health")
def health():
    if classifier is None:
        return {
            "status": "warming_up",
            "ready": False,
            "message": "Model is still loading or failed to load"
        }
    return {
        "status": "healthy",
        "ready": True,
        "model": classifier.model_name,
        "version": MODEL_VERSION,
        "device": str(classifier.device)
    }


@app.post("/predict", response_model=SentimentResult)
def predict(payload: SingleTextRequest):
    if classifier is None:
        raise HTTPException(status_code=503, detail="Sentiment model is not loaded yet")

    start_time = time.time()
    try:
        res = classifier.predict(payload.text)
        res["elapsed_ms"] = round((time.time() - start_time) * 1000, 2)
        return res
    except Exception as e:
        logger.error(f"Prediction error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")


@app.post("/predict_batch", response_model=List[SentimentResult])
def predict_batch(payload: BatchTextRequest):
    if classifier is None:
        raise HTTPException(status_code=503, detail="Sentiment model is not loaded yet")

    start_time = time.time()
    try:
        results = classifier.predict_batch(payload.texts)
        total_ms = (time.time() - start_time) * 1000
        per_item_ms = round(total_ms / max(len(results), 1), 2)
        for r in results:
            r["elapsed_ms"] = per_item_ms
        return results
    except Exception as e:
        logger.error(f"Batch prediction error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch inference error: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("SENTIMENT_PORT", 8000))
    host = os.environ.get("SENTIMENT_HOST", "127.0.0.1")
    logger.info(f"Starting IndoBERT sentiment service on {host}:{port}")
    uvicorn.run("app:app", host=host, port=port, reload=False)
