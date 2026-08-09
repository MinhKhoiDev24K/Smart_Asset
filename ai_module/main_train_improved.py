# main_train_improved.py
import os
import pandas as pd
import numpy as np
from datetime import datetime
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report
import joblib

# ---- Config paths ----
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(SCRIPT_DIR, 'asset_dataset_fixed_v4_noisy.csv')  # file dùng chính
DATA_DIR = os.path.join(SCRIPT_DIR, 'data')
os.makedirs(DATA_DIR, exist_ok=True)
MODEL_FILE = os.path.join(DATA_DIR, 'asset_status_dt_model.pkl')
LE_FILE = os.path.join(DATA_DIR, 'asset_le.pkl')

print("=" * 70)
print("  QUY TRÌNH HUẤN LUYỆN MÔ HÌNH MÁY HỌC (SMART ASSET AI SYSTEM)")
print("=" * 70)

# ---- Helper functions ----
def safe_parse_date(s):
    if pd.isna(s):
        return None
    if isinstance(s, (pd.Timestamp, datetime)):
        return s.to_pydatetime()
    try:
        return datetime.fromisoformat(str(s))
    except Exception:
        try:
            return pd.to_datetime(s)
        except Exception:
            return None

def compute_age_months(start_date, ref_date=None):
    if start_date is None:
        return None
    ref = ref_date or datetime.now()
    diff_days = (ref - start_date).days
    return int(diff_days / 30.4375)

def compute_days_left(end_date, ref_date=None):
    if end_date is None:
        return None
    ref = ref_date or datetime.now()
    return (end_date - ref).days

def compute_days_since_last(last_maint_date, ref_date=None):
    if last_maint_date is None:
        return None
    ref = ref_date or datetime.now()
    return (ref - last_maint_date).days

# ---- BƯỚC 1: TẢI VÀ KHẢO SÁT DỮ LIỆU ----
print("\n[BƯỚC 1/4] Đang tải và khảo sát bộ dữ liệu huấn luyện...")
if not os.path.exists(DATA_FILE):
    print(f"❌ LỖI: Data file not found: {DATA_FILE}")
    raise SystemExit(1)

df = pd.read_csv(DATA_FILE)

print(f"-> Đã nạp thành công tệp: {os.path.basename(DATA_FILE)}")
print(f"-> Số lượng dòng dữ liệu (Rows): {len(df)}")
print(f"-> Các cột trong tập dữ liệu: {df.columns.tolist()}")

if 'condition' in df.columns:
    print("\n[Thống kê phân bố nhãn trạng thái ban đầu]:")
    print(df['condition'].value_counts().to_string())

# ---- BƯỚC 2: TIỀN XỬ LÝ VÀ TRÍCH XUẤT ĐẶC TRƯNG ----
print("\n[BƯỚC 2/4] Đang tiền xử lý và trích xuất các đặc trưng (Features)...")

# 1) asset_value
if 'asset_value' in df.columns:
    df['asset_value'] = df['asset_value'].astype(float)
elif 'cost_maintenance' in df.columns:
    df['asset_value'] = pd.to_numeric(df['cost_maintenance'], errors='coerce').fillna(0.0)
    print("   + Mapped 'cost_maintenance' -> 'asset_value'")
else:
    df['asset_value'] = 0.0
    print("   + Warning: no asset value column found, filled zeros")

# 2) usage_frequency
if 'usage_frequency' not in df.columns:
    if 'usage' in df.columns:
        df['usage_frequency'] = pd.to_numeric(df['usage'], errors='coerce').fillna(0).astype(int)
        print("   + Mapped 'usage' -> 'usage_frequency'")
    else:
        df['usage_frequency'] = 0
        print("   + No usage_frequency column found, filled zeros")

# 3) maintenance_count
if 'maintenance_count' not in df.columns:
    for cand in ['maintenance_count', 'maint_count', 'times_maintained', 'maintenance_times']:
        if cand in df.columns:
            df['maintenance_count'] = pd.to_numeric(df[cand], errors='coerce').fillna(0).astype(int)
            break
    else:
        df['maintenance_count'] = 0
        print("   + No maintenance_count column found, filled zeros")

# 4) asset_age_months, days_since_last_maint, days_left
if 'asset_age_months' not in df.columns:
    if 'start_date' in df.columns:
        df['start_date_parsed'] = df['start_date'].apply(safe_parse_date)
        df['asset_age_months'] = df['start_date_parsed'].apply(lambda d: compute_age_months(d))
        print("   + Computed 'asset_age_months' from 'start_date'")
    else:
        df['asset_age_months'] = 0
        print("   + No start_date -> asset_age_months set to 0")

