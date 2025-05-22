# 591 租屋列表過濾 Chrome 擴充套件 開發計畫

## 目標
- 在 `https://rent.591.com.tw/list` 網頁上，使用者可以「移除」特定房屋物件，
 使之即時不顯示，且重新載入或下次造訪時 *不再* 顯示相同物件。

## 功能需求
1. 在列表頁載入時，讀取已標記移除的物件清單並隱藏對應元素。
2. 在每個房屋物件區塊新增「移除」按鈕，點擊後立即隱藏該區塊，並將物件 ID 儲存至本地紀錄。
3. 提供選項頁面（Options Page），可檢視/還原已移除的物件清單（可選功能）。

## 技術選型
- **Manifest v3**：使用 Chrome 擴充套件新規範
- **Content Script**：解析並操作 `rent.591.com.tw/list` 頁面 DOM
- **Chrome Storage API**：`chrome.storage.local` 作為本地儲存
- **Options Page**（選用）：管理已移除清單

## 專案結構 (初步)
```
591-filter-extension/
├── manifest.json
├── content-script.js
├── options.html      # 選用：管理 UI
├── options.js        # 選用：Options Page 腳本
└── README.md         # 本計畫說明
```

## 開發階段

1. **第一階段：核心功能實作**
   - 建立 Content Script，於租屋列表頁面注入「移除」按鈕。
   - 點擊按鈕後於 UI 即時隱藏該物件。

2. **第二階段：持久化存儲**
   - 使用 `chrome.storage.local` 儲存已移除的物件 ID。
   - 實現頁面重載或下次訪問時自動隱藏這些項目。

3. **第三階段：管理介面與優化**
   - (選用) 開發 Options Page，提供移除清單的檢視與還原功能。
   - UI/UX 和性能優化，並擴展至更多頁面或過濾條件。

## 詳細開發步驟
1. **初始化專案**  
   - 建立專案資料夾並加入 `manifest.json`  
   - 驗證 Manifest v3 設定與權限（`content_scripts`、`storage`）

2. **實作 Content Script**  
   - Content Script 注入指定網域/路徑  
   - 掃描所有房屋物件區塊，為每筆物件新增「移除」按鈕  
   - 提取物件唯一識別（例：房屋編號、data-id）

3. **移除與儲存邏輯**  
   - 點擊「移除」時，從畫面上移除該區塊  
   - 將該物件 ID 推入 `chrome.storage.local`，持久化儲存

4. **頁面載入時隱藏已移除項目**  
   - Content Script 啟動時先讀取儲存紀錄 (`chrome.storage.local.get`)  
   - 隱藏符合 ID 的 DOM 區塊

5. **(選用) Options Page**  
   - 建立 HTML 與 JS，顯示/移除已標記清單  
   - 支援還原功能，移除儲存紀錄中的 ID，立即生效

## 測試與調試
1. 使用 Chrome 或 Edge 載入 Unpacked Extension  
2. 在 DevTools Console 檢查 `chrome.storage.local` 資料  
3. 測試「移除」按鈕及還原功能，確認行為正常

## 未來優化方向
- 加入搜尋與關鍵字過濾功能  
- 支援更多 591 房屋相關頁面 (如搜尋結果、地圖模式)  
- UI/UX 美化與自訂樣式