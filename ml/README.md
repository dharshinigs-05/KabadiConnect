# KabadiConnect ML Service

This repository section contains the ML service implementation for KabadiConnect, providing indicative price valuation, deterministic/ML anomaly detection, and material classification.

## Components

1. **FastAPI Service**: Runs on `http://localhost:8000` (or `ml/:8000`), implementing `/ml/predict-price` and `/ml/anomaly-check`.
2. **On-Device Artifacts**: `ml/models/classifier/` contains a TFLite file and `preprocessing.json` meant to be bundled with the React Native (Expo) frontend for on-device categorization.
3. **Training Pipelines**: Scripts to generate deterministic prototype models for XGBoost (Price) and Isolation Forest (Anomaly).

## Purpose & Scope

The ML service is designed around **honest, prototype-grade AI**. 
- The pricing model provides an **AI-assisted indicative valuation** using synthetic reference data and broad market knowledge. It does not claim to definitively dictate fair market value.
- The anomaly model flags unusual requests (e.g., massive weights, math mismatches) as **"requires verification"**, not implicitly as "fraud."
- Datasets are synthetic prototypes generated for the SIH demo and reside in `ml/data/synthetic`.

## Prerequisites

- Python 3.10+
- Virtual environment

## Setup

```bash
cd ml
python -m venv .venv
# Activate venv on Windows: .\.venv\Scripts\Activate
# Activate venv on Mac/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

## Running the API

```bash
# From within the 'ml' directory
uvicorn app.main:app --reload --port 8000
```
Endpoints:
- `GET /ml/health`
- `POST /ml/predict-price`
- `POST /ml/anomaly-check`

## Training Models

If you need to regenerate the synthetic data and model files:
```bash
# Generate datasets
python training/generate_datasets.py

# Train Price Model (XGBoost)
python training/train_price.py

# Train Anomaly Model (Isolation Forest)
python training/train_anomaly.py

# Generate Classifier Artifacts
python training/train_classifier.py
```

## Fallbacks & Guarantees
- If a model file is missing during prediction, deterministic rules or safe fallbacks are used.
- Price valuation uses arbitrary string serialization (`numeric(12,2)`) to negate floating-point rounding errors across services, per system spec.
- Inputs are validated strictly using Pydantic.
