from pydantic import BaseModel, Field, field_validator
import re
from typing import List, Literal

class PricePredictionRequest(BaseModel):
    material_category: str
    condition: str
    weight_kg: float

    @field_validator('weight_kg')
    @classmethod
    def check_weight(cls, v):
        if v <= 0:
            raise ValueError('Weight must be positive')
        if v > 10000:
            raise ValueError('Weight is unrealistically high for a single lot')
        return v

class ShapBreakdown(BaseModel):
    factor: str
    contribution: float

class PricePredictionResponse(BaseModel):
    predicted_rate_inr_per_kg: str = Field(..., description="Decimal string, e.g. 132.50")
    predicted_total_inr: str = Field(..., description="Decimal string, e.g. 500.00")
    confidence: float = Field(..., ge=0.0, le=1.0)
    shap_breakdown: List[ShapBreakdown]

    @field_validator('predicted_rate_inr_per_kg', 'predicted_total_inr')
    @classmethod
    def check_decimal_string(cls, v):
        if not re.match(r'^-?(?:0|[1-9]\d*)\.\d{2}$', v):
            raise ValueError('Must be a decimal string with exactly two decimal places')
        return v

class AnomalyCheckRequest(BaseModel):
    material_category: str
    weight_kg: float
    rate_inr: float
    total_inr: float
    
    @field_validator('weight_kg', 'rate_inr', 'total_inr')
    @classmethod
    def check_positive(cls, v):
        if v < 0:
            raise ValueError('Value cannot be negative')
        return v

class AnomalyCheckResponse(BaseModel):
    risk_score: float = Field(..., ge=0, le=100)
    risk_band: Literal["allow", "monitor", "verify", "block"]
    reasons: List[str]
