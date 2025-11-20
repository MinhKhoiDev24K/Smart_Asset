
import { initializeApp as initApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, query } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";




// ===================================================================
//  CẤU HÌNH FIREBASE & BIẾN TOÀN CỤC
// ===================================================================
// FIREBASE SETUP AND GLOBAL VARIABLES
// ===================================================================
setLogLevel('Debug');

let app, auth, db, userId;
let isAuthReady = false;

// --- Environment Configuration Check ---
const isCanvasEnvironment = typeof __firebase_config !== 'undefined' && __firebase_config && Object.keys(JSON.parse(__firebase_config)).length > 0;

const canvasAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-smartasset-id';
const canvasFirebaseConfig = isCanvasEnvironment ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- LOCAL FIREBASE CONFIGURATION (FOR VS CODE) ---
// This block contains the actual config for smartasset-daaf4
const LOCAL_FIREBASE_CONFIG = {
    apiKey: "AIzaSyDb2frcXhbqW8HqkwTbGbwmlhv-P3E-Uic", 
    authDomain: "smartasset-daaf4.firebaseapp.com", 
    projectId: "smartasset-daaf4", 
    storageBucket: "smartasset-daaf4.firebasestorage.app", 
    messagingSenderId: "247174750637", 
    appId: "1:247174750637:web:8bc582fc44ceff2ca28124",
    measurementId: "G-ER8DZVZX9L" // Added Measurement ID
};
// --------------------------------------------------------------------------

// Final configuration selection
const finalConfig = isCanvasEnvironment ? canvasFirebaseConfig : LOCAL_FIREBASE_CONFIG;
const appId = isCanvasEnvironment ? canvasAppId : LOCAL_FIREBASE_CONFIG.projectId || canvasAppId;

// Critical Check: If running locally and config is not set, stop the process
if (!finalConfig.apiKey || finalConfig.apiKey.includes('ĐIỀN')) {
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('auth-status').textContent = 'LỖI CẤU HÌNH: KHÓA API CHƯA ĐƯỢC ĐIỀN ĐẦY ĐỦ.';
        document.getElementById('auth-status').classList.remove('error-message');
        document.getElementById('auth-status').style.color = 'var(--danger-color)';
        document.getElementById('loginButton').disabled = true;
    });
    // Stop further script execution if running locally without proper config
    throw new Error("Missing Firebase Configuration."); 
}

// Sử dụng một ID cố định để lưu trữ dữ liệu Admin, thay vì sử dụng UID thay đổi của tài khoản ẩn danh/custom token.
const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = 'admin123';
const ADMIN_PERSISTENT_ID = 'admin_data_store';

// Global states
let assetsCache = [];
let currentEditingDocId = null;
let currentModalAction = null;
let modalTargetDocId = null; // Biến lưu trữ docId khi mở modal xác nhận
let assetTypeChartInstance = null;
let predictionStatusChartInstance = null;
let lastPredictionResult = null;

// List/Pagination States
let assetsPerPage = 10;
let currentPage = 1;
let currentSearchTerm = '';
let currentFilterType = '';
let currentFilterStatus = '';

let mockUsers = [
    { id: 1, name: 'Nguyễn Văn A', email: 'vana@smartasset.com', role: 'Admin', status: 'Active' },
    { id: 2, name: 'Trần Thị B', email: 'thib@smartasset.com', role: 'Staff', status: 'Active' },
    { id: 3, name: 'Lê Văn C', email: 'vanc@smartasset.com', role: 'Staff', status: 'Inactive' },
];


// ===================================================================
// ĐĂNG NHẬP / KHỞI TẠO HỆ THỐNG
// ===================================================================
// --- AUTHENTICATION & INITIALIZATION LOGIC ---

function toggleAppScreen(isAuthenticated, username = '') {
    const loginScreen = document.getElementById('login-screen');
    const appContainer = document.getElementById('app-container');
    
    if (isAuthenticated) {
        loginScreen.style.display = 'none';
        appContainer.style.display = 'flex';
        document.getElementById('current-username').textContent = username;
        document.getElementById('auth-status').style.display = 'none';
        initializeApp(); 
    } else {
        // Logic hiển thị màn hình đăng nhập
        loginScreen.style.display = 'block';
        appContainer.style.display = 'none';
        document.getElementById('auth-status').style.display = 'block';
        document.getElementById('auth-status').textContent = 'Vui lòng đăng nhập';
        
        destroyCharts(); 
    }
}

async function handleLogin(event) {
    event.preventDefault();
    const usernameInput = document.getElementById('username').value;
    const passwordInput = document.getElementById('password').value;
    const statusElement = document.getElementById('auth-status');
    
    statusElement.style.display = 'block';
    statusElement.textContent = 'Đang xác thực...';

    if (usernameInput === DEFAULT_USERNAME && passwordInput === DEFAULT_PASSWORD) {
        console.log("Xác thực thành công với tài khoản mặc định!");
        
        if (!app) {
            app = initApp(finalConfig);
            auth = getAuth(app);
            db = getFirestore(app);
        }
        
        const token = initialAuthToken;
        try {
            // Firebase sign-in initiates the session
            if (token) {
                await signInWithCustomToken(auth, token);
            } else {
                await signInAnonymously(auth);
            }
            // onAuthStateChanged sẽ tự động xử lý chuyển màn hình nếu thành công

        } catch (error) {
            console.error("Lỗi đăng nhập Firebase:", error);
            statusElement.textContent = `Lỗi kết nối Firebase: ${error.message}`;
            document.getElementById('loginButton').disabled = false;
        }

    } else {
        statusElement.textContent = 'Lỗi: Tên đăng nhập hoặc mật khẩu không đúng.';
        document.getElementById('loginButton').disabled = false;
    }
}


function handleLogout(event) {
    event.preventDefault();
    
    // 1. Thực hiện Logout khỏi Firebase Auth
    if (auth) {
        // Gọi signOut. Listener onAuthStateChanged sẽ nhận được trạng thái user=null và gọi toggleAppScreen(false)
        signOut(auth).catch((error) => {
            console.error("Lỗi khi đăng xuất Firebase:", error);
            showStatusModal('Lỗi Đăng xuất', `Đăng xuất thất bại: ${error.message}`, 'danger');
        });
    } else {
        // Fallback nếu auth chưa được khởi tạo, chỉ cập nhật UI
        toggleAppScreen(false);
    }

    // 2. Cleanup login form state immediately
    document.getElementById('username').value = DEFAULT_USERNAME;
    document.getElementById('password').value = DEFAULT_PASSWORD;
    document.getElementById('auth-status').textContent = 'Đã đăng xuất.';
    document.getElementById('loginButton').disabled = false;
}


async function initializeFirebase() {
    try {
        if (!app) {
            app = initApp(finalConfig);
            auth = getAuth(app);
            db = getFirestore(app);
        }
        
        // Initial sign-in attempt
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }

        // Listener for Auth State Changes (Handles both initial sign-in and sign-out)
        onAuthStateChanged(auth, (user) => {
            if (user) {
                // Gán userId tạm thời của phiên cho mục đích theo dõi (userId sẽ thay đổi sau mỗi lần sign-in/out)
                userId = user.uid; 
                isAuthReady = true;
                
                // NOTE: For this mock app, we assume the user is 'Admin' after successful auth
                const currentUsername = DEFAULT_USERNAME;
                
                console.log(`Firebase Ready. User ID (volatile): ${userId}, App ID: ${appId}`);
                toggleAppScreen(true, currentUsername); // Switch to main app
                setupAssetsListener(); // Start listening to Firestore data

            } else {
                isAuthReady = false;
                userId = null;
                toggleAppScreen(false); // Switch back to login screen
                console.log("Người dùng đã bị ngắt kết nối.");
            }
            // Re-enable login button after auth check is complete
            document.getElementById('loginButton').disabled = false;
        });

    } catch (error) {
        console.error("Lỗi khởi tạo hoặc đăng nhập Firebase:", error);
        document.getElementById('auth-status').textContent = `Lỗi hệ thống: ${error.message}`;
        document.getElementById('loginButton').disabled = true;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // This check throws an error if local config is bad, stopping script execution (handled by outer logic)
    if (!finalConfig.apiKey || finalConfig.apiKey.includes('ĐIỀN')) {
        return; 
    }
    document.getElementById('login-screen').style.display = 'block';
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('auth-status').style.display = 'block';
    document.getElementById('auth-status').textContent = 'Đang tải Firebase...';
    
    initializeFirebase(); 
});


