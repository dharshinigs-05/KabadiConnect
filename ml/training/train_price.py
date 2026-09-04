import pandas as pd
import numpy as np
import xgboost as xgb
import joblib
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import json

df = pd.read_csv('ml/data/synthetic/price_data.csv')

X = df[['material_category', 'condition', 'weight_kg']]
y = df['target_rate_inr']

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

numeric_features = ['weight_kg']
categorical_features = ['material_category', 'condition']

preprocessor = ColumnTransformer(
    transformers=[
        ('num', 'passthrough', numeric_features),
        ('cat', OneHotEncoder(handle_unknown='ignore'), categorical_features)
    ])

pipeline = Pipeline(steps=[
    ('preprocessor', preprocessor),
    ('regressor', xgb.XGBRegressor(n_estimators=100, learning_rate=0.1, random_state=42))
])

pipeline.fit(X_train, y_train)
y_pred = pipeline.predict(X_test)

metrics = {
    'mae': float(mean_absolute_error(y_test, y_pred)),
    'rmse': float(np.sqrt(mean_squared_error(y_test, y_pred))),
    'r2': float(r2_score(y_test, y_pred))
}

print("Price Model Evaluation (Synthetic Data):")
print(json.dumps(metrics, indent=2))

joblib.dump(pipeline, 'ml/models/price/xgboost_price_v1.joblib')
print("Model saved to ml/models/price/xgboost_price_v1.joblib")