if 'days_left' not in df.columns:
    if 'end_date' in df.columns:
        df['end_date_parsed'] = df['end_date'].apply(safe_parse_date)
        df['days_left'] = df['end_date_parsed'].apply(lambda d: compute_days_left(d))
        print("   + Computed 'days_left' from 'end_date'")
    else:
        df['days_left'] = 0
        print("   + No end_date -> days_left set to 0")
else:
    df['days_left'] = pd.to_numeric(df['days_left'], errors='coerce').fillna(0).astype(int)

if 'days_since_last_maint' not in df.columns:
    if 'last_maintenance' in df.columns:
        df['last_maintenance_parsed'] = df['last_maintenance'].apply(safe_parse_date)
        df['days_since_last_maint'] = df['last_maintenance_parsed'].apply(lambda d: compute_days_since_last(d))
        print("   + Computed 'days_since_last_maint' from 'last_maintenance'")
    else:
        df['days_since_last_maint'] = 0
        print("   + No last_maintenance -> days_since_last_maint set to 0")
else:
    df['days_since_last_maint'] = pd.to_numeric(df['days_since_last_maint'], errors='coerce').fillna(0).astype(int)

# Ensure final types
df['asset_value'] = df['asset_value'].astype(float)
df['usage_frequency'] = df['usage_frequency'].astype(int)
df['maintenance_count'] = df['maintenance_count'].astype(int)
df['asset_age_months'] = df['asset_age_months'].fillna(0).astype(int)
df['days_since_last_maint'] = df['days_since_last_maint'].fillna(0).astype(int)
df['days_left'] = df['days_left'].fillna(0).astype(int)

# ---- Label: use 'condition' column
if 'condition' not in df.columns and 'status' in df.columns:
    print("   + Warning: 'condition' not found; using 'status' numeric as label mapping (0->Hỏng,1->Cần bảo trì,2->Tốt)")
    status_map = {0: 'Hỏng', 1: 'Cần bảo trì', 2: 'Tốt'}
    df['condition'] = df['status'].map(status_map)
elif 'condition' not in df.columns:
    print("❌ ERROR: No 'condition' label column found. Exiting.")
    raise SystemExit(1)

df['condition'] = df['condition'].fillna('Tốt')

# ---- Final feature matrix
features = [
    'asset_value',
    'usage_frequency',
    'maintenance_count',
    'asset_age_months',
    'days_since_last_maint',
    'days_left'
]
print(f"-> 6 Đặc trưng đầu vào chính thức: {features}")

X = df[features].values
y = df['condition'].values

# ---- BƯỚC 3: MÃ HÓA NHÃN VÀ HUẤN LUYỆN MÔ HÌNH ----
print("\n[BƯỚC 3/4] Đang mã hóa nhãn và huấn luyện thuật toán...")
le = LabelEncoder()
y_enc = le.fit_transform(y)
print(f"-> Các nhãn sau khi encode: {list(le.classes_)}")

X_train, X_test, y_train, y_test = train_test_split(
    X, y_enc, test_size=0.2, random_state=42, shuffle=True
)

print(f"-> Kích thước tập Train: {X_train.shape[0]} mẫu | Tập Test: {X_test.shape[0]} mẫu")
print("-> Training RandomForestClassifier...")

# ⭐ MODEL GIẢM OVERFITTING (Giữ nguyên tham số chuẩn)
model = RandomForestClassifier(
    n_estimators=300,
    max_depth=8,
    min_samples_split=10,
    min_samples_leaf=4,
    max_features="sqrt",
    random_state=42
)

model.fit(X_train, y_train)
print("-> Huấn luyện mô hình thành công!")

# ---- BƯỚC 4: ĐÁNH GIÁ VÀ LƯU TRỮ ARTIFACTS ----
print("\n[BƯỚC 4/4] Đang đánh giá và lưu trữ Artifacts...")
y_pred = model.predict(X_test)
acc = accuracy_score(y_test, y_pred)

print("=" * 60)
print(f"  🎯 ACCURACY ON TEST SET: {acc:.4f} ({acc * 100:.2f}%)")
print("=" * 60)

print("\n[Báo cáo chi tiết Classification Report]:")
print(classification_report(y_test, y_pred, target_names=le.classes_))

# Save artifacts
joblib.dump(model, MODEL_FILE)
joblib.dump(le, LE_FILE)

print("=" * 70)
print(f"-> Saved model to: {MODEL_FILE}")
print(f"-> Saved label encoder to: {LE_FILE}")
print("  HOÀN TẤT TOÀN BỘ QUY TRÌNH!")
print("=" * 70)