import { initializeApp as initApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, query } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ===================================================================
//  CẤU HÌNH FIREBASE & BIẾN TOÀN CỤC
// ===================================================================
setLogLevel('Debug');

let app, auth, db, userId;
let isAuthReady = false;

const isCanvasEnvironment = typeof __firebase_config !== 'undefined' && __firebase_config && Object.keys(JSON.parse(__firebase_config)).length > 0;
const canvasAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-smartasset-id';
const canvasFirebaseConfig = isCanvasEnvironment ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

const LOCAL_FIREBASE_CONFIG = {
    apiKey: "AIzaSyDb2frcXhbqW8HqkwTbGbwmlhv-P3E-Uic", 
    authDomain: "smartasset-daaf4.firebaseapp.com", 
    projectId: "smartasset-daaf4", 
    storageBucket: "smartasset-daaf4.firebasestorage.app", 
    messagingSenderId: "247174750637", 
    appId: "1:247174750637:web:8bc582fc44ceff2ca28124",
    measurementId: "G-ER8DZVZX9L"
};

const finalConfig = isCanvasEnvironment ? canvasFirebaseConfig : LOCAL_FIREBASE_CONFIG;
const appId = isCanvasEnvironment ? canvasAppId : LOCAL_FIREBASE_CONFIG.projectId || canvasAppId;

if (!finalConfig.apiKey || finalConfig.apiKey.includes('ĐIỀN')) {
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('auth-status').textContent = 'LỖI CẤU HÌNH: KHÓA API CHƯA ĐƯỢC ĐIỀN ĐẦY ĐỦ.';
        document.getElementById('auth-status').classList.remove('error-message');
        document.getElementById('auth-status').style.color = 'var(--danger-color)';
        document.getElementById('loginButton').disabled = true;
    });
    throw new Error("Missing Firebase Configuration."); 
}

const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = 'admin123';
const ADMIN_PERSISTENT_ID = 'admin_data_store';

let assetsCache = [];
let currentEditingDocId = null;
let currentModalAction = null;
let modalTargetDocId = null; 
let assetTypeChartInstance = null;
let predictionStatusChartInstance = null;
let lastPredictionResult = null;

let assetsPerPage = 10;
let currentPage = 1;
let currentSearchTerm = '';
let currentFilterType = '';
let currentFilterStatus = '';

// DỮ LIỆU NHÂN SỰ ĐỒNG BỘ FIRESTORE REALTIME
let personnelCache = [];
let currentEditingPersonnelId = null;

// BIẾN QUẢN LÝ QUYỀN PHIÊN ĐĂNG NHẬP HIỆN TẠI
let currentUserSession = {
    username: '',
    role: '', 
    isAdmin: false
};

// ===================================================================
// ĐĂNG NHẬP / KHỞI TẠO HỆ THỐNG / PHÂN QUYỀN GIAO DIỆN
// ===================================================================
function toggleAppScreen(isAuthenticated, username = '', role = 'Quản trị viên') {
    const loginScreen = document.getElementById('login-screen');
    const appContainer = document.getElementById('app-container');
    
    if (isAuthenticated) {
        loginScreen.style.display = 'none';
        appContainer.style.display = 'flex';
        
        currentUserSession.username = username;
        currentUserSession.role = role;
        currentUserSession.isAdmin = (username === DEFAULT_USERNAME || role === 'Quản trị viên');

        document.getElementById('current-username').textContent = username;
        const roleElement = document.getElementById('current-user-role');
        if (roleElement) roleElement.textContent = role;

        applyRoleBasedUIPolicy();

        document.getElementById('auth-status').style.display = 'none';
        initializeApp(); 
    } else {
        loginScreen.style.display = 'block';
        appContainer.style.display = 'none';
        document.getElementById('auth-status').style.display = 'block';
        document.getElementById('auth-status').textContent = 'Vui lòng đăng nhập';
        destroyCharts(); 
    }
}

function applyRoleBasedUIPolicy() {
    const adminElements = document.querySelectorAll('.admin-only-nav, .admin-only-item');
    adminElements.forEach(el => {
        if (currentUserSession.isAdmin) {
            el.style.display = ''; 
        } else {
            el.style.display = 'none'; 
        }
    });

    const profileIcon = document.getElementById('profile-icon');
    if (profileIcon) {
        profileIcon.className = currentUserSession.isAdmin ? 'fas fa-user-shield' : 'fas fa-user';
    }
}

async function handleLogin(event) {
    event.preventDefault();
    const usernameInput = document.getElementById('username').value.trim();
    const passwordInput = document.getElementById('password').value.trim();
    const statusElement = document.getElementById('auth-status');
    
    statusElement.style.display = 'block';
    statusElement.textContent = 'Đang xác thực...';

    // 1. Kiểm tra tài khoản Admin mặc định
    if (usernameInput === DEFAULT_USERNAME && passwordInput === DEFAULT_PASSWORD) {
        console.log("Xác thực thành công với tài khoản Admin!");
        await authenticateFirebaseAndEnter(DEFAULT_USERNAME, 'Quản trị viên');
        return;
    }

    // 2. Kiểm tra danh sách Nhân sự trên Firestore Realtime
    const foundPersonnel = personnelCache.find(p => (p.email === usernameInput || p.personnelId === usernameInput) && p.status === 'Hoạt động');
    if (foundPersonnel) {
        const storedPassword = foundPersonnel.password || 'SmartAsset@2026';
        if (passwordInput === storedPassword) {
            console.log(`Xác thực thành công với tài khoản Nhân viên: ${foundPersonnel.name}`);
            await authenticateFirebaseAndEnter(foundPersonnel.name, foundPersonnel.role);
            return;
        }
    }

    statusElement.textContent = 'Lỗi: Tên đăng nhập, mật khẩu không đúng hoặc tài khoản bị khóa.';
    const btn = document.getElementById('loginButton');
    if (btn) btn.disabled = false;
}

async function authenticateFirebaseAndEnter(username, role) {
    if (!app) {
        app = initApp(finalConfig);
        auth = getAuth(app);
        db = getFirestore(app);
    }
    
    try {
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }
        toggleAppScreen(true, username, role);
    } catch (error) {
        console.error("Lỗi đăng nhập Firebase:", error);
        document.getElementById('auth-status').textContent = `Lỗi kết nối Firebase: ${error.message}`;
        const btn = document.getElementById('loginButton');
        if (btn) btn.disabled = false;
    }
}

function handleLogout(event) {
    event.preventDefault();
    if (auth) {
        signOut(auth).catch((error) => {
            console.error("Lỗi khi đăng xuất Firebase:", error);
            showStatusModal('Lỗi Đăng xuất', `Đăng xuất thất bại: ${error.message}`, 'danger');
        });
    } else {
        toggleAppScreen(false);
    }
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('auth-status').textContent = 'Đã đăng xuất.';
    const btn = document.getElementById('loginButton');
    if (btn) btn.disabled = false;
}

async function initializeFirebase() {
    try {
        if (!app) {
            app = initApp(finalConfig);
            auth = getAuth(app);
            db = getFirestore(app);
        }
        
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }

        onAuthStateChanged(auth, (user) => {
            if (user) {
                userId = user.uid; 
                isAuthReady = true;
                console.log(`Firebase Ready. User ID (volatile): ${userId}, App ID: ${appId}`);
                setupAssetsListener(); 
                setupPersonnelListener(); 
            } else {
                isAuthReady = false;
                userId = null;
                toggleAppScreen(false); 
                console.log("Người dùng đã bị ngắt kết nối.");
            }
            const btn = document.getElementById('loginButton');
            if (btn) btn.disabled = false;
        });
    } catch (error) {
        console.error("Lỗi khởi tạo hoặc đăng nhập Firebase:", error);
        document.getElementById('auth-status').textContent = `Lỗi hệ thống: ${error.message}`;
        const btn = document.getElementById('loginButton');
        if (btn) btn.disabled = true;
    }
}

