import joblib
import pandas as pd
import logging
from app.schemas import AnomalyCheckRequest, AnomalyCheckResponse
from pathlib import Path

logger = logging.getLogger(__name__)

class AnomalyDetector:
    def __init__(self):
        self.model_path = Path(__file__).resolve().parents[2] / 'models' / 'anomaly' / 'isolation_forest_v1.joblib'
        self.pipeline = None
        self.load_model()

    def load_model(self):
        try:
            if self.model_path.exists():
                self.pipeline = joblib.load(self.model_path)
                logger.info(f"Loaded anomaly model from {self.model_path}")
            else:
                logger.warning(f"Anomaly model {self.model_path} not found. Fallbacks rules will be used.")
        except Exception as e:
            logger.error(f"Error loading anomaly model: {e}")

    def predict(self, req: AnomalyCheckRequest) -> AnomalyCheckResponse:
        reasons = []
        risk_score = 10.0
        risk_band = "allow"

        # Deterministic checks first (as per SPEC.md, simple/explainable falls back to rules)
        if req.weight_kg > 5000:
            reasons.append("unusually high weight for single lot")
            risk_score += 40.0
            
        expected_total = req.weight_kg * req.rate_inr
        # Allow small floating point math differences
        if abs(req.total_inr - expected_total) > 1.0:
            reasons.append("inconsistent quoted rate × weight")
            risk_score += 80.0

        if req.rate_inr > 1000:
            reasons.append("unusual price relative to reference range (extreme high)")
            risk_score += 50.0

        # ML based check
        if self.pipeline is not None:
            try:
                input_data = pd.DataFrame([{
                    'material_category': req.material_category,
                    'weight_kg': req.weight_kg,
                    'rate_inr': req.rate_inr,
                    'total_inr': req.total_inr
                }])
                # Returns 1 for inliers, -1 for outliers
                pred = self.pipeline.predict(input_data)[0]
                # Calculate anomaly score (lower is more anomalous, ranges typically from -0.5 to 0.5)
                score = self.pipeline.decision_function(input_data)[0]
                
                if pred == -1:
                    reasons.append(f"Requires verification (Model score: {score:.2f})")
                    risk_score += 35.0
            except Exception as e:
                logger.error(f"Error evaluating ML anomaly: {e}")
                
        # Band assignment based on total risk score
        if risk_score >= 80:
            risk_band = "block"
        elif risk_score >= 50:
            risk_band = "verify"
        elif risk_score >= 30:
            risk_band = "monitor"
        else:
            risk_band = "allow"
            if len(reasons) == 0:
                reasons.append("Normal transaction parameters")

        return AnomalyCheckResponse(
            risk_score=min(100.0, risk_score),
            risk_band=risk_band,
            reasons=reasons
        )