// ===================================================================
//  AI PREDICT – TÍNH TOÁN FEATURES & GỌI API
// ===================================================================
// ====== AI PREDICT HELPERS ======
    function computeFeaturesFromAsset(asset) {
        const parse = d => d ? new Date(d) : null;
        const now = new Date();
        const start = parse(asset.purchaseDate);
        const end = parse(asset.expiryDate);
        const last = parse(asset.lastMaintenance);

        const diff = (a,b) => Math.floor((a - b) / (1000*3600*24));

        return {
            asset_value: Number(asset.value || 0),
            usage_frequency: Number(asset.usageFrequency || 0),
            maintenance_count: Number(asset.maintenanceCount || 0),
            asset_age_months: start ? Math.floor(diff(now, start) / 30.4375) : 0,
            days_since_last_maint: last ? diff(now, last) : 0,
            days_left: end ? diff(end, now) : 0,
            asset_type: asset.type,
            start_date: asset.purchaseDate,
            end_date: asset.expiryDate,
            last_maintenance: asset.lastMaintenance,
            predict_date: now.toISOString().slice(0,10)
        };
    }

    async function callAIPredict(features) {
        const res = await fetch("http://127.0.0.1:8000/predict", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(features)
        });
        return await res.json(); // { prediction: "Tốt" }
    }

    async function savePredictionToDoc(docId, prediction) {
        const path = getAssetCollectionPath();
        await updateDoc(doc(db, path, docId), {
            predictedStatus: prediction
        });
    }

// ==============++++++++++++++++++++++++++++++++=====================

// [FIX] Cập nhật hàm này để sử dụng ADMIN_PERSISTENT_ID thay vì userId volatile.
function getAssetCollectionPath() {
    if (!db) {
        console.error("Lỗi: Firestore chưa sẵn sàng.");
        return null;
    }
    // Sử dụng ADMIN_PERSISTENT_ID cố định để đảm bảo dữ liệu không bị mất khi đăng xuất/đăng nhập lại
    // Path: /artifacts/{appId}/users/admin_data_store/assets
    const stableUid = ADMIN_PERSISTENT_ID; 
    return `artifacts/${appId}/users/${stableUid}/assets`;
}


// ===================================================================
//  LẮNG NGHE DỮ LIỆU FIRESTORE (REALTIME)
// ===================================================================
function setupAssetsListener() {
    if (!db) return;

    const path = getAssetCollectionPath();
    if (!path) return;

    const assetsCollection = collection(db, path);

    onSnapshot(query(assetsCollection), (snapshot) => {
        const tempAssets = [];
        let totalAssets = 0;
        const assetTypeCounts = { 'Giấy tờ': 0, 'Phần cứng': 0, 'Phần mềm': 0 };
        const predictionCounts = { tot: 0, canBaoTri: 0, hong: 0 };
        let maintenanceNeeded = 0;
        let expiringSoon = 0;

        snapshot.forEach(docSnap => {
            const data = docSnap.data();

            // Parse dates with parseDate (returns local-midnight Date or null)
            const purchaseDateObj = parseDate(data.purchaseDate);
            const expiryDateObj = parseDate(data.expiryDate);
            const lastMaintObj = parseDate(data.lastMaintenance);

            const asset = {
                id: docSnap.id,
                assetId: data.assetId || docSnap.id,
                name: data.name || '',
                type: data.type || 'Phần cứng',
                value: parseFloat(data.value || 0),
                purchaseDate: purchaseDateObj ? formatLocalDate(purchaseDateObj) : null,
                expiryDate: expiryDateObj ? formatLocalDate(expiryDateObj) : null,
                predictedStatus: mapStatusToThree(data.predictedStatus || 'Chưa dự đoán'),
                usageFrequency: parseInt(data.usageFrequency || 0),
                maintenanceCount: parseInt(data.maintenanceCount || 0),
                ageMonths: parseInt(data.ageMonths || 0),
                lastMaintenance: lastMaintObj ? formatLocalDate(lastMaintObj) : null,
                description: data.description || '',
                department: data.department || '',
                // keep raw dates for any calculation if needed
                _purchaseDateObj: purchaseDateObj,
                _expiryDateObj: expiryDateObj,
                _lastMaintObj: lastMaintObj
            };

            tempAssets.push(asset);
            totalAssets++;

            if (assetTypeCounts[asset.type] !== undefined) assetTypeCounts[asset.type]++;

            // Statistics by predictedStatus
            switch (asset.predictedStatus) {
                case 'Tốt': predictionCounts.tot++; break;
                case 'Cần bảo trì': predictionCounts.canBaoTri++; maintenanceNeeded++; break;
                case 'Hỏng': predictionCounts.hong++; break;
            }

            // Expiring soon calculation (INCLUSIVE: 0..30 days -> considered "soon")
            if (asset._expiryDateObj) {
                const today = new Date();
                // normalize to local midnight for safe difference
                const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                const diffTime = asset._expiryDateObj.getTime() - t.getTime();
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); // floor so same-day => 0

                if (diffDays >= 0 && diffDays <= 30) {
                    // If not Hỏng, count as expiringSoon. (Hỏng may already included separately)
                    if (asset.predictedStatus !== 'Hỏng') {
                        expiringSoon++;
                    }
                }
            }
        });

        // remove internal date objects before storing cache (optional)
        assetsCache = tempAssets.map(a => {
            const copy = { ...a };
            delete copy._purchaseDateObj; delete copy._expiryDateObj; delete copy._lastMaintObj;
            return copy;
        });

        console.log(`[Firestore]: Cập nhật ${assetsCache.length} Tài sản. (3 trạng thái)`);
        updateAssetView(assetsCache);

        updateStatsCards({
            totalAssets,
            maintenanceNeeded,
            expiringSoon,
            assetTypes: assetTypeCounts,
            predictionStatus: predictionCounts
        });

    }, (error) => {
        console.error("Lỗi khi lắng nghe Assets:", error);
        const tbody = document.getElementById('assetTableBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--danger-color);">Lỗi tải dữ liệu. Vui lòng kiểm tra console.</td></tr>';
    });
}

// ============================================================

// HÀM MỚI: Ánh xạ 4 trạng thái cũ sang 3 trạng thái mới
    function mapStatusToThree(status) {
    if (!status || status === "N/A" || status === "Chưa dự đoán") {
        return "Chưa dự đoán";
    }
    if (status.includes("Hỏng")) return "Hỏng";
    if (status.includes("Cần")) return "Cần bảo trì";
    return "Tốt";
}

// ===========================================================================

