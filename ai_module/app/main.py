# from fastapi import FastAPI, HTTPException
# from fastapi.middleware.cors import CORSMiddleware
# from .models import AssetFeatures, PredictionResult
# from .ml_pipeline import predict_status

# app = FastAPI(title="SmartAsset AI API")

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],
#     allow_methods=["*"],
#     allow_headers=["*"]
# )

# @app.get("/health")
# def health():
#     return {"status": "ok"}

# @app.post("/predict", response_model=PredictionResult)
# def predict(asset: AssetFeatures):
#     print("===== REQUEST RECEIVED =====")
#     print(asset.dict())

#     try:
#         result = predict_status(asset)
#         print("Prediction:", result)
#         return PredictionResult(prediction=result)
#     except Exception as e:
#         print("ERROR:", e)
#         raise HTTPException(status_code=500, detail=str(e))



from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .models import AssetFeatures, PredictionResult
from .ml_pipeline import predict_status

# Import thêm thư viện gửi mail mặc định của Python và Pydantic để nhận dữ liệu
import smtplib
from email.mime.text import MIMEText
from pydantic import BaseModel

app = FastAPI(title="SmartAsset AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

# Cấu hình Schema để nhận dữ liệu phân công từ Frontend gửi lên
class AssignTaskRequest(BaseModel):
    asset_id: str
    asset_name: str
    tech_email: str
    note: str

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

# ===================================================================
# CHỨC NĂNG MỚI: API SMTP KẾT NỐI GOOGLE GỬI MAIL GIAO VIỆC THẬT
# ===================================================================
@app.post("/api/assets/assign")
def assign_task(task: AssignTaskRequest):
    # tài khoản Gmail gửi và Mật khẩu ứng dụng (App Password 16 ký tự) của Đệ vào đây
    sender_email = "minhkhoik3p2st@gmail.com" 
    sender_password = "osvy sxnb lsrg kyzy" 
    
    # Thiết lập nội dung Email định dạng UTF-8
    email_content = f"""
    Chào Kỹ thuật viên,

    Bạn nhận được một yêu cầu phân công bảo trì thiết bị mới từ hệ thống SmartAsset:
    - Mã tài sản: {task.asset_id}
    - Tên tài sản: {task.asset_name}
    - Nội dung yêu cầu: {task.note}

    Vui lòng kiểm tra thiết bị và tiến hành xử lý đúng hạn.
    Trân trọng,
    Ban Quản lý Hệ thống SmartAsset.
    """
    
    msg = MIMEText(email_content, "plain", "utf-8")
    msg["Subject"] = f"[SmartAsset] Lệnh phân công bảo trì thiết bị {task.asset_id}"
    msg["From"] = sender_email
    msg["To"] = task.tech_email

    try:
        # Kết nối tới SMTP Server của Google bằng TLS
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(sender_email, sender_password)
            server.sendmail(sender_email, task.tech_email, msg.as_string())
                
        return {"status": "success", "message": "Đã gửi email phân công công việc thành công!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi SMTP Server: {str(e)}")