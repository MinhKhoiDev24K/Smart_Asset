from enum import Enum
from pydantic import BaseModel
from typing import Optional

class AssetType(str, Enum):
    giấy_tờ = "Giấy tờ"
    phần_cứng = "Phần cứng"
    phần_mềm = "Phần mềm"

class AssetFeatures(BaseModel):
    asset_value: float
    usage_frequency: int
    maintenance_count: int
    asset_age_months: int
    days_since_last_maint: int
    days_left: int
    asset_type: AssetType

    # Optional raw dates (frontend gửi để log)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    last_maintenance: Optional[str] = None
    predict_date: Optional[str] = None

class PredictionResult(BaseModel):
    prediction: str
