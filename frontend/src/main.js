// --------------------------------------------------------
// main.js - Toàn bộ JavaScript Logic đã được tách ra từ index.html
// --------------------------------------------------------

// --- DỮ LIỆU GIẢ ĐỊNH ---
        
// Dữ liệu giả định (Mock Data) TẬP TRUNG cho Dashboard
const mockDashboardData = {
    totalAssets: 1250, 
    maintenanceNeeded: 45,
    expiringSoon: 12,
    assetTypes: { giayTo: 400, phanCung: 600, phanMem: 250 },
    predictionStatus: { tot: 900, canBaoTri: 250, hongNhe: 70, hongNang: 30 }
};

// Dữ liệu giả định cho Danh sách Tài sản (Asset List)
const mockAssetList = [
    { id: 'TS001', name: 'Laptop Dell XPS 13', type: 'Phần cứng', value: 35000000, date: '2023-01-15', status: 'Tốt' },
    { id: 'TS002', name: 'Hợp đồng thuê VP', type: 'Giấy tờ', value: 0, date: '2022-06-01', status: 'Cần bảo trì' },
    { id: 'TS003', name: 'Máy in Canon 2900', type: 'Phần cứng', value: 3000000, date: '2021-03-20', status: 'Hỏng nhẹ' },
    { id: 'TS004', name: 'Bản quyền MS Office', type: 'Phần mềm', value: 1500000, date: '2024-02-10', status: 'Tốt' },
    { id: 'TS005', name: 'Router Cisco A12', type: 'Phần cứng', value: 8000000, date: '2020-11-05', status: 'Hỏng nặng' },
    { id: 'TS006', name: 'Giấy phép Cloud AWS', type: 'Phần mềm', value: 50000000, date: '2024-05-01', status: 'Tốt' },
    { id: 'TS007', name: 'Hồ sơ nhân viên A', type: 'Giấy tờ', value: 0, date: '2023-09-01', status: 'Tốt' },
    { id: 'TS008', name: 'Laptop HP EliteBook', type: 'Phần cứng', value: 20000000, date: '2022-10-25', status: 'Cần bảo trì' },
    { id: 'TS009', name: 'Domain name (.com)', type: 'Phần mềm', value: 500000, date: '2024-11-01', status: 'Tốt' },
    { id: 'TS010', name: 'Máy chiếu Epson X900', type: 'Phần cứng', value: 12000000, date: '2021-07-07', status: 'Hỏng nhẹ' },
];

// Dữ liệu giả định cho Quản lý Người dùng
let mockUsers = [
    { id: 1, name: 'Nguyễn Văn A', email: 'vana@smartasset.com', role: 'Admin', status: 'Active' },
    { id: 2, name: 'Trần Thị B', email: 'thib@smartasset.com', role: 'Staff', status: 'Active' },
    { id: 3, name: 'Lê Văn C', email: 'vanc@smartasset.com', role: 'Staff', status: 'Inactive' },
];

// Biến để lưu trữ các instance của Chart
let assetTypeChartInstance = null;
let predictionStatusChartInstance = null;

// Biến toàn cục để lưu kết quả dự đoán gần nhất
let lastPredictionResult = null;


// --- LOGIC GIAO DIỆN CHUNG ---

/**
 * Hàm chuyển đổi nội dung (giả lập SPA)
 * @param {string} contentId - ID của section nội dung cần hiển thị
 */
window.changeContent = function(contentId) {
    // Ẩn tất cả các sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.add('hidden');
        section.classList.remove('active');
    });

    // Hiển thị section mong muốn
    const targetSection = document.getElementById(contentId);
    if (targetSection) {
        targetSection.classList.remove('hidden');
        targetSection.classList.add('active');
    }
    
    // Cập nhật trạng thái active trên Sidebar
    document.querySelectorAll('.nav li').forEach(li => li.classList.remove('active'));
    const targetMenuItem = document.querySelector(`[data-content-id="${contentId}"]`);
    if (targetMenuItem) {
        targetMenuItem.classList.add('active');
        
        // Cập nhật tiêu đề, xử lý loại bỏ badge "MỚI" khỏi tiêu đề chính
        let titleText = targetMenuItem.querySelector('a').textContent.trim();
        const badge = targetMenuItem.querySelector('.new-feature-badge');
        if (badge) {
            titleText = titleText.replace(badge.textContent, '').trim();
        }
        document.getElementById('main-title').textContent = titleText;
    }
    
    // LOGIC QUAN TRỌNG: Khởi tạo/Cập nhật biểu đồ nếu đang ở Dashboard
    if (contentId === 'dashboard-content') {
        initializeCharts();
    } else {
        // Hủy biểu đồ khi chuyển khỏi Dashboard để tránh lỗi Chart.js
        destroyCharts();
    }
    
    // Logic đặc biệt cho từng trang
    if (contentId === 'add-asset-content') {
        const form = document.getElementById('addAssetForm');
        if (form) {
            form.reset(); // Reset form khi mở
            setupFormSubmission();
        }
    } else if (contentId === 'ai-predict-content') {
        document.getElementById('aiPredictForm').reset();
        document.getElementById('predictionResult').classList.add('hidden');
    } else if (contentId === 'user-management-content') {
        renderUserManagement();
        document.getElementById('addUserModal').classList.add('hidden');
    } else if (contentId === 'settings-content') {
        console.log("Đã chuyển sang trang Cài đặt. Chuẩn bị load dữ liệu.");
    }
}

