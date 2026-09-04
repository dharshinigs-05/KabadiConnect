# KabadiConnect ML Datasets

## Provenance
The datasets in this directory (`synthetic/`) are **SYNTHETIC / REFERENCE DATA**. 

There is currently NO large-scale, verified proprietary KabadiConnect transaction history dataset. The data generated here serves as a prototype bootstrap to demonstrate the system's "AI-assisted indicative valuation" and anomaly detection capabilities for the SIH 26229 Demo.

## Usage
- **Price Training**: `synthetic/price_data.csv` contains inputs (features like material, weight, condition) and target indicative `offered_rate_inr_per_kg`. It reflects general public market reference patterns, NOT exact real-world scrapyard data.
- **Anomaly Testing**: `synthetic/anomaly_data.csv` contains synthetic transactions with edge cases like impossible weights, unusual prices relative to typical ranges, or mismatched categorical behaviors to train the Isolation Forest.

## Transition to Live Data
Once the platform is live and verified field transactions begin happening, the XGBoost retraining lifecycle (documented in the project root) should replace this synthetic data with labeled examples from actual completed (paid and verified) transactions.