async function addNewAsset(assetData) {
    if (!db) return showStatusModal('Lỗi', 'Hệ thống chưa sẵn sàng hoặc chưa đăng nhập.', 'danger');

    const path = getAssetCollectionPath();
    if (!path) return;

    try {
        const newAsset = mapFormDataToAsset(assetData);

        // --- parse ngày an toàn bằng parseDate (hàm bạn đã có) ---
        const startDateObj = parseDate(newAsset.purchaseDate) || new Date();
        const endDateObj = parseDate(newAsset.expiryDate) || new Date(startDateObj.getTime() + 365*24*3600*1000); // fallback 1 năm
        const today = new Date();

        // kiểm tra hợp lệ
        const isValidStart = !isNaN(startDateObj.getTime());
        const isValidEnd = !isNaN(endDateObj.getTime());

        const ageMonths = isValidStart ? Math.floor((today - startDateObj) / (1000 * 3600 * 24 * 30.4375)) : 0;
        const daysLeft = isValidEnd ? Math.floor((endDateObj - today) / (1000 * 3600 * 24)) : 0;
        const daysSinceLast = newAsset.lastMaintenance ? (function() {
            const lm = parseDate(newAsset.lastMaintenance);
            return (lm && !isNaN(lm.getTime())) ? Math.floor((today - lm) / (1000 * 3600 * 24)) : 0;
        })() : 0;

        // chuẩn hóa kiểu asset_type nếu backend cần (đảm bảo string)
        const assetTypeForApi = typeof newAsset.type === 'string' ? newAsset.type : String(newAsset.type);

        const payload = {
            asset_value: newAsset.value || 0,
            usage_frequency: newAsset.usageFrequency || 0,
            maintenance_count: newAsset.maintenanceCount || 0,
            asset_age_months: ageMonths,
            days_since_last_maint: daysSinceLast,
            days_left: daysLeft,
            asset_type: assetTypeForApi,
            start_date: (isValidStart ? startDateObj.toISOString().slice(0,10) : null),
            end_date: (isValidEnd ? endDateObj.toISOString().slice(0,10) : null),
            last_maintenance: newAsset.lastMaintenance || null,
            predict_date: today.toISOString().slice(0,10)
        };

        const response = await fetch("http://127.0.0.1:8000/predict", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        // lưu kết quả prediction vào object trước khi push vào Firestore
        newAsset.predictedStatus = result.prediction || 'Chưa dự đoán';
        newAsset.createdAt = new Date().toISOString();

        // Lưu vào Firestore
        await addDoc(collection(db, path), newAsset);

        showStatusModal('Thành công', `Đã thêm tài sản và dự đoán AI: ${newAsset.predictedStatus}`, 'success');
        document.getElementById('addAssetForm').reset();

    } catch (e) {
        console.error("Lỗi khi thêm Tài sản: ", e);
        showStatusModal('Lỗi', `Thêm tài sản thất bại: ${e.message}`, 'danger');
    }
}



// ===========================================================================
// dự đoán lại toàn bộ tâì sản
async function runBatchPredict() {
    if (assetsCache.length === 0) {
        return showStatusModal("Lỗi", "Không có tài sản nào để dự đoán lại!", "warning");
    }

    showStatusModal("Đang xử lý", "Hệ thống đang dự đoán lại toàn bộ tài sản.", "warning");

    const path = getAssetCollectionPath();
    if (!path) return showStatusModal("Lỗi", "Không xác định được path lưu tài sản.", "danger");

    const promises = [];
    const MS_PER_DAY = 1000 * 60 * 60 * 24;

    for (const asset of assetsCache) {
        // ensure we can parse original stored strings (they were normalized in listener)
        const startDateObj = parseDate(asset.purchaseDate);
        let endDateObj = parseDate(asset.expiryDate);
        const lastMaintObj = parseDate(asset.lastMaintenance);

        const predictDateObj = new Date(); // predict_date = today (local midnight)
        const predictLocal = new Date(predictDateObj.getFullYear(), predictDateObj.getMonth(), predictDateObj.getDate());

        // If start invalid, fallback to predict date
        const isValidStart = startDateObj && !isNaN(startDateObj.getTime());
        const isValidEnd = endDateObj && !isNaN(endDateObj.getTime());

        // If expiry missing, **option A**: try to infer from start + default lifetime (e.g. 12 or 36 months).
        // Here ta sẽ fallback: nếu endDate missing, giả sử 12 tháng từ start (nếu start có) or 365 days from predict.
        if (!isValidEnd) {
            if (isValidStart) {
                // default lifetime 36 months for phần cứng? chọn 12 tháng là an toàn — em điều chỉnh theo nhu cầu
                const defaultMonths = 12; // <-- chỉnh nếu cần
                endDateObj = new Date(startDateObj.getFullYear(), startDateObj.getMonth() + defaultMonths, startDateObj.getDate());
            } else {
                // fallback generic 1 year from today
                endDateObj = new Date(predictLocal.getTime() + (365 * MS_PER_DAY));
            }
        }

        // recompute valids
        const validStart = isValidStart;
        const validEnd = endDateObj && !isNaN(endDateObj.getTime());

        // compute features exactly like single predict UI
        const ageMonths = validStart
            ? Math.floor((predictLocal.getTime() - startDateObj.getTime()) / (MS_PER_DAY * 30.4375))
            : 0;

        const daysLeft = validEnd
            ? Math.floor((endDateObj.getTime() - predictLocal.getTime()) / MS_PER_DAY)
            : null; // null indicates unknown; ML backend should handle

        let daysSinceLast = 0;
        if (lastMaintObj && !isNaN(lastMaintObj.getTime())) {
            daysSinceLast = Math.floor((predictLocal.getTime() - lastMaintObj.getTime()) / MS_PER_DAY);
        } else {
            daysSinceLast = null;
        }

        const payload = {
            asset_value: Number(asset.value) || 0,
            usage_frequency: Number(asset.usageFrequency) || 0,
            maintenance_count: Number(asset.maintenanceCount) || 0,
            asset_age_months: ageMonths,
            days_since_last_maint: daysSinceLast === null ? 0 : daysSinceLast,
            days_left: daysLeft === null ? 0 : daysLeft,
            asset_type: asset.type || String(asset.type),
            start_date: validStart ? formatLocalDate(startDateObj) : null,
            end_date: validEnd ? formatLocalDate(endDateObj) : null,
            last_maintenance: lastMaintObj ? formatLocalDate(lastMaintObj) : null,
            predict_date: formatLocalDate(predictLocal)
        };

        const task = fetch("http://127.0.0.1:8000/predict", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(async result => {
            const docRef = doc(db, path, asset.id);
            const newPred = result && result.prediction ? result.prediction : 'Chưa dự đoán';
            // Update Firestore document
            await updateDoc(docRef, { predictedStatus: newPred });
        })
        .catch(err => {
            console.error("Batch predict error for", asset.assetId, err);
        });

        promises.push(task);
    }

    await Promise.all(promises);

    // ensure UI re-render after update
    updateAssetView(assetsCache);

    showStatusModal("Thành công", "Tất cả tài sản đã được dự đoán lại bởi AI!", "success");
}


// ===========================================================================
async function updateExistingAsset(docId, assetData) {
    if (!db) return showStatusModal('Lỗi', 'Hệ thống chưa sẵn sàng hoặc chưa đăng nhập.', 'danger');
    
    const path = getAssetCollectionPath();
    if (!path) return;

    try {
        const updatedAsset = mapFormDataToAsset(assetData);
        
        const docRef = doc(db, path, docId);
        // Tạo một bản sao để xóa assetId, vì ta không muốn cập nhật nó
        const updatePayload = { ...updatedAsset };
        delete updatePayload.assetId; 
        
        await updateDoc(docRef, updatePayload);
        
        currentEditingDocId = null; 
        
        showStatusModal('Thành công', `Đã cập nhật Tài sản ${assetData.assetId} thành công!`, 'success');
        changeContent('asset-list-content');

    } catch (e) {
        console.error("Lỗi khi cập nhật Tài sản: ", e);
        showStatusModal('Lỗi', `Cập nhật tài sản thất bại: ${e.message}`, 'danger');
    }
}

// Đã điều chỉnh hàm deleteAsset để kiểm tra docId rõ ràng hơn
async function deleteAsset(docId) {
    if (!db) {
        console.error("Firebase not ready for delete.");
        return showStatusModal('Lỗi', 'Hệ thống chưa sẵn sàng hoặc chưa đăng nhập.', 'danger');
    }
    
    const path = getAssetCollectionPath();
    if (!path) return;

    if (!docId) {
        console.error("Attempted to delete asset with null docId or empty docId.");
        return showStatusModal('Lỗi', 'ID tài sản không hợp lệ.', 'danger');
    }

    console.log(`[Firestore DELETE]: Attempting to delete docId: ${docId} at path: ${path}/${docId}`);
    
    try {
        // Thực hiện xóa tài liệu
        await deleteDoc(doc(db, path, docId));
        showStatusModal('Thành công', `Đã xóa tài sản thành công!`, 'success');
    } catch (e) {
        console.error("Lỗi khi xóa Tài sản: ", e);
        // Kiểm tra lỗi quyền truy cập
        let errorMessage = e.message.includes('permission') 
                                        ? 'Lỗi: Thiếu quyền truy cập. Vui lòng kiểm tra Firebase Security Rules.' 
                                        : `Xóa tài sản thất bại: ${e.message}`;
        showStatusModal('Lỗi Xóa', errorMessage, 'danger');
    }
}

function mapFormDataToAsset(assetData) {
    const oldAsset = assetsCache.find(a => a.id === currentEditingDocId);
    // Giữ lại trạng thái dự đoán cũ (đã được ánh xạ 3 trạng thái)
    const predictedStatus = oldAsset ? oldAsset.predictedStatus : 'Chưa dự đoán'; 

    return {
        assetId: assetData.assetId,
        name: assetData.name,
        type: assetData.type,
        value: parseFloat(assetData.value) || 0,
        purchaseDate: assetData.purchaseDate,
        expiryDate: assetData.expiryDate || null,
        department: assetData.department,
        description: assetData.description,
        
        usageFrequency: parseInt(assetData.usageFrequency) || 0,
        maintenanceCount: parseInt(assetData.maintenanceCount) || 0,
        ageMonths: parseInt(assetData.ageMonths) || 0,
        lastMaintenance: assetData.lastMaintenance || null,
        
        predictedStatus: predictedStatus || 'Chưa dự đoán',
    };
}

// ------------------------------------------------

// ===================================================================
// 🛠️ UI/UX & MOCK FUNCTIONS
// ===================================================================

function updateStatsCards(data) {
    if (!data) return; 

    // ĐIỀU CHỈNH 3 TRẠNG THÁI: Tính toán tỷ lệ Tốt
    const totalPredicted = data.predictionStatus.tot + 
                                data.predictionStatus.canBaoTri +
                                data.predictionStatus.hong;

    const goodPredictionPercentage = data.totalAssets > 0 
        ? ((data.predictionStatus.tot / data.totalAssets) * 100).toFixed(0) 
        : 0;

    document.querySelector('.stats-cards .total p').textContent = data.totalAssets;
    document.querySelector('.stats-cards .warning p').textContent = data.maintenanceNeeded;
    // Sử dụng predictionCounts.hong cho Danger
    document.querySelector('.stats-cards .danger p').textContent = data.predictionStatus.hong;
    document.querySelector('.stats-cards .good p').textContent = `${goodPredictionPercentage}%`;
    
    // Luôn khởi tạo biểu đồ khi dữ liệu thống kê được cập nhật
    initializeCharts(data);
}


// ===================================================================
// 7. BIỂU ĐỒ DASHBOARD
// ===================================================================
function initializeCharts(data) {
    destroyCharts();

    const labelsType = ['Giấy tờ', 'Phần cứng', 'Phần mềm'];
    // ĐIỀU CHỈNH 3 TRẠNG THÁI: Chỉ còn 3 nhãn
    const labelsStatus = ['Tốt', 'Cần bảo trì', 'Hỏng']; 
    
    const assetTypeData = {
        labels: labelsType,
        datasets: [{
            label: 'Số lượng tài sản',
            data: [
                data.assetTypes['Giấy tờ'] || 0, 
                data.assetTypes['Phần cứng'] || 0, 
                data.assetTypes['Phần mềm'] || 0
            ], 
            backgroundColor: ['#007bff', '#28a745', '#ffc107'],
            hoverOffset: 4
        }]
    };
    assetTypeChartInstance = new Chart(document.getElementById('assetTypeChart'), { 
        type: 'doughnut', 
        data: assetTypeData, 
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { legend: { position: 'bottom' }, title: { display: false } } 
        } 
    });

    const predictionStatusData = {
        labels: labelsStatus,
        datasets: [{
            label: 'Số lượng Tài sản',
            // ĐIỀU CHỈNH 3 TRẠNG THÁI: Chỉ sử dụng 3 cột dữ liệu
            data: [
                data.predictionStatus.tot, 
                data.predictionStatus.canBaoTri, 
                data.predictionStatus.hong 
            ], 
            // Màu sắc tương ứng: Success, Warning, Danger
            backgroundColor: ['#28a745', '#ffc107', '#dc3545'], 
            borderRadius: 6
        }]
    };
    predictionStatusChartInstance = new Chart(document.getElementById('predictionStatusChart'), { 
        type: 'bar', 
        data: predictionStatusData, 
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { legend: { display: false }, title: { display: false } }, 
            scales: { y: { beginAtZero: true } } 
        } 
    });
}