document.addEventListener('DOMContentLoaded', () => {
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
    return await res.json();
}

async function savePredictionToDoc(docId, prediction) {
    const path = getAssetCollectionPath();
    await updateDoc(doc(db, path, docId), {
        predictedStatus: prediction
    });
}

function getAssetCollectionPath() {
    if (!db) {
        console.error("Lỗi: Firestore chưa sẵn sàng.");
        return null;
    }
    return `artifacts/${appId}/users/${ADMIN_PERSISTENT_ID}/assets`;
}

function getPersonnelCollectionPath() {
    if (!db) return null;
    return `artifacts/${appId}/users/${ADMIN_PERSISTENT_ID}/personnel`;
}

// ===================================================================
//  LẮNG NGHE DỮ LIỆU FIRESTORE (REALTIME TÀI SẢN & NHÂN SỰ)
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
                _purchaseDateObj: purchaseDateObj,
                _expiryDateObj: expiryDateObj,
                _lastMaintObj: lastMaintObj
            };

            tempAssets.push(asset);
            totalAssets++;

            if (assetTypeCounts[asset.type] !== undefined) assetTypeCounts[asset.type]++;

            switch (asset.predictedStatus) {
                case 'Tốt': predictionCounts.tot++; break;
                case 'Cần bảo trì': predictionCounts.canBaoTri++; maintenanceNeeded++; break;
                case 'Hỏng': predictionCounts.hong++; break;
            }

            if (asset._expiryDateObj) {
                const today = new Date();
                const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                const diffTime = asset._expiryDateObj.getTime() - t.getTime();
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays >= 0 && diffDays <= 30) {
                    if (asset.predictedStatus !== 'Hỏng') {
                        expiringSoon++;
                    }
                }
            }
        });

        assetsCache = tempAssets.map(a => {
            const copy = { ...a };
            delete copy._purchaseDateObj; delete copy._expiryDateObj; delete copy._lastMaintObj;
            return copy;
        });

        updateAssetView(assetsCache);

        const maintenanceTab = document.getElementById('maintenance-alert-content');
        if (maintenanceTab && maintenanceTab.classList.contains('active')) {
            loadExpiredAssets();
        }

        updateStatsCards({
            totalAssets,
            maintenanceNeeded,
            expiringSoon,
            assetTypes: assetTypeCounts,
            predictionStatus: predictionCounts
        });

    }, (error) => {
        console.error("Lỗi khi lắng nghe Assets:", error);
    });
}

function setupPersonnelListener() {
    if (!db) return;
    const path = getPersonnelCollectionPath();
    if (!path) return;

    onSnapshot(query(collection(db, path)), async (snapshot) => {
        const tempPersonnel = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            tempPersonnel.push({
                id: docSnap.id,
                personnelId: data.personnelId || docSnap.id,
                name: data.name || '',
                email: data.email || '',
                role: data.role || 'Nhân viên',
                status: data.status || 'Hoạt động',
                department: data.department || '',
                password: data.password || 'SmartAsset@2026'
            });
        });

        if (tempPersonnel.length === 0) {
            await initDefaultPersonnel(path);
        } else {
            personnelCache = tempPersonnel;
            renderUserManagement();
            populatePersonnelDropdown();
        }
    }, (error) => {
        console.error("Lỗi lắng nghe nhân sự:", error);
    });
}

async function initDefaultPersonnel(path) {
    const defaultList = [
        { personnelId: 'NS001', name: 'Nguyễn Văn A', email: 'vana@smartasset.com', role: 'Quản trị viên', status: 'Hoạt động', department: 'IT', password: 'admin123' },
        { personnelId: 'NS002', name: 'Trần Thị B', email: 'thib@smartasset.com', role: 'Kỹ thuật viên', status: 'Hoạt động', department: 'Bảo trì', password: 'SmartAsset@2026' },
        { personnelId: 'NS003', name: 'Lê Văn C', email: 'vanc@smartasset.com', role: 'Nhân viên', status: 'Khóa', department: 'Hành chính', password: 'SmartAsset@2026' }
    ];
    for (const p of defaultList) {
        await addDoc(collection(db, path), p);
    }
}

function mapStatusToThree(status) {
    if (!status || status === "N/A" || status === "Chưa dự đoán") {
        return "Chưa dự đoán";
    }
    if (status.includes("Hỏng")) return "Hỏng";
    if (status.includes("Cần")) return "Cần bảo trì";
    if (status.includes("Đang bảo trì")) return "Đang bảo trì";
    return "Tốt";
}

async function addNewAsset(assetData) {
    if (!db) return showStatusModal('Lỗi', 'Hệ thống chưa sẵn sàng hoặc chưa đăng nhập.', 'danger');
    const path = getAssetCollectionPath();
    if (!path) return;

    try {
        const newAsset = mapFormDataToAsset(assetData);
        const startDateObj = parseDate(newAsset.purchaseDate) || new Date();
        const endDateObj = parseDate(newAsset.expiryDate) || new Date(startDateObj.getTime() + 365*24*3600*1000); 
        const today = new Date();

        const isValidStart = !isNaN(startDateObj.getTime());
        const isValidEnd = !isNaN(endDateObj.getTime());

        const ageMonths = isValidStart ? Math.floor((today - startDateObj) / (1000 * 3600 * 24 * 30.4375)) : 0;
        const daysLeft = isValidEnd ? Math.floor((endDateObj - today) / (1000 * 3600 * 24)) : 0;
        const daysSinceLast = newAsset.lastMaintenance ? (function() {
            const lm = parseDate(newAsset.lastMaintenance);
            return (lm && !isNaN(lm.getTime())) ? Math.floor((today - lm) / (1000 * 3600 * 24)) : 0;
        })() : 0;

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
        newAsset.predictedStatus = result.prediction || 'Chưa dự đoán';
        newAsset.createdAt = new Date().toISOString();

        await addDoc(collection(db, path), newAsset);
        showStatusModal('Thành công', `Đã thêm tài sản và dự đoán AI: ${newAsset.predictedStatus}`, 'success');
        document.getElementById('addAssetForm').reset();
    } catch (e) {
        console.error("Lỗi khi thêm Tài sản: ", e);
        showStatusModal('Lỗi', `Thêm tài sản thất bại: ${e.message}`, 'danger');
    }
}

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
        if (asset.predictedStatus === "Đang bảo trì") continue;

        const startDateObj = parseDate(asset.purchaseDate);
        let endDateObj = parseDate(asset.expiryDate);
        const lastMaintObj = parseDate(asset.lastMaintenance);
        const predictDateObj = new Date(); 
        const predictLocal = new Date(predictDateObj.getFullYear(), predictDateObj.getMonth(), predictDateObj.getDate());

        const isValidStart = startDateObj && !isNaN(startDateObj.getTime());
        const isValidEnd = endDateObj && !isNaN(endDateObj.getTime());

        if (!isValidEnd) {
            if (isValidStart) {
                const defaultMonths = 12; 
                endDateObj = new Date(startDateObj.getFullYear(), startDateObj.getMonth() + defaultMonths, startDateObj.getDate());
            } else {
                endDateObj = new Date(predictLocal.getTime() + (365 * MS_PER_DAY));
            }
        }

        const validStart = isValidStart;
        const validEnd = endDateObj && !isNaN(endDateObj.getTime());

        const ageMonths = validStart ? Math.floor((predictLocal.getTime() - startDateObj.getTime()) / (MS_PER_DAY * 30.4375)) : 0;
        const daysLeft = validEnd ? Math.floor((endDateObj.getTime() - predictLocal.getTime()) / MS_PER_DAY) : null;

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
            await updateDoc(docRef, { predictedStatus: newPred });
        })
        .catch(err => {
            console.error("Batch predict error for", asset.assetId, err);
        });

        promises.push(task);
    }

    await Promise.all(promises);
    updateAssetView(assetsCache);
    showStatusModal("Thành công", "Tất cả tài sản đã được dự đoán lại bởi AI!", "success");
}

