console.log('✅ main.js 載入成功');

// 1. 等待 DOM 載入完成，初始化 UI
window.addEventListener('DOMContentLoaded', () => {});

async function loadCourses() {
  checkLoginExpired(); // 檢查登入是否過期
  await renderCourseList(); // 從資料庫抓課程
  setupUploadButton(); // 綁定上傳跳轉按鈕
}