function destroyCharts() {
    if (assetTypeChartInstance) {
        assetTypeChartInstance.destroy();
        assetTypeChartInstance = null;
    }
    if (predictionStatusChartInstance) {
        predictionStatusChartInstance.destroy();
        predictionStatusChartInstance = null;
    }
}


function initializeApp() {
    setupNavigation();
    setupImportExportEvents();
    handleAssetSubmission();

    // gán listeners ở đây (chỉ một lần)
    document.getElementById("filterType").addEventListener("change", (ev) => {
        currentFilterType = ev.target.value;
        currentPage = 1;
        updateAssetView(assetsCache);
    });
    document.getElementById("filterStatus").addEventListener("change", (ev) => {
        currentFilterStatus = ev.target.value;
        currentPage = 1;
        updateAssetView(assetsCache);
    });
    document.getElementById("searchInput").addEventListener("input", (ev) => {
        currentSearchTerm = ev.target.value.toLowerCase();
        currentPage = 1;
        updateAssetView(assetsCache);
    });
}


function changeContent(contentId) {
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.add('hidden');
        section.classList.remove('active');
    });

    const targetSection = document.getElementById(contentId);
    if (targetSection) {
        targetSection.classList.remove('hidden');
        targetSection.classList.add('active');
    }
    
    document.querySelectorAll('.nav li').forEach(li => li.classList.remove('active'));
    const targetMenuItem = document.querySelector(`[data-content-id="${contentId}"]`);
    if (targetMenuItem) {
        targetMenuItem.classList.add('active');
        
        let titleText = targetMenuItem.querySelector('a').textContent.trim();
        const badge = targetMenuItem.querySelector('.new-feature-badge');
        if (badge) {
            titleText = titleText.replace(badge.textContent, '').trim();
        }
        document.getElementById('main-title').textContent = titleText;
    }
    
    if (contentId === 'dashboard-content') {
        if (assetsCache.length > 0) {
            const dashboardData = calculateDashboardStats(assetsCache);
            updateStatsCards(dashboardData);

        } else if (isAuthReady) {
            updateStatsCards(calculateDashboardStats([]));
        }
    } else {
        // Khi chuyển sang tab khác, hủy các biểu đồ để tránh lỗi Chart.js
        destroyCharts();
    }
    
    if (contentId === 'add-asset-content') {
        if (!currentEditingDocId) {
            document.getElementById('addAssetForm').reset();
            document.getElementById('assetFormTitle').textContent = 'Thêm Tài sản Mới';
            document.getElementById('saveAssetButton').innerHTML = '<i class="fas fa-save"></i> Lưu Tài sản';
            document.getElementById('assetId').disabled = false;
        }
    } else if (contentId === 'asset-list-content') {
            // Re-render the asset view on tab switch to ensure current filters/page are respected
            updateAssetView(assetsCache); 
    } else if (contentId === 'ai-predict-content') {
            // Đặt ngày Dự đoán mặc định là ngày hôm nay khi mở form
            const today = new Date().toISOString().slice(0, 10);
            document.getElementById('ai_predict_date').value = today;
            document.getElementById('predictionResult').classList.add('hidden');
    } else if (contentId === 'user-management-content') {
        renderUserManagement();
        document.getElementById('addUserModal').classList.add('hidden');
    }
}

// Tính toán lại số liệu thống kê từ cache (3 trạng thái)
function calculateDashboardStats(assets) {
    let totalAssets = assets.length;
    const assetTypeCounts = { 'Giấy tờ': 0, 'Phần cứng': 0, 'Phần mềm': 0 };
    const predictionCounts = { tot: 0, canBaoTri: 0, hong: 0 };
    let maintenanceNeeded = 0;
    let expiringSoon = 0;

    assets.forEach(asset => {
        if (assetTypeCounts[asset.type] !== undefined) {
            assetTypeCounts[asset.type]++;
        }

        // Cập nhật thống kê dựa trên 3 trạng thái mới (đã được ánh xạ trong setupAssetsListener)
        switch (asset.predictedStatus) {
            case 'Tốt': predictionCounts.tot++; break;
            case 'Cần bảo trì': predictionCounts.canBaoTri++; maintenanceNeeded++; break;
            case 'Hỏng': predictionCounts.hong++; expiringSoon++; break;
        }

        if (asset.expiryDate) {
            const expiryDate = new Date(asset.expiryDate);
            const today = new Date();
            const diffTime = expiryDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            if (diffDays > 0 && diffDays <= 30) {
                    if (asset.predictedStatus !== 'Hỏng') {
                    expiringSoon++;
                    }
            }
        }
    });
    
    return {
        totalAssets, maintenanceNeeded, expiringSoon, 
        assetTypes: assetTypeCounts,
        predictionStatus: predictionCounts
    };
}



