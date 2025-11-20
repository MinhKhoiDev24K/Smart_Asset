import joblib
import numpy as np

MODEL_PATH = "data/asset_status_dt_model.pkl"
ENCODER_PATH = "data/asset_le.pkl"

def load_artifacts():
    try:
        model = joblib.load(MODEL_PATH)
        le = joblib.load(ENCODER_PATH)
        return model, le
    except:
        print("❌ Không thể load model hoặc encoder")
        return None, None

def preprocess(asset):
    """
    Nhận dữ liệu từ API → Convert thành vector 6 features
    """
    X = np.array([
        asset.asset_value,
        asset.usage_frequency,
        asset.maintenance_count,
        asset.asset_age_months,
        asset.days_since_last_maint,
        asset.days_left
    ]).reshape(1, -1)
    return X

def predict_status(asset):
    model, le = load_artifacts()
    if model is None:
        return "Model chưa sẵn sàng!"

    X = preprocess(asset)
    pred = model.predict(X)[0]
    return le.inverse_transform([pred])[0]