function updateStatsCards() {
    const totalPredictedAssets = mockDashboardData.predictionStatus.tot + 
                           mockDashboardData.predictionStatus.canBaoTri +
                           mockDashboardData.predictionStatus.hongNhe +
                           mockDashboardData.predictionStatus.hongNang;
    const goodPredictionPercentage = totalPredictedAssets > 0 
        ? ((mockDashboardData.predictionStatus.tot / totalPredictedAssets) * 100).toFixed(0) 
        : 0;

    document.querySelector('.stats-cards .total p').textContent = mockDashboardData.totalAssets;
    document.querySelector('.stats-cards .warning p').textContent = mockDashboardData.maintenanceNeeded;
    document.querySelector('.stats-cards .danger p').textContent = mockDashboardData.expiringSoon;
    document.querySelector('.stats-cards .good p').textContent = `${goodPredictionPercentage}%`;
}

// Hàm hủy các instance Chart
function destroyCharts() {
    if (assetTypeChartInstance) {
        assetTypeChartInstance.destroy();
        assetTypeChartInstance = null;
    }
    if (predictionStatusChartInstance) {
        predictionStatusChartInstance.destroy();
        predictionStatusChartInstance = null;
    }
    console.log('Đã hủy các instance Chart.');
}

// Hàm khởi tạo Biểu đồ (chỉ gọi khi ở Dashboard)
function initializeCharts() {
    // Đảm bảo không tạo lại Chart nếu đã tồn tại
    if (assetTypeChartInstance || predictionStatusChartInstance) {
        return;
    }
    
    // Biểu đồ 1: Tài sản chia theo loại (Doughnut Chart)
    const assetTypeData = {
        labels: ['Giấy tờ', 'Phần cứng', 'Phần mềm'],
        datasets: [{
            label: 'Số lượng tài sản',
            data: [
                mockDashboardData.assetTypes.giayTo, 
                mockDashboardData.assetTypes.phanCung, 
                mockDashboardData.assetTypes.phanMem
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

    // Biểu đồ 2: Trạng thái Dự đoán (Bar Chart)
    const predictionStatusData = {
        labels: ['Tốt', 'Cần bảo trì', 'Hỏng nhẹ', 'Hỏng nặng'],
        datasets: [{
            label: 'Số lượng Tài sản',
            data: [
                mockDashboardData.predictionStatus.tot, 
                mockDashboardData.predictionStatus.canBaoTri, 
                mockDashboardData.predictionStatus.hongNhe, 
                mockDashboardData.predictionStatus.hongNang
            ], 
            backgroundColor: ['#28a745', '#ffc107', '#fd7e14', '#dc3545'],
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
    console.log('Đã khởi tạo/cập nhật biểu đồ Dashboard.');
}

function setupNavigation() {
    // Lắng nghe sự kiện click cho các menu item
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

    // Logic Đăng xuất
    document.querySelector('.logout a').addEventListener('click', function(e) {
        e.preventDefault();
        console.log('Đăng xuất thành công! (Chuyển về trang đăng nhập)');
        destroyCharts(); // Hủy biểu đồ khi đăng xuất
    });
}

function initializeApp() {
    // 1. Cập nhật Stats Cards
    updateStatsCards();
    
    // 2. Khởi tạo Logic Chuyển đổi Menu và Đăng xuất
    setupNavigation();
    
    // 3. Khởi tạo Danh sách Tài sản (chỉ render HTML, không cần chart)
    renderAssetList(mockAssetList);

    // 4. Mặc định hiển thị Dashboard và khởi tạo Charts
    changeContent('dashboard-content');
    
    // 5. Setup event cho Import/Export
    setupImportExportEvents();
}

// --- LOGIC CHO DANH SÁCH TÀI SẢN ---

/**
 * Hàm hiển thị danh sách tài sản lên bảng
 * @param {Array} assets - Danh sách tài sản
 */
window.renderAssetList = function(assets) {
    const tbody = document.getElementById('assetTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    assets.forEach(asset => {
        let badgeClass = '';
        let statusText = asset.status;
        switch (asset.status) {
            case 'Tốt': badgeClass = 'good'; break;
            case 'Cần bảo trì': badgeClass = 'warning'; break;
            case 'Hỏng nhẹ': badgeClass = 'pending'; break;
            case 'Hỏng nặng': badgeClass = 'danger'; break;
            default: badgeClass = 'secondary';
        }

        const formattedValue = asset.value.toLocaleString('vi-VN');

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${asset.id}</td>
            <td>${asset.name}</td>
            <td>${asset.type}</td>
            <td>${formattedValue} VNĐ</td>
            <td>${asset.date}</td>
            <td><span class="status-badge ${badgeClass}">${statusText}</span></td>
            <td class="action-btns">
                <button class="btn btn-primary" onclick="viewAssetDetails('${asset.id}')" title="Xem Chi tiết">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-secondary" onclick="editAsset('${asset.id}')" title="Chỉnh sửa">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-danger" onclick="deleteAsset('${asset.id}')" title="Xóa">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Hàm hành động (mô phỏng) - Exposed to window
window.viewAssetDetails = function(id) {
    console.log(`Xem chi tiết tài sản: ${id}`);
    // TODO: Triển khai Modal/trang chi tiết
}

window.editAsset = function(id) {
    console.log(`Chỉnh sửa tài sản: ${id}`);
    changeContent('add-asset-content'); // Chuyển sang trang thêm/sửa
    // TODO: Load dữ liệu tài sản vào form
}

window.deleteAsset = function(id) {
    // Sử dụng console.warn thay vì alert/confirm
    console.warn(`Lệnh xác nhận xóa tài sản ${id} đã được gọi. Cần thay bằng Modal UI.`);
    console.log(`Đã xóa tài sản: ${id}`);
}

// --- LOGIC CHO FORM THÊM TÀI SẢN ---

function setupFormSubmission() {
    const form = document.getElementById('addAssetForm');
    if (form) {
        form.onsubmit = function(e) {
            e.preventDefault();
            
            const assetData = {
                name: document.getElementById('assetName').value,
                type: document.getElementById('assetType').value,
                value: document.getElementById('assetValue').value,
                purchaseDate: document.getElementById('purchaseDate').value,
                expiryDate: document.getElementById('expiryDate').value,
                department: document.getElementById('department').value,
                description: document.getElementById('description').value,
                // ML Features
                usageFrequency: document.getElementById('usageFrequency').value,
                maintenanceCount: document.getElementById('maintenanceCount').value,
                ageMonths: document.getElementById('ageMonths').value,
                lastMaintenance: document.getElementById('lastMaintenance').value
            };
            
            console.log('Dữ liệu Tài sản Mới đã được thu thập:', assetData);
            console.warn("Đã gọi hàm lưu (mô phỏng)! Dữ liệu sẽ được gửi đến Backend/DB.");

            changeContent('asset-list-content'); 
        };
    }
}

// --- LOGIC CHO IMPORT / EXPORT ---

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

window.handleImport = function(event) {
    event.preventDefault();
    const importType = document.getElementById('importType').value;
    const importFile = document.getElementById('importFile').files[0];
    
    if (!importFile) {
        console.warn("Vui lòng chọn một file để Import. (Cần thay bằng Modal UI)");
        return;
    }
    
    console.log(`Đang tiến hành Import file: ${importFile.name} cho loại dữ liệu: ${importType}`);
    console.warn(`Đang Import ${importType}. (Mô phỏng: Gửi file lên API Backend)`);
    
    document.getElementById('importForm').reset();
    document.getElementById('fileNameDisplay').textContent = "Kéo thả hoặc Nhấn để chọn file";
}

window.handleExport = function(format) {
    const exportType = document.getElementById('exportType').value;
    
    console.log(`Đang tiến hành Export dữ liệu: ${exportType} sang định dạng: ${format.toUpperCase()}`);
    console.warn(`Đang Export ${exportType} sang ${format.toUpperCase()}. (Mô phỏng: Gọi API Backend và tải file)`);
}

// --- LOGIC CHO DỰ ĐOÁN AI ---

window.handleAIPredict = function(event) {
    event.preventDefault();
    
    const features = {
        assetType: document.getElementById('ai_assetType').value,
        assetValue: parseInt(document.getElementById('ai_assetValue').value),
        usageFrequency: parseInt(document.getElementById('ai_usageFrequency').value),
        maintenanceCount: parseInt(document.getElementById('ai_maintenanceCount').value),
        ageMonths: parseInt(document.getElementById('ai_ageMonths').value),
        lastMaintenance: document.getElementById('ai_lastMaintenance').value,
    };
    
    console.log('Dữ liệu gửi đến API /predict:', features);
    
    document.getElementById('predictionBadge').textContent = "Đang dự đoán...";
    document.getElementById('predictionBadge').className = "prediction-box pending";
    document.getElementById('predictionResult').classList.remove('hidden');

    setTimeout(() => {
        const results = [
            { status: 'Tốt', class: 'good' },
            { status: 'Cần bảo trì', class: 'warning' }, 
            { status: 'Hỏng nhẹ', class: 'pending' }, 
            { status: 'Hỏng nặng', class: 'danger' }
        ];
        const randomIndex = Math.floor(Math.random() * results.length);
        const result = results[randomIndex];
        
        lastPredictionResult = result.status;

        document.getElementById('predictionBadge').textContent = result.status;
        document.getElementById('predictionBadge').className = `prediction-box ${result.class}`;
        
        console.log('Kết quả dự đoán nhận được:', result.status);
    }, 1500); 
}

window.savePredictionResult = function() {
    if (!lastPredictionResult) {
        console.warn("Vui lòng thực hiện dự đoán trước khi lưu. (Cần thay bằng Modal UI)");
        return;
    }
    
    const saveFeatures = {
        predictedStatus: lastPredictionResult,
    };
    
    console.log("Đang lưu kết quả dự đoán vào MySQL:", saveFeatures);
    console.warn(`Đã lưu kết quả dự đoán "${lastPredictionResult}" vào MySQL! (Mô phỏng)`);
}

// ----------------------------------------------------
// 1. Huấn luyện lại mô hình (AI Retrain)
// ----------------------------------------------------

/**
 * Xử lý quá trình Huấn luyện lại mô hình (Mô phỏng API call).
 */
window.handleRetrain = function() {
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

// ----------------------------------------------------
// 2. Quản lý người dùng (User Management)
// ----------------------------------------------------

/**
 * Hiển thị danh sách người dùng giả định lên bảng.
 */
window.renderUserManagement = function() {
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

/** Mở form modal thêm người dùng */
window.openAddUserModal = function() {
    document.getElementById('addUserModal').classList.remove('hidden');
    document.getElementById('addUserForm').reset();
}

/** Xử lý thêm người dùng mới (Mô phỏng) */
window.addUser = function(event) {
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
    console.log(`Đã thêm người dùng mới: ${name} (${email})`);
}

/** Xử lý chỉnh sửa người dùng (Mô phỏng) */
window.editUser = function(id) {
    console.log(`Chỉnh sửa người dùng ID: ${id}`);
    // TODO: Triển khai logic load form chỉnh sửa
}

/** Khóa/Mở khóa người dùng (Mô phỏng) */
window.toggleUserStatus = function(id) {
    const user = mockUsers.find(u => u.id == id);
    if (user) {
        user.status = user.status === 'Active' ? 'Inactive' : 'Active';
        renderUserManagement();
        console.log(`Người dùng ID ${id} đã được chuyển trạng thái sang: ${user.status}`);
    }
}

// ----------------------------------------------------
// 3. Cài đặt hệ thống (Settings)
// ----------------------------------------------------

/**
 * Xử lý lưu các thiết lập hệ thống (Mô phỏng).
 */
window.handleSaveSettings = function(event) {
    event.preventDefault();
    
    const settings = {
        apiUrlPredict: document.getElementById('apiUrlPredict').value,
        apiUrlRetrain: document.getElementById('apiUrlRetrain').value,
        dbHost: document.getElementById('dbHost').value,
        dbName: document.getElementById('dbName').value,
        assetPerPage: document.getElementById('assetPerPage').value,
        warningThreshold: document.getElementById('warningThreshold').value,
    };

    console.log("Đang lưu Cài đặt hệ thống...");
    console.log("Cài đặt đã lưu:", settings);
    
    console.warn("Lưu thành công! (Cần thay thế bằng Modal UI)");
}

// ===================================================================
// --- GLOBAL INIT ---
// ===================================================================

// Ghi đè alert/confirm để chuyển cảnh báo sang Console thay vì Pop-up (tuân thủ nguyên tắc Canvas)
window.confirm = (message) => {
    console.warn(`Lệnh confirm("${message}") đã được gọi. Cần thay bằng Modal UI.`);
    return true;
};
window.alert = (message) => {
    console.warn(`Lệnh alert("${message}") đã được gọi. Cần thay bằng Modal UI.`);
};

// Khởi tạo ứng dụng khi DOM đã tải xong
document.addEventListener('DOMContentLoaded', initializeApp);
