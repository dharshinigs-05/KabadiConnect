from fastapi.testclient import TestClient
from app.main import app
from app.main import anomaly_detector, price_predictor

client = TestClient(app)

def test_health():
    res = client.get("/ml/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ML service is healthy"}

def test_trained_models_are_loaded():
    assert price_predictor.model_path.exists()
    assert price_predictor.pipeline is not None
    assert anomaly_detector.model_path.exists()
    assert anomaly_detector.pipeline is not None

def test_predict_price_valid():
    res = client.post("/ml/predict-price", json={
        "material_category": "pcb",
        "condition": "good",
        "weight_kg": 2.5
    })
    assert res.status_code == 200
    data = res.json()
    assert "predicted_rate_inr_per_kg" in data
    assert "predicted_total_inr" in data
    assert "confidence" in data
    assert data["model_version"] == "xgboost_price_v1"
    assert "shap_breakdown" in data
    assert isinstance(data["shap_breakdown"], list)

def test_predict_price_invalid_weight():
    res = client.post("/ml/predict-price", json={
        "material_category": "pcb",
        "condition": "good",
        "weight_kg": -2.5
    })
    assert res.status_code == 422 # Pydantic validation error

def test_predict_price_invalid_material_category():
    res = client.post("/ml/predict-price", json={
        "material_category": "unknown_material",
        "condition": "good",
        "weight_kg": 10.0
    })
    assert res.status_code == 422

def test_anomaly_check_invalid_material_category():
    res = client.post("/ml/anomaly-check", json={
        "material_category": "unknown_material",
        "weight_kg": 2.5,
        "rate_inr": 135.00,
        "total_inr": 337.50
    })
    assert res.status_code == 422

def test_anomaly_check_normal():
    res = client.post("/ml/anomaly-check", json={
        "material_category": "pcb",
        "weight_kg": 2.5,
        "rate_inr": 135.00,
        "total_inr": 337.50
    })
    assert res.status_code == 200
    data = res.json()
    assert data["risk_band"] in ["allow", "monitor", "verify", "block"]

def test_anomaly_check_extreme_weight():
    # Should trigger deterministic rule
    res = client.post("/ml/anomaly-check", json={
        "material_category": "pcb",
        "weight_kg": 6000.0,
        "rate_inr": 135.00,
        "total_inr": 810000.00
    })
    assert res.status_code == 200
    data = res.json()
    assert "unusually high weight for single lot" in data["reasons"]
    assert data["risk_score"] >= 40.0

def test_anomaly_check_mismatched_math():
    # Total is totally wrong
    res = client.post("/ml/anomaly-check", json={
        "material_category": "pcb",
        "weight_kg": 10.0,
        "rate_inr": 135.00,
        "total_inr": 0.00
    })
    assert res.status_code == 200
    data = res.json()
    assert "inconsistent quoted rate × weight" in data["reasons"]
    assert data["risk_band"] == "block"