async function updateExistingAsset(docId, assetData) {
    if (!db) return showStatusModal('Lỗi', 'Hệ thống chưa sẵn sàng hoặc chưa đăng nhập.', 'danger');
    const path = getAssetCollectionPath();
    if (!path) return;

    try {
        const updatedAsset = mapFormDataToAsset(assetData);
        const docRef = doc(db, path, docId);
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

async function deleteAsset(docId) {
    if (!db) {
        console.error("Firebase not ready for delete.");
        return showStatusModal('Lỗi', 'Hệ thống chưa sẵn sàng hoặc chưa đăng nhập.', 'danger');
    }
    const path = getAssetCollectionPath();
    if (!path) return;
    if (!docId) return showStatusModal('Lỗi', 'ID tài sản không hợp lệ.', 'danger');

    try {
        await deleteDoc(doc(db, path, docId));
        showStatusModal('Thành công', `Đã xóa tài sản thành công!`, 'success');
    } catch (e) {
        console.error("Lỗi khi xóa Tài sản: ", e);
        let errorMessage = e.message.includes('permission') ? 'Lỗi: Thiếu quyền.' : `Xóa tài sản thất bại: ${e.message}`;
        showStatusModal('Lỗi Xóa', errorMessage, 'danger');
    }
}

function mapFormDataToAsset(assetData) {
    const oldAsset = assetsCache.find(a => a.id === currentEditingDocId);
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

// ===================================================================
// 🛠️ UI/UX & MOCK FUNCTIONS
// ===================================================================
function updateStatsCards(data) {
    if (!data) return; 
    const goodPredictionPercentage = data.totalAssets > 0 ? ((data.predictionStatus.tot / data.totalAssets) * 100).toFixed(0) : 0;

    document.querySelector('.stats-cards .total p').textContent = data.totalAssets;
    document.querySelector('.stats-cards .warning p').textContent = data.maintenanceNeeded;
    document.querySelector('.stats-cards .danger p').textContent = data.predictionStatus.hong;
    document.querySelector('.stats-cards .good p').textContent = `${goodPredictionPercentage}%`;
    
    initializeCharts(data);
}

// ===================================================================
// BIỂU ĐỒ DASHBOARD
// ===================================================================
function initializeCharts(data) {
    destroyCharts();
    const labelsType = ['Giấy tờ', 'Phần cứng', 'Phần mềm'];
    const labelsStatus = ['Tốt', 'Cần bảo trì', 'Hỏng']; 
    
    const assetTypeData = {
        labels: labelsType,
        datasets: [{
            label: 'Số lượng tài sản',
            data: [data.assetTypes['Giấy tờ'] || 0, data.assetTypes['Phần cứng'] || 0, data.assetTypes['Phần mềm'] || 0], 
            backgroundColor: ['#007bff', '#28a745', '#ffc107'],
            hoverOffset: 4
        }]
    };
    const el1 = document.getElementById('assetTypeChart');
    if (el1) {
        assetTypeChartInstance = new Chart(el1, { 
            type: 'doughnut', 
            data: assetTypeData, 
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } 
        });
    }

    const predictionStatusData = {
        labels: labelsStatus,
        datasets: [{
            label: 'Số lượng Tài sản',
            data: [data.predictionStatus.tot, data.predictionStatus.canBaoTri, data.predictionStatus.hong], 
            backgroundColor: ['#28a745', '#ffc107', '#dc3545'], 
            borderRadius: 6
        }]
    };
    const el2 = document.getElementById('predictionStatusChart');
    if (el2) {
        predictionStatusChartInstance = new Chart(el2, { 
            type: 'bar', 
            data: predictionStatusData, 
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } 
        });
    }
}

function destroyCharts() {
    if (assetTypeChartInstance) { assetTypeChartInstance.destroy(); assetTypeChartInstance = null; }
    if (predictionStatusChartInstance) { predictionStatusChartInstance.destroy(); predictionStatusChartInstance = null; }
}

function initializeApp() {
    setupNavigation();
    setupImportExportEvents();
    handleAssetSubmission();

    const ft = document.getElementById("filterType");
    if (ft) ft.addEventListener("change", (ev) => { currentFilterType = ev.target.value; currentPage = 1; updateAssetView(assetsCache); });

    const fs = document.getElementById("filterStatus");
    if (fs) fs.addEventListener("change", (ev) => { currentFilterStatus = ev.target.value; currentPage = 1; updateAssetView(assetsCache); });

    const si = document.getElementById("searchInput");
    if (si) si.addEventListener("input", (ev) => { currentSearchTerm = ev.target.value.toLowerCase(); currentPage = 1; updateAssetView(assetsCache); });
}

function changeContent(contentId) {
    // Chặn nhân viên truy cập các tab Quản lý Nhân sự, Mô hình ML/AI, Cài đặt
    if (!currentUserSession.isAdmin) {
        const restrictedTabs = ['user-management-content', 'ai-predict-content', 'ai-retrain-content', 'settings-content'];
        if (restrictedTabs.includes(contentId)) {
            return showStatusModal('Hạn chế quyền', 'Chỉ tài khoản Quản trị viên mới được truy cập chức năng này!', 'warning');
        }
    }

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
        
        if (contentId === 'maintenance-alert-content') {
            document.getElementById('main-title').textContent = 'Điều Phối Bảo Trì';
        } else if (contentId === 'user-management-content') {
            document.getElementById('main-title').textContent = 'Quản lý Nhân sự';
        } else {
            let titleText = targetMenuItem.querySelector('a').textContent.trim();
            const badge = targetMenuItem.querySelector('.new-feature-badge');
            if (badge) titleText = titleText.replace(badge.textContent, '').trim();
            document.getElementById('main-title').textContent = titleText;
        }
    }
    
    if (contentId === 'dashboard-content') {
        if (assetsCache.length > 0) {
            updateStatsCards(calculateDashboardStats(assetsCache));
        } else if (isAuthReady) {
            updateStatsCards(calculateDashboardStats([]));
        }
    } else {
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
        updateAssetView(assetsCache); 
    } else if (contentId === 'ai-predict-content') {
        const pd = document.getElementById('ai_predict_date');
        if (pd) pd.value = new Date().toISOString().slice(0, 10);
        const pr = document.getElementById('predictionResult');
        if (pr) pr.classList.add('hidden');
    } else if (contentId === 'user-management-content') {
        renderUserManagement();
    } else if (contentId === 'maintenance-alert-content') {
        loadExpiredAssets();
    }
}