// ===================================================================
// 6. HIỂN THỊ DANH SÁCH / LỌC / PHÂN TRANG
// ===================================================================
function updateAssetView(assets) {
    // 1. Apply Filtering (Search and Type)
    let filteredAssets = assets.filter(asset => {
        const matchesSearch =
            asset.name.toLowerCase().includes(currentSearchTerm) ||
            asset.assetId.toLowerCase().includes(currentSearchTerm);

        const matchesType =
            currentFilterType === '' || asset.type === currentFilterType;

        const status = asset.predictedStatus ? asset.predictedStatus : "Chưa dự đoán";

        const matchesStatus =
            currentFilterStatus === '' ||
            (currentFilterStatus === "Chưa dự đoán" && status === "Chưa dự đoán") ||
            status === currentFilterStatus;

        return matchesSearch && matchesType && matchesStatus;
    });



    // Sort by assetId for deterministic display
    filteredAssets.sort((a, b) => a.assetId.localeCompare(b.assetId));

    // Reset currentPage if it's out of bounds after filtering
    const totalPages = Math.ceil(filteredAssets.length / assetsPerPage);
    if (currentPage > totalPages && totalPages > 0) {
        currentPage = totalPages;
    } else if (totalPages === 0) {
        currentPage = 1;
    }

    // 2. Apply Pagination (Slice)
    const startIndex = (currentPage - 1) * assetsPerPage;
    const endIndex = startIndex + assetsPerPage;
    const assetsToDisplay = filteredAssets.slice(startIndex, endIndex);

    // 3. Render Table and Pagination Controls
    renderAssetTable(assetsToDisplay, filteredAssets.length);
}

//=======================================================================================

function renderAssetTable(assetsToDisplay, totalFilteredAssets) {
    const tbody = document.getElementById('assetTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (assetsToDisplay.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--secondary-color);">Không tìm thấy tài sản nào phù hợp với điều kiện lọc/tìm kiếm.</td></tr>';
    } else {
        assetsToDisplay.forEach(asset => {
            
            // === XỬ LÝ TRẠNG THÁI ===
            const { badgeClass, statusText } = renderStatus(asset.predictedStatus);

            const assetValue = typeof asset.value === 'number'
                ? asset.value
                : parseFloat(asset.value || 0);

            const formattedValue = assetValue.toLocaleString('vi-VN');

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${asset.assetId}</td>
                <td>${asset.name}</td>
                <td>${asset.type}</td>
                <td>${formattedValue} VNĐ</td>
                <td>${asset.purchaseDate}</td>
                
                <td class="asset-status"><span class="status-badge ${badgeClass}">${statusText}</span></td>

                <td class="action-btns">
                    <button class="btn btn-primary" onclick="viewAssetDetails('${asset.id}')" title="Xem Chi tiết">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-secondary" onclick="editAsset('${asset.id}')" title="Chỉnh sửa">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger" onclick="confirmDelete('${asset.id}', '${asset.assetId}')" title="Xóa">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }
    
    // Update Pagination Controls
    const paginationDiv = document.querySelector('.pagination');
    paginationDiv.innerHTML = ''; // Clear existing content

    const totalPages = Math.ceil(totalFilteredAssets / assetsPerPage);
    const startItem = totalFilteredAssets > 0 ? (currentPage - 1) * assetsPerPage + 1 : 0;
    const endItem = Math.min(currentPage * assetsPerPage, totalFilteredAssets);

    const paginationSpan = document.createElement('span');
    paginationSpan.textContent = `Hiển thị ${startItem} - ${endItem} / ${totalFilteredAssets} tài sản`;
    paginationDiv.appendChild(paginationSpan);

    // Prev Button
    const prevBtn = document.createElement('button');
    prevBtn.innerHTML = '&laquo;';
    prevBtn.disabled = currentPage === 1 || totalPages === 0;
    prevBtn.onclick = () => changePage(-1);
    paginationDiv.appendChild(prevBtn);

    // Page Buttons
    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.textContent = i;
        pageBtn.className = i === currentPage ? 'active' : '';
        pageBtn.onclick = () => { if (i !== currentPage) { changePage(i - currentPage); } };
        paginationDiv.appendChild(pageBtn);
    }
    
    // Next Button
    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = '&raquo;';
    nextBtn.disabled = currentPage === totalPages || totalPages === 0;
    nextBtn.onclick = () => changePage(1);
    paginationDiv.appendChild(nextBtn);
}


//============================================================================
function renderStatus(status) {

    // Nếu không có trạng thái → hiển thị N/A
    if (!status || status === "N/A" || status === "Chưa dự đoán") {
        return {
            badgeClass: "inactive",
            statusText: "N/A"
        };
    }

    if (status === "Tốt") {
        return {
            badgeClass: "good",
            statusText: "Tốt"
        };
    }

    if (status === "Cần bảo trì") {
        return {
            badgeClass: "warning",
            statusText: "Cần bảo trì"
        };
    }

    if (status === "Hỏng") {
        return {
            badgeClass: "danger",
            statusText: "Hỏng"
        };
    }

    // Nếu gặp trạng thái lạ từ dữ liệu cũ
    return {
        badgeClass: "inactive",
        statusText: "N/A"
    };
}



// ==============================================================================
function changePage(pageOffset) {
    currentPage += pageOffset;
    updateAssetView(assetsCache); 
}

function handleSearchFilter() {
    currentSearchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    currentFilterType = document.getElementById('filterType').value;
    currentPage = 1; // Reset to first page on search/filter change
    updateAssetView(assetsCache);
}

function viewAssetDetails(docId) {
    const asset = assetsCache.find(a => a.id === docId);
    if (!asset) return showStatusModal('Lỗi', 'Không tìm thấy chi tiết tài sản.', 'danger');
    
    let badgeClass = '';
    // ĐIỀU CHỈNH 3 TRẠNG THÁI: Phân loại theo 3 trạng thái mới
    switch (asset.predictedStatus) {
        case 'Tốt': badgeClass = 'good'; break;
        case 'Cần bảo trì': badgeClass = 'warning'; break; 
        case 'Hỏng': badgeClass = 'danger'; break; 
        default: badgeClass = 'secondary';
    }
    
    const modalBody = document.getElementById('modalBody');
    const assetValue = typeof asset.value === 'number' ? asset.value : parseFloat(asset.value || 0);
    
    modalBody.innerHTML = `
        <div class="asset-detail-grid">
            <div class="detail-item"><strong>Mã tài sản:</strong> ${asset.assetId}</div>
            <div class="detail-item"><strong>Loại:</strong> ${asset.type}</div>
            <div class="detail-item"><strong>Giá trị:</strong> ${assetValue.toLocaleString('vi-VN')} VNĐ</div>
            <div class="detail-item"><strong>Ngày mua/Ký HĐ:</strong> ${asset.purchaseDate}</div>
            <div class="detail-item"><strong>Ngày hết hạn:</strong> ${asset.expiryDate || 'N/A'}</div>
            <div class="detail-item"><strong>Phòng ban:</strong> ${asset.department || 'N/A'}</div>

            <div class="detail-full-width">
                <h4>Tình trạng & Đặc trưng ML</h4>
            </div>
            
            <div class="detail-item">
                <strong>Trạng thái AI:</strong>
                <span class="modal-status-badge ${badgeClass} status-badge">${asset.predictedStatus}</span>
            </div>

            <div class="detail-item"><strong>Tần suất sử dụng:</strong> ${asset.usageFrequency} lần/tháng</div>
            <div class="detail-item"><strong>Số lần bảo trì:</strong> ${asset.maintenanceCount} lần</div>
            <div class="detail-item"><strong>Tuổi đời:</strong> ${asset.ageMonths} tháng</div>
            <div class="detail-item"><strong>Bảo trì gần nhất:</strong> ${asset.lastMaintenance || 'N/A'}</div>
            
            <div class="detail-full-width">
                <strong>Mô tả chi tiết:</strong> 
                <p style="margin-top: 5px;">${asset.description || 'Không có mô tả.'}</p>
            </div>
        </div>
    `;
    
    document.getElementById('modalTitle').textContent = `Chi tiết: ${asset.name}`;
    document.getElementById('modalConfirmButton').classList.add('hidden');
    document.getElementById('statusModal').classList.add('visible');
}

function editAsset(docId) {
    const assetToEdit = assetsCache.find(a => a.id === docId);
    
    if (!assetToEdit) {
        return showStatusModal('Lỗi', `Không tìm thấy tài sản với ID: ${docId}`, 'danger');
    }
    
    currentEditingDocId = docId; 
    changeContent('add-asset-content'); 
    
    document.getElementById('assetId').value = assetToEdit.assetId;
    document.getElementById('assetName').value = assetToEdit.name;
    document.getElementById('assetType').value = assetToEdit.type;
    document.getElementById('assetValue').value = assetToEdit.value;
    document.getElementById('purchaseDate').value = assetToEdit.purchaseDate;
    document.getElementById('expiryDate').value = assetToEdit.expiryDate || '';
    document.getElementById('department').value = assetToEdit.department;
    document.getElementById('description').value = assetToEdit.description;
    
    document.getElementById('usageFrequency').value = assetToEdit.usageFrequency;
    document.getElementById('maintenanceCount').value = assetToEdit.maintenanceCount;
    document.getElementById('ageMonths').value = assetToEdit.ageMonths;
    document.getElementById('lastMaintenance').value = assetToEdit.lastMaintenance || '';
    
    document.getElementById('assetFormTitle').textContent = `Chỉnh sửa Tài sản: ${assetToEdit.assetId}`;
    document.getElementById('saveAssetButton').innerHTML = '<i class="fas fa-save"></i> Cập nhật Tài sản';
    document.getElementById('assetId').disabled = true; 
}

function confirmDelete(docId, assetId) {
    // Đảm bảo docId được lưu chính xác trước khi mở modal
    modalTargetDocId = docId; 
    currentModalAction = 'delete';
    
    document.getElementById('modalTitle').textContent = 'Xác nhận Xóa';
    document.getElementById('modalBody').innerHTML = `<p>Bạn có chắc chắn muốn xóa tài sản **${assetId}** này khỏi hệ thống không? Hành động này không thể hoàn tác.</p>`;
    
    const confirmBtn = document.getElementById('modalConfirmButton');
    confirmBtn.classList.remove('hidden');
    confirmBtn.textContent = 'Xóa Vĩnh viễn';
    confirmBtn.className = 'btn btn-danger';
    
    document.getElementById('statusModal').classList.add('visible');
}

async function handleModalAction() {
    if (currentModalAction === 'delete') {
        // Đã đóng modal trong hàm deleteAsset để hiển thị thông báo thành công/lỗi rõ ràng hơn
        await deleteAsset(modalTargetDocId);
        // Reset modalTargetDocId sau khi action hoàn tất (thành công hoặc thất bại)
        modalTargetDocId = null; 
    } else {
        closeModal();
    }
}

function showStatusModal(title, message, type) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = `<p style="color: var(--${type}-color); font-weight: 600;">${message}</p>`;
    
    const confirmBtn = document.getElementById('modalConfirmButton');
    confirmBtn.classList.add('hidden');
    
    document.getElementById('statusModal').classList.add('visible');
    
    if (type === 'success' || type === 'danger' || type === 'warning') {
        // Tự động đóng modal sau 3 giây cho thông báo thành công/lỗi/cảnh báo
        setTimeout(closeModal, 3000);
    }
}

