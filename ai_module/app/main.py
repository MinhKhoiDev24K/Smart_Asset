from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .models import AssetFeatures, PredictionResult
from .ml_pipeline import predict_status

app = FastAPI(title="SmartAsset AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/predict", response_model=PredictionResult)
def predict(asset: AssetFeatures):
    print("===== REQUEST RECEIVED =====")
    print(asset.dict())

    try:
        result = predict_status(asset)
        print("Prediction:", result)
        return PredictionResult(prediction=result)
    except Exception as e:
        print("ERROR:", e)
        raise HTTPException(status_code=500, detail=str(e))
