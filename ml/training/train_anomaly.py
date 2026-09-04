import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
import joblib

df = pd.read_csv('ml/data/synthetic/anomaly_data.csv')

X = df[['material_category', 'weight_kg', 'rate_inr', 'total_inr']]

preprocessor = ColumnTransformer(
    transformers=[
        ('num', 'passthrough', ['weight_kg', 'rate_inr', 'total_inr']),
        ('cat', OneHotEncoder(handle_unknown='ignore'), ['material_category'])
    ])

pipeline = Pipeline(steps=[
    ('preprocessor', preprocessor),
    ('anomaly', IsolationForest(contamination=0.05, random_state=42))
])

pipeline.fit(X)

joblib.dump(pipeline, 'ml/models/anomaly/isolation_forest_v1.joblib')
print("Model saved to ml/models/anomaly/isolation_forest_v1.joblib")