function closeModal() {
    document.getElementById('statusModal').classList.remove('visible');
    currentModalAction = null;
    modalTargetDocId = null;
}


function handleAssetSubmission() {
    const form = document.getElementById('addAssetForm');
    if (form) {
        form.onsubmit = function(e) {
            e.preventDefault();
            
            const assetData = {
                assetId: document.getElementById('assetId').value,
                name: document.getElementById('assetName').value,
                type: document.getElementById('assetType').value,
                value: document.getElementById('assetValue').value,
                purchaseDate: document.getElementById('purchaseDate').value,
                expiryDate: document.getElementById('expiryDate').value,
                department: document.getElementById('department').value,
                description: document.getElementById('description').value,
                usageFrequency: document.getElementById('usageFrequency').value,
                maintenanceCount: document.getElementById('maintenanceCount').value,
                ageMonths: document.getElementById('ageMonths').value,
                lastMaintenance: document.getElementById('lastMaintenance').value
            };
            
            if (currentEditingDocId) {
                updateExistingAsset(currentEditingDocId, assetData);
            } else {
                const isDuplicate = assetsCache.some(a => a.assetId === assetData.assetId);
                if (isDuplicate) {
                    return showStatusModal('Lỗi Trùng lặp', `Mã Tài sản "${assetData.assetId}" đã tồn tại. Vui lòng chọn mã khác.`, 'danger');
                }
                addNewAsset(assetData);
            }
        };
    }
}



// ===================================================================
// 8. IMPORT / EXPORT CSV, XLSX
// ===================================================================

function parseCSV(csvText) {
    // Using a simple regex to handle potential quoted values and commas, but focuses on the provided simple structure
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        // Simple split by comma for non-quoted fields, assuming no commas inside fields for this basic parser
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        if (values.length !== headers.length) continue; 

        // Map CSV fields to internal asset model (based on header order in the sample CSV)
        const asset = {};
        asset.assetId = values[0] || 'N/A';
        asset.name = values[1] || 'Chưa đặt tên';
        asset.type = values[2] || 'Phần cứng';
        asset.value = parseFloat(values[3].replace(/\./g, '')) || 0; // Handle VNĐ formatting if present
        asset.purchaseDate = values[4] || new Date().toISOString().slice(0, 10);
        asset.expiryDate = values[5] || null;
        asset.department = values[6] || 'Chung';
        asset.description = values[7] || '';
        asset.usageFrequency = parseInt(values[8]) || 0;
        asset.maintenanceCount = parseInt(values[9]) || 0;
        asset.ageMonths = parseInt(values[10]) || 0;
        asset.lastMaintenance = values[11] || null;
        
        // Add default status and creation date (Default status is "Chưa dự đoán")
        asset.predictedStatus = mapStatusToThree(values[12] || 'Chưa dự đoán');
        asset.createdAt = new Date().toISOString();

        data.push(asset);
    }
    return data;
}

async function handleImport(event) {
    event.preventDefault();
    const importType = document.getElementById('importType').value;
    const importFile = document.getElementById('importFile').files[0];

    if (!importFile) {
        return showStatusModal('Lỗi', "Vui lòng chọn một file để Import.", 'warning');
    }
    
    if (importType !== 'assets') {
        // Mock response for non-asset imports
        showStatusModal('Thông báo', `Đang Import ${importType}. (Mô phỏng: Tính năng Import Người dùng đang được phát triển)`, 'warning');
        document.getElementById('importForm').reset();
        document.getElementById('fileNameDisplay').textContent = "Kéo thả hoặc Nhấn để chọn file";
        return;
    }

    if (!importFile.name.toLowerCase().endsWith('.csv')) {
        return showStatusModal('Lỗi', "Hiện tại chỉ hỗ trợ Import file CSV cho Tài sản.", 'danger');
    }

    const path = getAssetCollectionPath();
    if (!path) return;

    const reader = new FileReader();
    
    reader.onload = async function(e) {
        const csvText = e.target.result;
        const importedAssets = parseCSV(csvText);
        
        if (importedAssets.length === 0) {
            return showStatusModal('Lỗi', "File CSV không chứa dữ liệu Tài sản hợp lệ hoặc không đúng định dạng.", 'danger');
        }

        let importSuccessCount = 0;
        let ignoredCount = 0;
        
        const writePromises = importedAssets.map(asset => {
            // Check for duplicate assetId before adding to avoid key conflicts
            const isDuplicate = assetsCache.some(a => a.assetId === asset.assetId);
            if (isDuplicate) {
                ignoredCount++;
                console.warn(`Bỏ qua tài sản trùng lặp: ${asset.assetId}`);
                return Promise.resolve(false);
            }
            return addDoc(collection(db, path), asset).then(() => {
                importSuccessCount++;
                return true;
            }).catch(err => {
                console.error(`Lỗi khi thêm TS ${asset.assetId} vào Firestore:`, err);
                return false;
            });
        });

        await Promise.all(writePromises);
        
        showStatusModal('Thành công', `Hoàn tất Import. Đã thêm thành công ${importSuccessCount} / ${importedAssets.length} tài sản. ${ignoredCount > 0 ? `(${ignoredCount} tài sản bị bỏ qua do trùng Mã TS)` : ''}`, 'success');
        // The onSnapshot listener handles refreshing the list automatically
    };

    reader.onerror = function() {
        showStatusModal('Lỗi', "Không thể đọc file đã chọn.", 'danger');
    };

    // Start reading the file
    showStatusModal('Thông báo', `Đang đọc và xử lý file CSV...`, 'warning');
    reader.readAsText(importFile);
    
    // Reset UI state for file input
    document.getElementById('importForm').reset();
    document.getElementById('fileNameDisplay').textContent = "Kéo thả hoặc Nhấn để chọn file";
}

