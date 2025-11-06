# Cài đặt tất cả các thư viện cần thiết:
# python -m pip install pandas scikit-learn joblib openpyxl imbalanced-learn
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report
# Thư viện để xử lý mất cân bằng dữ liệu
from imblearn.over_sampling import SMOTE 
import joblib, os
import numpy as np 

# --- CẤU HÌNH VÀ TÊN FILE (ĐÃ CẬP NHẬT ĐỂ LƯU VÀO THƯ MỤC RIÊNG) ---
OUTPUT_DIR = "model_exports"
MODEL_FILE = os.path.join(OUTPUT_DIR, "asset_status_classifier_v2.pkl")
FEATURE_FILE = os.path.join(OUTPUT_DIR, "feature_columns_v2.pkl")

# LOGIC XÁC ĐỊNH ĐƯỜNG DẪN FILE DỮ LIỆU ĐẦU VÀO
DATA_FILE_LOCAL = r"/home/minhkhoik3p2st/Downloads/Smart_Asset/ml_module/train/asset_dataset_full.xlsx"
DATA_FILE_CANVAS = "asset_dataset_full.xlsx"
DATA_FILE_FALLBACK = "asset_dataset_full.xlsx - Sheet1.csv"
DATA_FILE = ""

if os.path.exists(DATA_FILE_CANVAS):
    DATA_FILE = DATA_FILE_CANVAS
elif os.path.exists(DATA_FILE_FALLBACK):
    DATA_FILE = DATA_FILE_FALLBACK
elif os.path.exists(DATA_FILE_LOCAL):
    DATA_FILE = DATA_FILE_LOCAL
else:
    print(f"Không tìm thấy file dữ liệu: Vui lòng đảm bảo file '{DATA_FILE_CANVAS}' đã được tải lên.")
    exit()

# Đọc dữ liệu
# ==============================
try:
    if DATA_FILE.endswith('.xlsx'):
        df = pd.read_excel(DATA_FILE)
    else:
        df = pd.read_csv(DATA_FILE)
except Exception as e:
    print(f"Lỗi khi đọc file {DATA_FILE}: {e}")
    exit()
    
print(f"Dữ liệu đọc thành công từ file: {DATA_FILE}")

# ==============================
# BƯỚC 1: KỸ THUẬT ĐẶC TRƯNG TỪ THỜI GIAN
# ==============================
# Chuyển đổi cột ngày tháng và tạo đặc trưng mới
df['start_date'] = pd.to_datetime(df['start_date'])
df['end_date'] = pd.to_datetime(df['end_date'])

df['start_year'] = df['start_date'].dt.year
df['end_year'] = df['end_date'].dt.year
df['start_month'] = df['start_date'].dt.month
df['end_month'] = df['end_date'].dt.month
# Đặc trưng quan trọng nhất: Chu kỳ hợp đồng/tài sản
df['duration_days'] = (df['end_date'] - df['start_date']).dt.days


# ==============================
# BƯỚC 2: CHUẨN HÓA NHÃN & MÃ HÓA ĐẶC TRƯNG
# ==============================
def calculate_status(row):
    """0: Hết hạn, 1: Sắp hết hạn (<=30 ngày), 2: Hợp lệ"""
    if row["days_left"] < 0:
        return 0
    elif 0 <= row["days_left"] <= 30:
        return 1
    else:
        return 2

df["target_status"] = df.apply(calculate_status, axis=1)

# Loại bỏ các cột gây nhiễu và không cần thiết
df = df.drop(columns=['id', 'name', 'start_date', 'end_date', 'days_left', 'status', 'condition'])

# One-Hot Encoding cho cột 'type' (Giấy tờ, Thiết bị...)
df_encoded = pd.get_dummies(df, columns=["type"], drop_first=True)


# Xây dựng danh sách đặc trưng cuối cùng
time_features = ['start_year', 'end_year', 'start_month', 'end_month', 'duration_days']
type_features = [col for col in df_encoded.columns if col.startswith('type_')]

X_cols = type_features + time_features + ["cost_maintenance"]
X = df_encoded[X_cols]
y = df_encoded["target_status"]

