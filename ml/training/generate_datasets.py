import pandas as pd
import numpy as np
import os

os.makedirs('ml/data/synthetic', exist_ok=True)

np.random.seed(42)
n_samples = 2000

# Material base rates
material_rates = {
    'crt': 30, 'lcd_panel': 45, 'pcb': 120, 'cable': 80,
    'battery': 70, 'motor': 50, 'magnet_assembly': 60,
    'mixed_plastic': 15, 'other': 10
}

materials = list(material_rates.keys())
conditions = ['good', 'damaged', 'mixed']

def get_base_price(mat):
    return material_rates.get(mat, 10)

data = []
for _ in range(n_samples):
    mat = np.random.choice(materials)
    cond = np.random.choice(conditions, p=[0.4, 0.4, 0.2])
    base = get_base_price(mat)
    
    # Weight
    weight = max(0.5, np.random.normal(50, 40))
    
    # Target rate modulation
    rate = base
    if cond == 'damaged':
        rate *= np.random.uniform(0.6, 0.8)
    elif cond == 'mixed':
        rate *= np.random.uniform(0.7, 0.9)
    else:
        rate *= np.random.uniform(0.95, 1.1)
        
    data.append({
        'material_category': mat,
        'condition': cond,
        'weight_kg': weight,
        'target_rate_inr': round(rate, 2)
    })

df = pd.DataFrame(data)
df.to_csv('ml/data/synthetic/price_data.csv', index=False)
print("Generated synthetic price data.")

# Anomaly data
anomaly_data = []
for _ in range(n_samples):
    mat = np.random.choice(materials)
    weight = max(0.5, np.random.normal(50, 40))
    
    is_anomaly = np.random.random() < 0.05
    base = get_base_price(mat)
    
    if is_anomaly:
        anomaly_type = np.random.choice(['weight', 'rate'])
        if anomaly_type == 'weight':
            weight = np.random.uniform(2000, 10000)
            rate = base
        else:
            rate = base * np.random.uniform(3, 10)
    else:
        rate = base * np.random.uniform(0.7, 1.2)
        
    anomaly_data.append({
        'material_category': mat,
        'weight_kg': weight,
        'rate_inr': round(rate, 2),
        'total_inr': round(weight * rate, 2),
        'is_anomaly': int(is_anomaly)
    })
    
df_anom = pd.DataFrame(anomaly_data)
df_anom.to_csv('ml/data/synthetic/anomaly_data.csv', index=False)
print("Generated synthetic anomaly data.")
