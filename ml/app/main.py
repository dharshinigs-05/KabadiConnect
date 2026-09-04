from fastapi import FastAPI, HTTPException
from pydantic import ValidationError
from .schemas import (
    PricePredictionRequest, 
    PricePredictionResponse,
    AnomalyCheckRequest,
    AnomalyCheckResponse
)
from .services.price import PricePredictor
from .services.anomaly import AnomalyDetector
import logging

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="KabadiConnect ML ServiceAPI", version="2.0.0")

# Initialize models
price_predictor = PricePredictor()
anomaly_detector = AnomalyDetector()

@app.get("/ml/health")
def health_check():
    return {"status": "ML service is healthy"}

@app.post("/ml/predict-price", response_model=PricePredictionResponse)
def predict_price(req: PricePredictionRequest):
    try:
        return price_predictor.predict(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ml/anomaly-check", response_model=AnomalyCheckResponse)
def check_anomaly(req: AnomalyCheckRequest):
    try:
        return anomaly_detector.predict(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