print("\nPhân bố trạng thái mục tiêu (trước SMOTE):")
print(y.value_counts(normalize=True) * 100)

# ==============================
# BƯỚC 3: CÂN BẰNG DỮ LIỆU VÀ CHIA TẬP TRAIN/TEST
# ==============================
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

print("\nÁp dụng SMOTE để xử lý mất cân bằng dữ liệu...")
smote = SMOTE(random_state=42)
X_train_smote, y_train_smote = smote.fit_resample(X_train, y_train)

print("Phân bố trạng thái sau khi áp dụng SMOTE:")
print(pd.Series(y_train_smote).value_counts(normalize=True) * 100)


# ==============================
# BƯỚC 4: HUẤN LUYỆN VÀ ĐÁNH GIÁ MÔ HÌNH
# ==============================
model = RandomForestClassifier(
    n_estimators=200, max_depth=10, random_state=42, n_jobs=-1, class_weight='balanced'
)
model.fit(X_train_smote, y_train_smote)
print("\n Huấn luyện mô hình Phân loại hoàn tất.")

# Đánh giá
y_pred = model.predict(X_test)
accuracy = accuracy_score(y_test, y_pred)

print("\n--- KẾT QUẢ ĐÁNH GIÁ MÔ HÌNH ---")
print(f"Độ chính xác (Accuracy) trên tập Test: {round(accuracy, 4)}")
print("\nBáo cáo chi tiết (Classification Report):\n", classification_report(y_test, y_pred))

# Lưu model và danh sách đặc trưng vào thư mục OUTPUT_DIR
if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)
    print(f"\nĐã tạo thư mục xuất: {OUTPUT_DIR}/")

joblib.dump(model, MODEL_FILE)
joblib.dump(X_cols, FEATURE_FILE)

print(f"\n Mô hình và danh sách đặc trưng đã được lưu thành công vào thư mục {OUTPUT_DIR}!")


# ==============================
# DỰ ĐOÁN THỬ NGHIỆM
# ==============================
def get_status_label(status_code):
    return {0: "Hết hạn", 1: "Sắp hết hạn", 2: "Hợp lệ"}.get(status_code, "Không xác định")

# Dữ liệu mẫu cần dự đoán
sample_raw = pd.DataFrame({
    "type": ["Thiết bị"],         
    "start_date": ["2024-03-31"],
    "end_date": ["2026-02-08"], 
    "cost_maintenance": [5] 
})

# Feature Engineering và One-Hot Encoding cho dữ liệu mẫu
sample_raw['start_date'] = pd.to_datetime(sample_raw['start_date'])
sample_raw['end_date'] = pd.to_datetime(sample_raw['end_date'])
sample_raw['start_year'] = sample_raw['start_date'].dt.year
sample_raw['end_year'] = sample_raw['end_date'].dt.year
sample_raw['start_month'] = sample_raw['start_date'].dt.month
sample_raw['end_month'] = sample_raw['end_date'].dt.month
sample_raw['duration_days'] = (sample_raw['end_date'] - sample_raw['start_date']).dt.days

sample_encoded = pd.get_dummies(sample_raw, columns=["type"])

# Đảm bảo dữ liệu mẫu có đầy đủ các cột (features) như khi huấn luyện
sample_final = pd.DataFrame(columns=X_cols)
for col in X_cols:
    if col in sample_encoded.columns:
        sample_final[col] = sample_encoded[col]
    elif col in time_features or col == "cost_maintenance":
        sample_final[col] = sample_raw[col]
    else:
        sample_final[col] = 0 
sample_final = sample_final.fillna(0)


pred_status_code = model.predict(sample_final)[0]
pred_status_label = get_status_label(pred_status_code)

print(f"\n--- DỰ ĐOÁN THỬ CUỐI CÙNG ---")
print(f"Input: Type={sample_raw['type'][0]}, Chu kỳ {sample_raw['duration_days'][0]} ngày, Chi phí={5}")
print(f"Dự đoán => Trạng thái: {pred_status_label} (Code: {pred_status_code})")