function calculateDashboardStats(assets) {
    let totalAssets = assets.length;
    const assetTypeCounts = { 'Giấy tờ': 0, 'Phần cứng': 0, 'Phần mềm': 0 };
    const predictionCounts = { tot: 0, canBaoTri: 0, hong: 0 };
    let maintenanceNeeded = 0;
    let expiringSoon = 0;

    assets.forEach(asset => {
        if (assetTypeCounts[asset.type] !== undefined) assetTypeCounts[asset.type]++;
        switch (asset.predictedStatus) {
            case 'Tốt': predictionCounts.tot++; break;
            case 'Cần bảo trì': predictionCounts.canBaoTri++; maintenanceNeeded++; break;
            case 'Hỏng': predictionCounts.hong++; break;
        }
        if (asset.expiryDate) {
            const diffDays = Math.ceil((new Date(asset.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)); 
            if (diffDays > 0 && diffDays <= 30 && asset.predictedStatus !== 'Hỏng') expiringSoon++;
        }
    });
    
    return { totalAssets, maintenanceNeeded, expiringSoon, assetTypes: assetTypeCounts, predictionStatus: predictionCounts };
}

// ===================================================================
// LOGIC CHỨC NĂNG: ĐIỀU PHỐI BẢO TRÌ & GỢI Ý DATALIST NHÂN SỰ
// ===================================================================
function populatePersonnelDropdown() {
    const datalist = document.getElementById('personnel-email-list');
    if (!datalist) return;

    datalist.innerHTML = '';

    personnelCache.forEach(p => {
        if (p.status === 'Hoạt động') {
            const opt = document.createElement('option');
            opt.value = p.email;
            opt.textContent = `${p.name} - ${p.role} (${p.department || 'Chung'})`;
            datalist.appendChild(opt);
        }
    });
}

function loadExpiredAssets() {
    populatePersonnelDropdown(); 

    const tbodyExpired = document.getElementById('expired-assets-tbody');
    const tbodyMaintenance = document.getElementById('under-maintenance-tbody');
    
    if (tbodyExpired) tbodyExpired.innerHTML = '';
    if (tbodyMaintenance) tbodyMaintenance.innerHTML = '';

    const expiredAssets = assetsCache.filter(a => a.predictedStatus === "Hỏng" || a.predictedStatus === "Cần bảo trì");
    if (tbodyExpired) {
        if (expiredAssets.length === 0) {
            tbodyExpired.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--success-color); padding: 12px;">Tuyệt vời! Không có tài sản nào chờ điều phối phân công.</td></tr>';
        } else {
            expiredAssets.forEach(asset => {
                const row = document.createElement('tr');
                row.id = `m-row-${asset.id}`;
                const statusBadgeClass = asset.predictedStatus === "Hỏng" ? "danger" : "warning";
                row.innerHTML = `
                    <td style="color: var(--primary-color); font-weight: bold;">${asset.assetId}</td>
                    <td>${asset.name}</td>
                    <td>${asset.type}</td>
                    <td><span class="status-badge ${statusBadgeClass}">${asset.predictedStatus}</span></td>
                    <td>
                        <button class="btn btn-primary" style="padding: 5px 10px; font-size: 0.85em;" onclick="selectAssetToAssign('${asset.id}', '${asset.name}')">
                            <i class="fas fa-user-plus"></i> Chọn
                        </button>
                    </td>
                `;
                tbodyExpired.appendChild(row);
            });
        }
    }

    const maintenanceAssets = assetsCache.filter(a => a.predictedStatus === "Đang bảo trì");
    if (tbodyMaintenance) {
        if (maintenanceAssets.length === 0) {
            tbodyMaintenance.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--secondary-color); padding: 12px;">Hiện tại không có thiết bị nào đang sửa chữa.</td></tr>';
        } else {
            maintenanceAssets.forEach(asset => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td style="color: var(--primary-color); font-weight: bold;">${asset.assetId}</td>
                    <td>${asset.name}</td>
                    <td>${asset.type}</td>
                    <td><span class="status-badge info">Đang bảo trì</span></td>
                    <td>
                        <button class="btn btn-success" style="padding: 5px 10px; font-size: 0.85em; background: #10b981; border-color: #10b981;" onclick="completeMaintenance('${asset.id}', '${asset.assetId}')">
                            <i class="fas fa-check"></i> Hoàn tất Check 
                        </button>
                    </td>
                `;
                tbodyMaintenance.appendChild(row);
            });
        }
    }
}

window.selectAssetToAssign = function(id, name) {
    document.getElementById('assign-asset-id').value = id;
    document.getElementById('assign-asset-name').value = name;
    document.getElementById('assign-asset-display').value = `[${id}] - ${name}`;
    document.getElementById('btn-submit-assignment').disabled = false;
    document.getElementById('assign-tech-email').focus();
};

window.executeAssignTask = async function() {
    const id = document.getElementById('assign-asset-id').value;
    const name = document.getElementById('assign-asset-name').value;
    const email = document.getElementById('assign-tech-email').value.trim();
    const note = document.getElementById('assign-note').value.trim();
    const statusMsg = document.getElementById('assign-status-message');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        statusMsg.style.display = "block";
        statusMsg.style.background = "#fee2e2";
        statusMsg.style.color = "#ef4444";
        statusMsg.innerHTML = '<i class="fas fa-exclamation-circle"></i> Vui lòng nhập hoặc chọn đúng định dạng Email kỹ thuật viên!';
        statusMsg.classList.remove('hidden');
        return;
    }

    if (!note) {
        statusMsg.style.display = "block";
        statusMsg.style.background = "#fee2e2";
        statusMsg.style.color = "#ef4444";
        statusMsg.innerHTML = '<i class="fas fa-exclamation-circle"></i> Vui lòng nhập nội dung ghi chú công việc!';
        statusMsg.classList.remove('hidden');
        return;
    }

    statusMsg.style.display = "block";
    statusMsg.style.background = "#e0f2fe";
    statusMsg.style.color = "#0369a1";
    statusMsg.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang kết nối với dịch vụ gửi thư...';
    statusMsg.classList.remove('hidden');

    try {
        const response = await fetch("http://127.0.0.1:8000/api/assets/assign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ asset_id: id, asset_name: name, tech_email: email, note: note })
        });

        const result = await response.json();

        if (response.ok) {
            statusMsg.style.background = "#dcfce7";
            statusMsg.style.color = "#15803d";
            statusMsg.innerHTML = `<i class="fas fa-check-circle"></i> Đã gửi email giao việc thành công tới: <b>${email}</b>`;
            
            try {
                const path = getAssetCollectionPath(); 
                if (path) {
                    await updateDoc(doc(db, path, id), {
                        predictedStatus: "Đang bảo trì"
                    });
                }
            } catch (fsError) {
                console.error("Lỗi cập nhật trạng thái bảo trì lên Firestore:", fsError);
            }

            const targetRow = document.getElementById(`m-row-${id}`);
            if (targetRow) targetRow.remove();

            document.getElementById('assign-asset-id').value = "";
            document.getElementById('assign-asset-name').value = "";
            document.getElementById('assign-asset-display').value = "";
            document.getElementById('assign-tech-email').value = "";
            document.getElementById('assign-note').value = "";
            document.getElementById('btn-submit-assignment').disabled = true;
        } else {
            throw new Error(result.detail || "Gửi mail thất bại.");
        }
    } catch (error) {
        statusMsg.style.background = "#fee2e2";
        statusMsg.style.color = "#ef4444";
        statusMsg.innerHTML = `<i class="fas fa-times-circle"></i> Lỗi hệ thống: ${error.message}`;
    }
};

window.completeMaintenance = function(id, assetId) {
    currentModalAction = 'complete_maintenance';
    modalTargetDocId = id; 
    
    const today = new Date().toISOString().slice(0, 10);
    const nextYearDate = new Date();
    nextYearDate.setDate(nextYearDate.getDate() + 365);
    const defaultExpiry = nextYearDate.toISOString().slice(0, 10);
    
    document.getElementById('modalTitle').textContent = `Xác nhận Hoàn Tất Bảo Trì: ${assetId}`;
    document.getElementById('modalBody').innerHTML = `
        <div style="padding: 10px 0;">
            <p style="margin-bottom: 15px; color: var(--secondary-color);">Cập nhật các thông số thời gian thực tế để đồng bộ chính xác dữ liệu AI:</p>
            
            <div class="form-group" style="margin-bottom: 15px;">
                <label style="font-weight: 600; display: block; margin-bottom: 5px;">Ngày sửa xong thực tế (*):</label>
                <input type="date" id="maint-complete-date" value="${today}" required style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px;">
            </div>

            <div class="form-group" style="margin-bottom: 15px;">
                <label style="font-weight: 600; display: block; margin-bottom: 5px;">Ngày hết hạn tiếp theo (Gia hạn mới) (*):</label>
                <input type="date" id="maint-next-expiry" value="${defaultExpiry}" required style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px;">
            </div>
            
            <p style="font-size: 0.85em; color: var(--primary-color); background: #f0fdf4; padding: 8px; border-radius: 4px; border: 1px solid #bbf7d0; margin-top: 15px; text-align: center;">
                <i class="fas fa-info-circle"></i> Hệ thống tự động tăng <b>Số lần bảo trì +1</b>
            </p>
        </div>
    `;
    
    const confirmBtn = document.getElementById('modalConfirmButton');
    confirmBtn.classList.remove('hidden');
    confirmBtn.textContent = 'Xác nhận Hoàn Thành';
    confirmBtn.className = 'btn btn-success'; 
    
    document.getElementById('statusModal').classList.add('visible');
};

// ===================================================================
// QUẢN LÝ NHÂN SỰ REALTIME TRÊN CLOUD + CẤP & ĐỔI MẬT KHẨU
// ===================================================================
function renderUserManagement() {
    filterPersonnelList();
}

function filterPersonnelList() {
    const searchVal = document.getElementById('searchPersonnelInput')?.value.toLowerCase().trim() || '';
    const roleVal = document.getElementById('filterPersonnelRole')?.value || '';

    const filtered = personnelCache.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchVal) || p.email.toLowerCase().includes(searchVal) || p.personnelId.toLowerCase().includes(searchVal);
        const matchesRole = roleVal === '' || p.role === roleVal;
        return matchesSearch && matchesRole;
    });

    renderPersonnelTable(filtered);
}

function renderPersonnelTable(list) {
    const tbody = document.getElementById('personnelTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--secondary-color);">Không tìm thấy nhân sự nào phù hợp.</td></tr>';
        return;
    }

    list.forEach(p => {
        const badgeClass = p.status === 'Hoạt động' ? 'good' : 'inactive';
        const lockIcon = p.status === 'Hoạt động' ? 'fa-lock' : 'fa-unlock-alt';
        const lockTitle = p.status === 'Hoạt động' ? 'Khóa tài khoản' : 'Mở khóa tài khoản';
        const btnColor = p.status === 'Hoạt động' ? 'btn-secondary' : 'btn-success';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="font-weight: bold; color: var(--primary-color);">${p.personnelId}</td>
            <td>${p.name}</td>
            <td>${p.email} <br><small style="color: gray;">Pass: ${p.password || 'SmartAsset@2026'}</small></td>
            <td>${p.role}</td>
            <td><span class="status-badge ${badgeClass}">${p.status}</span></td>
            <td class="action-btns">
                <button class="btn btn-primary" onclick="viewPersonnelDetails('${p.id}')" title="Xem chi tiết"><i class="fas fa-eye"></i></button>
                <button class="btn btn-secondary" onclick="editPersonnel('${p.id}')" title="Chỉnh sửa & Cấp lại mật khẩu"><i class="fas fa-edit"></i></button>
                <button class="btn ${btnColor}" onclick="togglePersonnelStatus('${p.id}')" title="${lockTitle}"><i class="fas ${lockIcon}"></i></button>
                <button class="btn btn-danger" onclick="deletePersonnel('${p.id}')" title="Xóa"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function openAddPersonnelModal() {
    currentEditingPersonnelId = null;
    const modalBody = document.getElementById('modalBody');
    document.getElementById('modalTitle').textContent = 'Thêm Nhân sự & Cấp tài khoản';
    
    modalBody.innerHTML = `
        <form id="personnelForm" onsubmit="savePersonnel(event)">
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="font-weight: 600; display: block; margin-bottom: 5px;">Mã Nhân sự (*):</label>
                <input type="text" id="p_id" required placeholder="Ví dụ: NS004" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px;">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="font-weight: 600; display: block; margin-bottom: 5px;">Họ và Tên (*):</label>
                <input type="text" id="p_name" required placeholder="Nhập họ tên..." style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px;">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="font-weight: 600; display: block; margin-bottom: 5px;">Email / Tên đăng nhập (*):</label>
                <input type="email" id="p_email" required placeholder="email@smartasset.com" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px;">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="font-weight: 600; display: block; margin-bottom: 5px;">Mật khẩu đăng nhập (*):</label>
                <input type="text" id="p_password" value="SmartAsset@2026" required placeholder="Nhập mật khẩu..." style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-weight: bold; color: #2563eb;">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="font-weight: 600; display: block; margin-bottom: 5px;">Chức vụ (*):</label>
                <select id="p_role" required style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px;">
                    <option value="Nhân viên">Nhân viên (Quyền cơ bản)</option>
                    <option value="Kỹ thuật viên">Kỹ thuật viên (Nhận bảo trì)</option>
                    <option value="Quản trị viên">Quản trị viên (Toàn quyền)</option>
                </select>
            </div>
            <div class="form-group" style="margin-bottom: 15px;">
                <label style="font-weight: 600; display: block; margin-bottom: 5px;">Phòng ban:</label>
                <input type="text" id="p_dept" placeholder="Ví dụ: IT, Bảo trì..." style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px;">
            </div>
            <div style="text-align: right;">
                <button type="submit" class="btn btn-success"><i class="fas fa-save"></i> Tạo Tài khoản & Lưu</button>
            </div>
        </form>
    `;
    
    document.getElementById('modalConfirmButton').classList.add('hidden');
    document.getElementById('statusModal').classList.add('visible');
}

function editPersonnel(id) {
    const p = personnelCache.find(x => x.id === id);
    if (!p) return;

    currentEditingPersonnelId = id;
    const modalBody = document.getElementById('modalBody');
    document.getElementById('modalTitle').textContent = `Chỉnh sửa & Đổi Mật khẩu: ${p.personnelId}`;
    
    modalBody.innerHTML = `
        <form id="personnelForm" onsubmit="savePersonnel(event)">
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="font-weight: 600; display: block; margin-bottom: 5px;">Mã Nhân sự:</label>
                <input type="text" id="p_id" value="${p.personnelId}" disabled style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; background: #f1f5f9;">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="font-weight: 600; display: block; margin-bottom: 5px;">Họ và Tên (*):</label>
                <input type="text" id="p_name" value="${p.name}" required style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px;">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="font-weight: 600; display: block; margin-bottom: 5px;">Email (*):</label>
                <input type="email" id="p_email" value="${p.email}" required style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px;">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="font-weight: 600; display: block; margin-bottom: 5px; color: #dc3545;">Mật khẩu mới (Cấp lại khi quên):</label>
                <input type="text" id="p_password" value="${p.password || 'SmartAsset@2026'}" required style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-weight: bold; color: #dc3545;">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="font-weight: 600; display: block; margin-bottom: 5px;">Chức vụ (*):</label>
                <select id="p_role" required style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px;">
                    <option value="Nhân viên" ${p.role === 'Nhân viên' ? 'selected' : ''}>Nhân viên</option>
                    <option value="Kỹ thuật viên" ${p.role === 'Kỹ thuật viên' ? 'selected' : ''}>Kỹ thuật viên</option>
                    <option value="Quản trị viên" ${p.role === 'Quản trị viên' ? 'selected' : ''}>Quản trị viên</option>
                </select>
            </div>
            <div class="form-group" style="margin-bottom: 15px;">
                <label style="font-weight: 600; display: block; margin-bottom: 5px;">Phòng ban:</label>
                <input type="text" id="p_dept" value="${p.department || ''}" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px;">
            </div>
            <div style="text-align: right;">
                <button type="submit" class="btn btn-success"><i class="fas fa-save"></i> Cập nhật Thông tin & Mật khẩu</button>
            </div>
        </form>
    `;
    
    document.getElementById('modalConfirmButton').classList.add('hidden');
    document.getElementById('statusModal').classList.add('visible');
}

async function savePersonnel(event) {
    event.preventDefault();
    const personnelId = document.getElementById('p_id').value.trim();
    const name = document.getElementById('p_name').value.trim();
    const email = document.getElementById('p_email').value.trim();
    const password = document.getElementById('p_password').value.trim();
    const role = document.getElementById('p_role').value;
    const dept = document.getElementById('p_dept').value.trim();

    const path = getPersonnelCollectionPath();
    if (!path) return showStatusModal('Lỗi', 'Database chưa sẵn sàng.', 'danger');

    try {
        if (currentEditingPersonnelId) {
            await updateDoc(doc(db, path, currentEditingPersonnelId), {
                name, email, password, role, department: dept
            });
            showStatusModal('Thành công', 'Đã cập nhật nhân sự & mật khẩu thành công!', 'success');
        } else {
            if (personnelCache.some(x => x.personnelId === personnelId)) {
                alert('Mã nhân sự này đã tồn tại trên hệ thống!');
                return;
            }
            await addDoc(collection(db, path), {
                personnelId, name, email, password, role, status: 'Hoạt động', department: dept
            });
            showStatusModal('Thành công', 'Đã tạo tài khoản cho nhân sự mới thành công!', 'success');
        }
        closeModal();
    } catch (e) {
        showStatusModal('Lỗi', `Thất bại: ${e.message}`, 'danger');
    }
}

function viewPersonnelDetails(id) {
    const p = personnelCache.find(x => x.id === id);
    if (!p) return;

    document.getElementById('modalTitle').textContent = `Chi tiết Nhân sự: ${p.name}`;
    document.getElementById('modalBody').innerHTML = `
        <div style="line-height: 1.8; font-size: 1em;">
            <p><strong>Mã Nhân sự:</strong> ${p.personnelId}</p>
            <p><strong>Họ và Tên:</strong> ${p.name}</p>
            <p><strong>Email:</strong> ${p.email}</p>
            <p><strong>Chức vụ:</strong> ${p.role}</p>
            <p><strong>Phòng ban:</strong> ${p.department || 'Chưa cập nhật'}</p>
            <p><strong>Trạng thái:</strong> <span class="status-badge ${p.status === 'Hoạt động' ? 'good' : 'inactive'}">${p.status}</span></p>
        </div>
    `;
    document.getElementById('modalConfirmButton').classList.add('hidden');
    document.getElementById('statusModal').classList.add('visible');
}

async function togglePersonnelStatus(id) {
    const p = personnelCache.find(x => x.id === id);
    if (!p) return;

    const newStatus = p.status === 'Hoạt động' ? 'Khóa' : 'Hoạt động';
    const path = getPersonnelCollectionPath();
    if (!path) return;

    try {
        await updateDoc(doc(db, path, id), {
            status: newStatus
        });
        showStatusModal('Thành công', `Đã chuyển trạng thái nhân sự thành: ${newStatus}`, 'success');
    } catch (e) {
        showStatusModal('Lỗi', `Cập nhật trạng thái thất bại: ${e.message}`, 'danger');
    }
}

async function deletePersonnel(id) {
    if (confirm(`Bạn có chắc chắn muốn xóa nhân sự này không?`)) {
        const path = getPersonnelCollectionPath();
        try {
            await deleteDoc(doc(db, path, id));
            showStatusModal('Thành công', 'Đã xóa nhân sự thành công!', 'success');
        } catch (e) {
            showStatusModal('Lỗi', `Xóa thất bại: ${e.message}`, 'danger');
        }
    }
}

// ===================================================================
// HIỂN THỊ DANH SÁCH / LỌC / PHÂN TRANG TÀI SẢN
// ===================================================================
function updateAssetView(assets) {
    let filteredAssets = assets.filter(asset => {
        const matchesSearch = asset.name.toLowerCase().includes(currentSearchTerm) || asset.assetId.toLowerCase().includes(currentSearchTerm);
        const matchesType = currentFilterType === '' || asset.type === currentFilterType;
        const status = asset.predictedStatus ? asset.predictedStatus : "Chưa dự đoán";
        const matchesStatus = currentFilterStatus === '' || (currentFilterStatus === "Chưa dự đoán" && status === "Chưa dự đoán") || status === currentFilterStatus;
        return matchesSearch && matchesType && matchesStatus;
    });

    filteredAssets.sort((a, b) => a.assetId.localeCompare(b.assetId));
    const totalPages = Math.ceil(filteredAssets.length / assetsPerPage);
    if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
    else if (totalPages === 0) currentPage = 1;

    const startIndex = (currentPage - 1) * assetsPerPage;
    const endIndex = startIndex + assetsPerPage;
    renderAssetTable(filteredAssets.slice(startIndex, endIndex), filteredAssets.length);
}

function renderAssetTable(assetsToDisplay, totalFilteredAssets) {
    const tbody = document.getElementById('assetTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (assetsToDisplay.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--secondary-color);">Không tìm thấy tài sản nào phù hợp.</td></tr>';
    } else {
        assetsToDisplay.forEach(asset => {
            const { badgeClass, statusText } = renderStatus(asset.predictedStatus);
            const assetValue = typeof asset.value === 'number' ? asset.value : parseFloat(asset.value || 0);

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${asset.assetId}</td>
                <td>${asset.name}</td>
                <td>${asset.type}</td>
                <td>${assetValue.toLocaleString('vi-VN')} VNĐ</td>
                <td>${asset.purchaseDate}</td>
                <td class="asset-status"><span class="status-badge ${badgeClass}">${statusText}</span></td>
                <td class="action-btns">
                    <button class="btn btn-primary" onclick="viewAssetDetails('${asset.id}')" title="Xem Chi tiết"><i class="fas fa-eye"></i></button>
                    <button class="btn btn-secondary" onclick="editAsset('${asset.id}')" title="Chỉnh sửa"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-danger" onclick="confirmDelete('${asset.id}', '${asset.assetId}')" title="Xóa"><i class="fas fa-trash-alt"></i></button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }
    
    const paginationDiv = document.querySelector('.pagination');
    if (paginationDiv) {
        paginationDiv.innerHTML = '';
        const totalPages = Math.ceil(totalFilteredAssets / assetsPerPage);
        const startItem = totalFilteredAssets > 0 ? (currentPage - 1) * assetsPerPage + 1 : 0;
        const endItem = Math.min(currentPage * assetsPerPage, totalFilteredAssets);

        const paginationSpan = document.createElement('span');
        paginationSpan.textContent = `Hiển thị ${startItem} - ${endItem} / ${totalFilteredAssets} tài sản`;
        paginationDiv.appendChild(paginationSpan);

        const prevBtn = document.createElement('button');
        prevBtn.innerHTML = '&laquo;'; prevBtn.disabled = currentPage === 1 || totalPages === 0;
        prevBtn.onclick = () => changePage(-1);
        paginationDiv.appendChild(prevBtn);

        for (let i = 1; i <= totalPages; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.textContent = i; pageBtn.className = i === currentPage ? 'active' : '';
            pageBtn.onclick = () => { if (i !== currentPage) { changePage(i - currentPage); } };
            paginationDiv.appendChild(pageBtn);
        }
        
        const nextBtn = document.createElement('button');
        nextBtn.innerHTML = '&raquo;'; nextBtn.disabled = currentPage === totalPages || totalPages === 0;
        nextBtn.onclick = () => changePage(1);
        paginationDiv.appendChild(nextBtn);
    }
}

function renderStatus(status) {
    if (!status || status === "N/A" || status === "Chưa dự đoán") return { badgeClass: "inactive", statusText: "N/A" };
    if (status === "Tốt") return { badgeClass: "good", statusText: "Tốt" };
    if (status === "Cần bảo trì") return { badgeClass: "warning", statusText: "Cần bảo trì" };
    if (status === "Hỏng") return { badgeClass: "danger", statusText: "Hỏng" };
    if (status === "Đang bảo trì") return { badgeClass: "info", statusText: "Đang bảo trì" };
    return { badgeClass: "inactive", statusText: "N/A" };
}

function changePage(pageOffset) { currentPage += pageOffset; updateAssetView(assetsCache); }
function handleSearchFilter() { currentSearchTerm = document.getElementById('searchInput').value.toLowerCase().trim(); currentFilterType = document.getElementById('filterType').value; currentPage = 1; updateAssetView(assetsCache); }

function viewAssetDetails(docId) {
    const asset = assetsCache.find(a => a.id === docId);
    if (!asset) return showStatusModal('Lỗi', 'Không tìm thấy chi tiết tài sản.', 'danger');
    
    let badgeClass = '';
    switch (asset.predictedStatus) {
        case 'Tốt': badgeClass = 'good'; break;
        case 'Cần bảo trì': badgeClass = 'warning'; break; 
        case 'Hỏng': badgeClass = 'danger'; break; 
        case 'Đang bảo trì': badgeClass = 'info'; break;
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
            <div class="detail-full-width"><h4>Tình trạng & Đặc trưng ML</h4></div>
            <div class="detail-item"><strong>Trạng thái AI:</strong> <span class="modal-status-badge ${badgeClass} status-badge">${asset.predictedStatus}</span></div>
            <div class="detail-item"><strong>Tần suất sử dụng:</strong> ${asset.usageFrequency} lần/tháng</div>
            <div class="detail-item"><strong>Số lần bảo trì:</strong> ${asset.maintenanceCount} lần</div>
            <div class="detail-item"><strong>Tuổi đời:</strong> ${asset.ageMonths} tháng</div>
            <div class="detail-item"><strong>Bảo trì gần nhất:</strong> ${asset.lastMaintenance || 'N/A'}</div>
            <div class="detail-full-width"><strong>Mô tả chi tiết:</strong><p style="margin-top: 5px;">${asset.description || 'Không có mô tả.'}</p></div>
        </div>
    `;
    
    document.getElementById('modalTitle').textContent = `Chi tiết: ${asset.name}`;
    document.getElementById('modalConfirmButton').classList.add('hidden');
    document.getElementById('statusModal').classList.add('visible');
}

function editAsset(docId) {
    const assetToEdit = assetsCache.find(a => a.id === docId);
    if (!assetToEdit) return showStatusModal('Lỗi', `Không tìm thấy tài sản ID: ${docId}`, 'danger');
    
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
    modalTargetDocId = docId; currentModalAction = 'delete';
    document.getElementById('modalTitle').textContent = 'Xác nhận Xóa';
    document.getElementById('modalBody').innerHTML = `<p>Bạn có chắc chắn muốn xóa tài sản **${assetId}** này khỏi hệ thống không?</p>`;
    
    const confirmBtn = document.getElementById('modalConfirmButton');
    confirmBtn.classList.remove('hidden'); confirmBtn.textContent = 'Xóa Vĩnh viễn'; confirmBtn.className = 'btn btn-danger';
    document.getElementById('statusModal').classList.add('visible');
}

async function handleModalAction() { 
    if (currentModalAction === 'delete') { 
        await deleteAsset(modalTargetDocId); 
        modalTargetDocId = null; 
    } 
    else if (currentModalAction === 'complete_maintenance') {
        const completeDate = document.getElementById('maint-complete-date').value;
        const nextExpiryDate = document.getElementById('maint-next-expiry').value;
        
        if (!completeDate || !nextExpiryDate) {
            alert("Vui lòng điền đầy đủ thông tin ngày sửa xong và ngày hết hạn gia hạn!");
            return;
        }

        try {
            const path = getAssetCollectionPath();
            if (path) {
                const asset = assetsCache.find(a => a.id === modalTargetDocId);
                const currentCount = asset ? parseInt(asset.maintenanceCount || 0) : 0;

                await updateDoc(doc(db, path, modalTargetDocId), {
                    predictedStatus: "Tốt",
                    lastMaintenance: completeDate,
                    expiryDate: nextExpiryDate,
                    maintenanceCount: currentCount + 1
                });
                
                closeModal(); 
                showStatusModal('Thành công', `Thiết bị [${asset ? asset.assetId : ''}] đã hoàn tất cập nhật chu kỳ bảo trì mới thành công!`, 'success');
            }
        } catch (error) {
            console.error("Lỗi cập nhật hoàn tất bảo trì:", error);
            showStatusModal('Lỗi', `Không thể cập nhật: ${error.message}`, 'danger');
        }
        modalTargetDocId = null;
    }
    else { 
        closeModal(); 
    } 
}

function showStatusModal(title, message, type) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = `<p style="color: var(--${type}-color); font-weight: 600;">${message}</p>`;
    document.getElementById('modalConfirmButton').classList.add('hidden');
    document.getElementById('statusModal').classList.add('visible');
    if (type === 'success' || type === 'danger' || type === 'warning') setTimeout(closeModal, 3000);
}

function closeModal() { document.getElementById('statusModal').classList.remove('visible'); currentModalAction = null; modalTargetDocId = null; }

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
            
            if (currentEditingDocId) { updateExistingAsset(currentEditingDocId, assetData); }
            else {
                if (assetsCache.some(a => a.assetId === assetData.assetId)) {
                    return showStatusModal('Lỗi Trùng lặp', `Mã Tài sản "${assetData.assetId}" đã tồn tại.`, 'danger');
                }
                addNewAsset(assetData);
            }
        };
    }
}

