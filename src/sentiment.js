/**
 * Sentiment Analysis Bridge Module
 * Re-exports modern IndoBERT-based NLP Sentiment Engine.
 * Supports both synchronous fallback and asynchronous Transformer inference.
 */
const nlpSentiment = require('./nlp_sentiment');

module.exports = {
  analyzeSentiment: nlpSentiment.analyzeSentiment,
  analyzeSentimentNLP: nlpSentiment.analyzeSentimentNLP,
  analyzeSentimentAsync: nlpSentiment.analyzeSentimentAsync,
  analyzeSentimentNLPAsync: nlpSentiment.analyzeSentimentNLPAsync,
  analyzeSentimentBatchAsync: nlpSentiment.analyzeSentimentBatchAsync,
  checkIndoBERTHealth: nlpSentiment.checkIndoBERTHealth,
  tokenizeAndNormalize: nlpSentiment.tokenizeAndNormalize,
  SLANG_DICTIONARY: nlpSentiment.SLANG_DICTIONARY
};
