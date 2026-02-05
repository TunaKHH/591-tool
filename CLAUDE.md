# 591-tool 專案指引

## 專案概述
Chrome 擴充套件（Manifest v3），用於在 591 租屋列表頁面注入「移除」按鈕，隱藏不想看的物件並持久化儲存。

## Chrome 擴充套件測試方式

Chrome 擴充套件無法直接用測試框架驗證，使用 **Playwright MCP** 模擬注入來測試：

### 步驟
1. **開啟目標網站**: `browser_navigate` 到 `https://rent.591.com.tw/list`
2. **分析 DOM 結構**: `browser_evaluate` 檢查實際的 CSS class、data 屬性、DOM 層級
3. **注入腳本驗證**: `browser_evaluate` 模擬 content-script 的核心邏輯（跳過 `chrome.storage` API）
4. **驗證注入結果**: 檢查按鈕數量、位置、可見性
5. **模擬互動測試**: 用 `dispatchEvent` 觸發 click，驗證隱藏行為和頁面是否跳轉
6. **截圖確認**: `browser_take_screenshot` 視覺化驗證

### 驗證重點
- 選擇器是否匹配到正確數量的元素
- 按鈕是否可見（`rect.width > 0 && rect.height > 0`）
- 點擊後物件是否隱藏（`offsetHeight === 0`）
- 點擊後頁面是否未跳轉（`window.location.href` 不變）
- wrapper 的 `display` 是否設為 `none`

### 注意事項
- Playwright 瀏覽器沒有安裝擴充套件，所以 `chrome.storage` API 不可用，測試時需跳過
- 591 是 Vue SPA，DOM 結構可能隨版本更新變化，需要先分析再寫選擇器
- 591 的 Vue 會在整個卡片上綁定 click 事件，按鈕需要在 capture 階段攔截事件

## 591 網站 DOM 結構（2026-02 已驗證）

```
main
  ├── div.tabs
  ├── div.list-sort
  ├── div (無 class, data-v-xxx)          ← 外層包裝，每個物件一個
  │     └── div.item[data-id="20628481"]  ← 房屋卡片，30 個/頁
  │           ├── div.item-img            ← position: relative, overflow: hidden
  │           └── div.item-info           ← position: relative
  │                 ├── div.item-info-title
  │                 │     └── a.link[href="https://rent.591.com.tw/20628481"]
  │                 ├── div.item-info-fav
  │                 └── div.item-info-flex
  │                       ├── div.item-info-left
  │                       └── div.item-info-price
  └── div.paginator-wrapper
```

- 精確選擇器: `main .item[data-id]`
- ID 來源: `data-id` 屬性
- 連結格式: `https://rent.591.com.tw/{id}`（不是 `/rent-detail/{id}`）