// ===================================================================
// IMPORT / EXPORT CSV, XLSX
// ===================================================================
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        if (values.length !== headers.length) continue; 

        const asset = {
            assetId: values[0] || 'N/A',
            name: values[1] || 'Chưa đặt tên',
            type: values[2] || 'Phần cứng',
            value: parseFloat(values[3].replace(/\./g, '')) || 0,
            purchaseDate: values[4] || new Date().toISOString().slice(0, 10),
            expiryDate: values[5] || null,
            department: values[6] || 'Chung',
            description: values[7] || '',
            usageFrequency: parseInt(values[8]) || 0,
            maintenanceCount: parseInt(values[9]) || 0,
            ageMonths: parseInt(values[10]) || 0,
            lastMaintenance: values[11] || null,
            predictedStatus: mapStatusToThree(values[12] || 'Chưa dự đoán'),
            createdAt: new Date().toISOString()
        };
        data.push(asset);
    }
    return data;
}

async function handleImport(event) {
    event.preventDefault();
    const importType = document.getElementById('importType').value;
    const importFile = document.getElementById('importFile').files[0];

    if (!importFile) return showStatusModal('Lỗi', "Vui lòng chọn file.", 'warning');
    if (importType !== 'assets') {
        showStatusModal('Thông báo', `Tính năng đang phát triển.`, 'warning');
        return;
    }
    if (!importFile.name.toLowerCase().endsWith('.csv')) return showStatusModal('Lỗi', "Chỉ hỗ trợ file CSV.", 'danger');

    const path = getAssetCollectionPath(); if (!path) return;
    const reader = new FileReader();
    
    reader.onload = async function(e) {
        const importedAssets = parseCSV(e.target.result);
        if (importedAssets.length === 0) return showStatusModal('Lỗi', "File không hợp lệ.", 'danger');

        let importSuccessCount = 0; let ignoredCount = 0;
        const writePromises = importedAssets.map(asset => {
            if (assetsCache.some(a => a.assetId === asset.assetId)) { ignoredCount++; return Promise.resolve(false); }
            return addDoc(collection(db, path), asset).then(() => { importSuccessCount++; }).catch(() => false);
        });

        await Promise.all(writePromises);
        showStatusModal('Thành công', `Đã thêm ${importSuccessCount} tài sản. Bỏ qua ${ignoredCount} trùng lặp.`, 'success');
    };
    reader.readAsText(importFile);
    document.getElementById('importForm').reset();
    document.getElementById('fileNameDisplay').textContent = "Kéo thả hoặc Nhấn để chọn file";
}