// -------------------------------------------------------------------
// EXPORT LOGIC
// -------------------------------------------------------------------

function prepareExportData(sourceData, exportType) {
    let dataToExport = [];
    let fileName = 'export_data';
    let headers = [];

    if (exportType === 'current_assets' || exportType === 'all_assets') {
        // For Assets (using assetsCache for current assets for now)
        dataToExport = sourceData.map(asset => ({
            'Mã TS': asset.assetId,
            'Tên Tài sản': asset.name,
            'Loại': asset.type,
            'Giá trị (VNĐ)': asset.value,
            'Ngày mua/Ký HĐ': asset.purchaseDate,
            'Ngày hết hạn': asset.expiryDate,
            'Phòng ban': asset.department,
            'Mô tả': asset.description,
            'Tần suất SD (Lần/tháng)': asset.usageFrequency,
            'Số lần bảo trì (Năm)': asset.maintenanceCount,
            'Tuổi đời (Tháng)': asset.ageMonths,
            'Bảo trì gần nhất': asset.lastMaintenance,
            'Trạng thái AI (3 Trạng thái)': asset.predictedStatus
        }));
        fileName = (exportType === 'current_assets' ? 'danh_sach_tai_san' : 'lich_su_tai_san');
        
    } else if (exportType === 'users') {
        // For Mock Users
        dataToExport = mockUsers.map(user => ({
            'ID': user.id,
            'Tên người dùng': user.name,
            'Email': user.email,
            'Vai trò': user.role,
            'Trạng thái': user.status === 'Active' ? 'Hoạt động' : 'Khóa'
        }));
        fileName = 'danh_sach_nguoi_dung';
    }
    
    return { data: dataToExport, fileName: fileName };
}

