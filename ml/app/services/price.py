import joblib
import pandas as pd
import numpy as np
import shap
import logging
from app.schemas import PricePredictionRequest, PricePredictionResponse, ShapBreakdown
import os
from decimal import Decimal, ROUND_HALF_UP

logger = logging.getLogger(__name__)

class PricePredictor:
    def __init__(self):
        self.model_path = 'ml/models/price/xgboost_price_v1.joblib'
        self.pipeline = None
        self.explainer = None
        self.load_model()

    def load_model(self):
        try:
            if os.path.exists(self.model_path):
                self.pipeline = joblib.load(self.model_path)
                logger.info(f"Loaded price model from {self.model_path}")
            else:
                logger.warning(f"Price model {self.model_path} not found. Fallback will be used.")
        except Exception as e:
            logger.error(f"Error loading price model: {e}")

    def get_fallback_rate(self, material_category: str) -> float:
        fallbacks = {
            'pcb': 120.0,
            'cable': 90.0,
            'battery': 80.0,
            'crt': 25.0,
            'lcd_panel': 40.0,
            'motor': 45.0,
            'magnet_assembly': 55.0,
            'mixed_plastic': 10.0,
            'other': 5.0
        }
        return fallbacks.get(material_category, 10.0)

    def predict(self, req: PricePredictionRequest) -> PricePredictionResponse:
        input_data = pd.DataFrame([{
            'material_category': req.material_category,
            'condition': req.condition,
            'weight_kg': req.weight_kg
        }])

        if self.pipeline is None:
            # Fallback behavior
            rate = self.get_fallback_rate(req.material_category)
            total = rate * req.weight_kg
            return PricePredictionResponse(
                predicted_rate_inr_per_kg=self.format_money(rate),
                predicted_total_inr=self.format_money(total),
                confidence=0.1,  # Low confidence for fallback
                shap_breakdown=[ShapBreakdown(factor="fallback_reference", contribution=rate)]
            )
        
        try:
            # Prediction
            pred_rate = float(self.pipeline.predict(input_data)[0])
            pred_total = pred_rate * req.weight_kg

            # SHAP Explainability
            # Since pipeline has preprocessor + estimator, we transform input then explain
            preprocessor = self.pipeline.named_steps['preprocessor']
            xgb_model = self.pipeline.named_steps['regressor']
            
            X_transformed = preprocessor.transform(input_data)
            # TreeExplainer expects DMatrix or numpy array depending on XGBoost version, but tree explainer works fine on array
            
            if self.explainer is None:
                self.explainer = shap.TreeExplainer(xgb_model)
                
            shap_values = self.explainer.shap_values(X_transformed)
            
            # Reconstruct feature names from the column transformer
            feature_names = []
            if hasattr(preprocessor.named_transformers_['cat'], 'get_feature_names_out'):
                cat_feats = list(preprocessor.named_transformers_['cat'].get_feature_names_out(['material_category', 'condition']))
                feature_names = ['weight_kg'] + cat_feats
            else:
                feature_names = [f'feature_{i}' for i in range(X_transformed.shape[1])]
            
            shap_breakdown = []
            for i, feat in enumerate(feature_names):
                val = float(shap_values[0][i])
                if abs(val) > 0.1: # Only include meaningful contributions
                    display_name = feat.replace('material_category_', 'Material=').replace('condition_', 'Condition=').title()
                    shap_breakdown.append(ShapBreakdown(factor=display_name, contribution=val))
                    
            base_value = float(self.explainer.expected_value)
            shap_breakdown.append(ShapBreakdown(factor="Base Market Expectation", contribution=base_value))

            return PricePredictionResponse(
                predicted_rate_inr_per_kg=self.format_money(pred_rate),
                predicted_total_inr=self.format_money(pred_total),
                confidence=0.85, # Synthetic deterministic confidence
                shap_breakdown=shap_breakdown
            )

        except Exception as e:
            logger.error(f"Error during price prediction: {e}")
            rate = self.get_fallback_rate(req.material_category)
            total = rate * req.weight_kg
            return PricePredictionResponse(
                predicted_rate_inr_per_kg=self.format_money(rate),
                predicted_total_inr=self.format_money(total),
                confidence=0.0,
                shap_breakdown=[ShapBreakdown(factor="fallback_due_to_error", contribution=rate)]
            )

    def format_money(self, amount: float) -> str:
        d = Decimal(str(amount)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        return f"{d:.2f}"