function prepareExportData(sourceData, exportType) {
    let dataToExport = []; let fileName = 'export_data';
    if (exportType === 'current_assets' || exportType === 'all_assets') {
        dataToExport = sourceData.map(asset => ({
            'Mã TS': asset.assetId, 'Tên Tài sản': asset.name, 'Loại': asset.type, 'Giá trị (VNĐ)': asset.value,
            'Ngày mua/Ký HĐ': asset.purchaseDate, 'Ngày hết hạn': asset.expiryDate, 'Phòng ban': asset.department,
            'Mô tả': asset.description, 'Tần suất SD (Lần/tháng)': asset.usageFrequency, 'Số lần bảo trì (Năm)': asset.maintenanceCount,
            'Tuổi đời (Tháng)': asset.ageMonths, 'Bảo trì gần nhất': asset.lastMaintenance, 'Trạng thái AI (3 Trạng thái)': asset.predictedStatus
        }));
        fileName = exportType === 'current_assets' ? 'danh_sach_tai_san' : 'lich_su_tai_san';
    } else if (exportType === 'users') {
        dataToExport = personnelCache.map(u => ({ 'ID': u.personnelId, 'Tên nhân sự': u.name, 'Email': u.email, 'Chức vụ': u.role, 'Trạng thái': u.status }));
        fileName = 'danh_sach_nhan_su';
    }
    return { data: dataToExport, fileName };
}