function exportToCSV(exportData, fileName) {
    if (exportData.length === 0) {
        return showStatusModal('Lỗi Export', 'Không có dữ liệu để xuất.', 'warning');
    }
    // Thêm kiểm tra và sử dụng window.saveAs rõ ràng
    if (typeof window.saveAs === 'undefined') {
        return showStatusModal('Lỗi Export', 'Không tìm thấy thư viện FileSaver.js (saveAs). Vui lòng kiểm tra console.', 'danger');
    }

    // 1. Get Headers
    const headers = Object.keys(exportData[0]);
    
    // 2. Build CSV Content
    let csv = headers.join(',') + '\n';
    
    exportData.forEach(row => {
        const values = headers.map(header => {
            let value = row[header] === null || row[header] === undefined ? '' : row[header];
            // Escape commas and quotes for CSV format
            if (typeof value === 'string' && value.includes(',')) {
                value = `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        });
        csv += values.join(',') + '\n';
    });

    try {
        // 3. Create Blob and Download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        window.saveAs(blob, `${fileName}.csv`); // Sử dụng window.saveAs

        showStatusModal('Thành công', `Đã xuất dữ liệu thành công sang ${fileName}.csv.`, 'success');
    } catch (e) {
        console.error("Lỗi khi tạo và tải file CSV:", e);
        showStatusModal('Lỗi Export', `Tải file CSV thất bại: ${e.message}. Vui lòng kiểm tra console.`, 'danger');
    }
}

function exportToXLSX(exportData, fileName) {
    // [FIX] Kiểm tra và sử dụng window.XLSX rõ ràng
    if (typeof window.XLSX === 'undefined') {
        return showStatusModal('Lỗi Export', 'Không thể tìm thấy thư viện XLSX. Vui lòng tải lại trang.', 'danger');
    }
    if (exportData.length === 0) {
        return showStatusModal('Lỗi Export', 'Không có dữ liệu để xuất.', 'warning');
    }

    try {
        // 1. Create a worksheet from JSON data
        const ws = window.XLSX.utils.json_to_sheet(exportData);

        // 2. Create a workbook
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, "Dữ liệu Asset"); // Sử dụng window.XLSX

        // 3. Write and Download the file
        window.XLSX.writeFile(wb, `${fileName}.xlsx`); // Sử dụng window.XLSX

        showStatusModal('Thành công', `Đã xuất dữ liệu thành công sang ${fileName}.xlsx.`, 'success');
    } catch (e) {
            console.error("Lỗi khi tạo và tải file XLSX:", e);
            showStatusModal('Lỗi Export', `Tải file XLSX thất bại: ${e.message}. Vui lòng kiểm tra console.`, 'danger');
    }
}

function handleExport(format) {
    const exportType = document.getElementById('exportType').value;
    
    let sourceData = [];

    if (exportType === 'current_assets' || exportType === 'all_assets') {
        sourceData = assetsCache; // Always export current cache for simplicity (mocking historical data for 'all_assets')
    } else if (exportType === 'users') {
        sourceData = mockUsers;
    }
    
    if (sourceData.length === 0) {
        return showStatusModal('Lỗi', `Không có dữ liệu ${exportType} để xuất.`, 'warning');
    }

    const { data, fileName } = prepareExportData(sourceData, exportType);

    if (format === 'csv') {
        exportToCSV(data, fileName);
    } else if (format === 'xlsx') {
        exportToXLSX(data, fileName);
    } else {
        showStatusModal('Lỗi', 'Định dạng file không hợp lệ.', 'danger');
    }
}

// --- MOCK AI/USER FUNCTIONS ---

function setupNavigation() {
    document.querySelectorAll('.nav li').forEach(listItem => {
        const link = listItem.querySelector('a');
        if (link) {
            link.addEventListener('click', function(e) {
                e.preventDefault(); 
                const contentId = listItem.getAttribute('data-content-id');
                if (contentId) {
                    changeContent(contentId);
                }
            });
        }
    });
}

function setupImportExportEvents() {
    const importFile = document.getElementById('importFile');
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    
    if (importFile) {
        importFile.addEventListener('change', function() {
            if (this.files.length > 0) {
                fileNameDisplay.textContent = this.files[0].name;
            } else {
                fileNameDisplay.textContent = "Kéo thả hoặc Nhấn để chọn file";
            }
        });
    }
}


// ===================================================================
//  HÀM TIỆN ÍCH (DATE, FORMAT, MAPPING)
// ===================================================================
function parseDate(dateStr) {
    if (!dateStr) return null;

    // yyyy-mm-dd (ISO-like) but construct local date to avoid timezone shift
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Date(y, m - 1, d); // local midnight
    }

    // dd/mm/yyyy (VN)
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
        const [d, m, y] = dateStr.split('/').map(Number);
        return new Date(y, m - 1, d); // local midnight
    }

    // fallback: try Date constructor, but still normalize to local Y-M-D if possible
    const tmp = new Date(dateStr);
    if (!isNaN(tmp.getTime())) {
        // return same Date object (may include time)
        return new Date(tmp.getFullYear(), tmp.getMonth(), tmp.getDate());
    }
    return null;
}

function formatLocalDate(date) {
    if (!date || isNaN(date.getTime())) return null;
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`; // yyyy-mm-dd local
}



function diffInDays(a, b) {
    return Math.floor((a - b) / (1000 * 3600 * 24));
}

async function handleAIPredict(event) {
    event.preventDefault();

    const predictDate = parseDate(ai_predict_date.value);
    const startDate = parseDate(ai_start_date.value);
    const endDate = parseDate(ai_end_date.value);
    const lastMaint = parseDate(ai_lastMaintenance.value);

    const ageMonths = Math.floor((predictDate - startDate) / (1000 * 3600 * 24 * 30.4375));
    const daysLeft = diffInDays(endDate, predictDate);
    const daysSinceLast = diffInDays(predictDate, lastMaint);

    const payload = {
        asset_value: +ai_assetValue.value,
        usage_frequency: +ai_usageFrequency.value,
        maintenance_count: +ai_maintenanceCount.value,
        asset_age_months: ageMonths,
        days_since_last_maint: daysSinceLast,
        days_left: daysLeft,
        asset_type: ai_assetType.value,
        start_date: ai_start_date.value,
        end_date: ai_end_date.value,
        last_maintenance: ai_lastMaintenance.value,
        predict_date: ai_predict_date.value
    };

    console.log("Payload:", payload);

    const response = await fetch("http://127.0.0.1:8000/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const data = await response.json();

    // === HIỆN KẾT QUẢ TRÊN GIAO DIỆN ===
    const badge = document.getElementById("predictionBadge");
    const box = document.getElementById("predictionResult");

    badge.textContent = data.prediction;

    // reset class
    badge.className = "prediction-box";

    if (data.prediction === "Tốt") badge.classList.add("good");
    else if (data.prediction === "Cần bảo trì") badge.classList.add("warning");
    else badge.classList.add("danger");

    // hiện khung kết quả
    box.classList.remove("hidden");
}

// ===================================================

function savePredictionResult() {
    if (!lastPredictionResult) {
        return showStatusModal('Lỗi', "Vui lòng thực hiện dự đoán trước khi lưu.", 'warning');
    }
    
    showStatusModal('Thành công', `Đã lưu kết quả dự đoán "${lastPredictionResult}" vào MySQL! (Mô phỏng)`, 'success');
}

function handleRetrain() {
    const logOutput = document.getElementById('logOutput');
    const statusElement = document.getElementById('retrainStatus');
    const apiUrl = document.getElementById('apiUrlRetrain')?.value || "https://api.smartasset.com/retrain";

    logOutput.textContent = `[Hệ thống]: Bắt đầu kết nối đến API: ${apiUrl}\n`;
    statusElement.textContent = 'Đang huấn luyện...';
    statusElement.className = 'font-bold text-warning-color';

    const steps = [
        "Đang tải dữ liệu lịch sử (12,500 mẫu)...",
        "Tiền xử lý dữ liệu và chuẩn hóa features...",
        "Khởi tạo mô hình Machine Learning (Gradient Boosting)...",
        "Bắt đầu Training. Epoch 1/10...",
        "Epoch 5/10: Accuracy 85%...",
        "Epoch 10/10: Accuracy 92%. Đang tối ưu hóa...",
        "Đánh giá mô hình trên Validation Set: Loss 0.05.",
        "[Hệ thống]: Lưu mô hình mới thành công. Cập nhật Model Version: 2.1.",
    ];

    let stepIndex = 0;
    const interval = setInterval(() => {
        if (stepIndex < steps.length) {
            logOutput.textContent += `[${new Date().toLocaleTimeString()}]: ${steps[stepIndex]}\n`;
            logOutput.scrollTop = logOutput.scrollHeight; 
            stepIndex++;
        } else {
            clearInterval(interval);
            statusElement.textContent = 'Hoàn thành';
            statusElement.className = 'font-bold text-success-color';
            logOutput.textContent += `[Hệ thống]: Huấn luyện hoàn tất thành công! Sẵn sàng sử dụng.`;
        }
    }, 1000);
}


// ===================================================================
//  QUẢN LÝ NGƯỜI DÙNG (MOCK)
// ===================================================================
function renderUserManagement() {
    const tbody = document.getElementById('userTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    mockUsers.forEach(user => {
        const badgeClass = user.status === 'Active' ? 'good' : 'inactive';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${user.id}</td>
            <td>${user.name}</td>
            <td>${user.email}</td>
            <td>${user.role}</td>
            <td><span class="status-badge ${badgeClass}">${user.status === 'Active' ? 'Hoạt động' : 'Khóa'}</span></td>
            <td class="action-btns">
                <button class="btn btn-secondary" onclick="editUser('${user.id}')" title="Chỉnh sửa"><i class="fas fa-edit"></i></button>
                <button class="btn btn-danger" onclick="toggleUserStatus('${user.id}')" title="${user.status === 'Active' ? 'Khóa' : 'Mở khóa'}">
                    <i class="fas ${user.status === 'Active' ? 'fa-lock' : 'fa-unlock-alt'}"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function openAddUserModal() {
    document.getElementById('addUserModal').classList.remove('hidden');
    document.getElementById('addUserForm').reset();
}

function addUser(event) {
    event.preventDefault();
    
    const name = document.getElementById('userName').value;
    const email = document.getElementById('userEmail').value;
    const role = document.getElementById('userRole').value;
    
    const newId = mockUsers.length + 1;
    mockUsers.push({
        id: newId,
        name: name,
        email: email,
        role: role,
        status: 'Active'
    });

    document.getElementById('addUserModal').classList.add('hidden');
    renderUserManagement();
    showStatusModal('Thành công', `Đã thêm người dùng: ${name}`, 'success');
}

function editUser(id) {
    showStatusModal('Thông báo', `Tính năng Chỉnh sửa người dùng ID ${id} đang được phát triển.`, 'warning');
}

function toggleUserStatus(id) {
    const user = mockUsers.find(u => u.id == id);
    if (user) {
        user.status = user.status === 'Active' ? 'Inactive' : 'Active';
        renderUserManagement();
        const action = user.status === 'Active' ? 'Mở khóa' : 'Khóa';
        showStatusModal('Thành công', `${action} người dùng ${user.name} thành công.`, 'success');
    }
}

function handleSaveSettings(event) {
    event.preventDefault();
    
    const settings = {
        apiUrlPredict: document.getElementById('apiUrlPredict').value,
        apiUrlRetrain: document.getElementById('apiUrlRetrain').value,
        dbHost: document.getElementById('dbHost').value,
        dbName: document.getElementById('dbName').value,
        assetPerPage: document.getElementById('assetPerPage').value,
        warningThreshold: document.getElementById('warningThreshold').value,
    };
    
    // Update global state for assetsPerPage if needed
    assetsPerPage = parseInt(settings.assetPerPage) || 10;

    showStatusModal('Thành công', "Đã lưu cài đặt hệ thống thành công! (Mô phỏng)", 'success');
}


// xóa lọc
function resetFilters() {
    // 1) Reset biến logic
    currentFilterType = "";
    currentFilterStatus = "";
    currentSearchTerm = "";
    currentPage = 1;

    // 2) Reset UI controls robustly (chọn option đầu tiên)
    const ft = document.getElementById("filterType");
    const fs = document.getElementById("filterStatus");
    const si = document.getElementById("searchInput");

    if (ft) {
        ft.selectedIndex = 0; // an toàn ngay cả khi không có value = ""
        // phát event để listener xử lý thay đổi
        ft.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (fs) {
        fs.selectedIndex = 0;
        fs.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (si) {
        si.value = "";
        si.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // 3) Cập nhật lại view (dự phòng nếu listeners không có hoặc không chạy)
    updateAssetView(assetsCache);
}



// Expose global functions for HTML inline events
window.viewAssetDetails = viewAssetDetails;
window.editAsset = editAsset;
window.confirmDelete = confirmDelete;
window.changeContent = changeContent;
window.handleLogout = handleLogout;
window.handleModalAction = handleModalAction;
window.closeModal = closeModal;
window.openAddUserModal = openAddUserModal;
window.addUser = addUser;
window.editUser = editUser;
window.toggleUserStatus = toggleUserStatus;
window.handleImport = handleImport;
window.handleExport = handleExport;
window.handleAIPredict = handleAIPredict;
window.savePredictionResult = savePredictionResult;
window.handleRetrain = handleRetrain;
window.handleLogin = handleLogin;
window.runBatchPredict = runBatchPredict;
window.resetFilters = resetFilters;