function exportToCSV(exportData, fileName) {
    if (exportData.length === 0) return showStatusModal('Lỗi', 'Không có dữ liệu.', 'warning');
    if (typeof window.saveAs === 'undefined') return showStatusModal('Lỗi', 'Thiếu FileSaver.js.', 'danger');

    const headers = Object.keys(exportData[0]);
    let csv = headers.join(',') + '\n';
    exportData.forEach(row => {
        csv += headers.map(h => { let v = row[h] ?? ''; return (typeof v === 'string' && v.includes(',')) ? `"${v.replace(/"/g, '""')}"` : v; }).join(',') + '\n';
    });
    window.saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${fileName}.csv`);
    showStatusModal('Thành công', `Đã xuất ${fileName}.csv thành công.`, 'success');
}

function exportToXLSX(exportData, fileName) {
    if (typeof window.XLSX === 'undefined') return showStatusModal('Lỗi', 'Thiếu thư viện XLSX.', 'danger');
    if (exportData.length === 0) return showStatusModal('Lỗi', 'Không có dữ liệu.', 'warning');
    const ws = window.XLSX.utils.json_to_sheet(exportData);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Dữ liệu Asset");
    window.XLSX.writeFile(wb, `${fileName}.xlsx`);
    showStatusModal('Thành công', `Đã xuất ${fileName}.xlsx thành công.`, 'success');
}

function handleExport(format) {
    const exportType = document.getElementById('exportType').value;
    
    if (exportType === 'users' && !currentUserSession.isAdmin) {
        return showStatusModal('Truy cập bị từ chối', 'Bạn không có quyền xuất danh sách người dùng!', 'danger');
    }

    let sourceData = (exportType === 'current_assets' || exportType === 'all_assets') ? assetsCache : personnelCache;
    if (sourceData.length === 0) return showStatusModal('Lỗi', `Không có dữ liệu.`, 'warning');
    const { data, fileName } = prepareExportData(sourceData, exportType);
    if (format === 'csv') exportToCSV(data, fileName);
    else if (format === 'xlsx') exportToXLSX(data, fileName);
}

function setupNavigation() {
    document.querySelectorAll('.nav li').forEach(listItem => {
        const link = listItem.querySelector('a');
        if (link) { link.addEventListener('click', function(e) { e.preventDefault(); const contentId = listItem.getAttribute('data-content-id'); if (contentId) changeContent(contentId); }); }
    });
}

function setupImportExportEvents() {
    const importFile = document.getElementById('importFile');
    if (importFile) { importFile.addEventListener('change', function() { document.getElementById('fileNameDisplay').textContent = this.files.length > 0 ? this.files[0].name : "Kéo thả hoặc Nhấn để chọn file"; }); }
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) { const [y, m, d] = dateStr.split('-').map(Number); return new Date(y, m - 1, d); }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) { const [d, m, y] = dateStr.split('/').map(Number); return new Date(y, m - 1, d); }
    const tmp = new Date(dateStr); return !isNaN(tmp.getTime()) ? new Date(tmp.getFullYear(), tmp.getMonth(), tmp.getDate()) : null;
}

function formatLocalDate(date) {
    if (!date || isNaN(date.getTime())) return null;
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

function diffInDays(a, b) { return Math.floor((a - b) / (1000 * 3600 * 24)); }

async function handleAIPredict(event) {
    event.preventDefault();
    const predictDate = parseDate(ai_predict_date.value); const startDate = parseDate(ai_start_date.value);
    const endDate = parseDate(ai_end_date.value); const lastMaint = parseDate(ai_lastMaintenance.value);

    const payload = {
        asset_value: +ai_assetValue.value, usage_frequency: +ai_usageFrequency.value, maintenance_count: +ai_maintenanceCount.value,
        asset_age_months: Math.floor((predictDate - startDate) / (1000 * 3600 * 24 * 30.4375)),
        days_since_last_maint: diffInDays(predictDate, lastMaint), days_left: diffInDays(endDate, predictDate),
        asset_type: ai_assetType.value, start_date: ai_start_date.value, end_date: ai_end_date.value, last_maintenance: ai_lastMaintenance.value, predict_date: ai_predict_date.value
    };

    const response = await fetch("http://127.0.0.1:8000/predict", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    const badge = document.getElementById("predictionBadge");
    badge.textContent = data.prediction; badge.className = "prediction-box";
    if (data.prediction === "Tốt") badge.classList.add("good");
    else if (data.prediction === "Cần bảo trì") badge.classList.add("warning");
    else badge.classList.add("danger");
    document.getElementById("predictionResult").classList.remove("hidden");
}

function savePredictionResult() {
    if (!lastPredictionResult) return showStatusModal('Lỗi', "Chưa thực hiện dự đoán.", 'warning');
    showStatusModal('Thành công', `Đã lưu kết quả thành công! (Mô phỏng)`, 'success');
}

function handleRetrain() {
    const logOutput = document.getElementById('logOutput'); const statusElement = document.getElementById('retrainStatus');
    logOutput.textContent = `[Hệ thống]: Kết nối API...\n`; statusElement.textContent = 'Đang huấn luyện...'; statusElement.className = 'font-bold text-warning-color';

    const steps = ["Đang tải dữ liệu...", "Tiền xử lý dữ liệu...", "Khởi tạo mô hình...", "Huấn luyện hoàn tất. Phiên bản: 2.1."];
    let idx = 0;
    const interval = setInterval(() => {
        if (idx < steps.length) { logOutput.textContent += `[${new Date().toLocaleTimeString()}]: ${steps[idx]}\n`; idx++; }
        else { clearInterval(interval); statusElement.textContent = 'Hoàn thành'; statusElement.className = 'font-bold text-success-color'; }
    }, 1000);
}

function handleSaveSettings(event) { event.preventDefault(); assetsPerPage = parseInt(document.getElementById('assetPerPage').value) || 10; showStatusModal('Thành công', "Đã lưu thành công!", 'success'); }

function resetFilters() {
    currentFilterType = ""; currentFilterStatus = ""; currentSearchTerm = ""; currentPage = 1;
    const ft = document.getElementById("filterType"); const fs = document.getElementById("filterStatus"); const si = document.getElementById("searchInput");
    if (ft) { ft.selectedIndex = 0; ft.dispatchEvent(new Event('change', { bubbles: true })); }
    if (fs) { fs.selectedIndex = 0; fs.dispatchEvent(new Event('change', { bubbles: true })); }
    if (si) { si.value = ""; si.dispatchEvent(new Event('input', { bubbles: true })); }
    updateAssetView(assetsCache);
}

// Global functions mapping
window.viewAssetDetails = viewAssetDetails; 
window.editAsset = editAsset; 
window.confirmDelete = confirmDelete;
window.changeContent = changeContent; 
window.handleLogout = handleLogout; 
window.handleModalAction = handleModalAction;
window.closeModal = closeModal; 
window.handleImport = handleImport;
window.handleExport = handleExport; 
window.handleAIPredict = handleAIPredict; 
window.savePredictionResult = savePredictionResult;
window.handleRetrain = handleRetrain; 
window.handleLogin = handleLogin; 
window.runBatchPredict = runBatchPredict; 
window.resetFilters = resetFilters;
window.selectAssetToAssign = selectAssetToAssign; 
window.executeAssignTask = executeAssignTask; 
window.completeMaintenance = completeMaintenance;

// Nhân sự Global bindings
window.openAddPersonnelModal = openAddPersonnelModal;
window.savePersonnel = savePersonnel;
window.viewPersonnelDetails = viewPersonnelDetails;
window.editPersonnel = editPersonnel;
window.togglePersonnelStatus = togglePersonnelStatus;
window.deletePersonnel = deletePersonnel;
window.filterPersonnelList = filterPersonnelList;