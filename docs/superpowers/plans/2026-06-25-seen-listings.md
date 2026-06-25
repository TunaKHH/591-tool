# 「已看過」物件標記 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 591 列表頁點進物件詳情後,該物件回到列表時自動淡化或隱藏,讓使用者每次回來只看還沒看過的。

**Architecture:** 純 Manifest v3 content script + options page,無建置工具、無框架。在列表頁用 capture 階段攔截「點進詳情」的點擊,把物件 ID 寫進 `chrome.storage.local`;列表渲染時依設定對 seen 物件加淡化 class 或隱藏。選項頁新增「已移除 / 已看過」分頁與「淡化 / 隱藏」設定。所有資料純本地。

**Tech Stack:** Vanilla JS、Chrome Extension MV3(`storage` 權限)、`chrome.storage.local`、`MutationObserver`、`chrome.storage.onChanged`。

## Global Constraints

- Manifest version: 維持 `manifest_version: 3`;`version` 由 `1.5` → `1.6`(本次發布)。
- 權限不得新增:維持 `"permissions": ["storage"]`,不得加 host_permissions 或其他權限。
- content script 只在 `https://rent.591.com.tw/list*` 執行(現有 `matches`,不變)。
- 純本地:任何資料不得離開裝置(無 fetch、無外部端點)。
- UI 文案一律繁體中文。
- 不破壞現有「移除」功能;`removed*` 三組 key 的形狀與行為維持不變。
- 沿用既有命名慣例:`seenItems`(陣列)、`seenTimestamps`({id:ts})、`seenItemNames`({id:name}),與 `removed*` 對稱。
- 設定存於 `chrome.storage.local` 的 `settings` 物件,`settings.seenMode` 取值 `'fade'`(預設)或 `'hide'`。
- seen 保留期 90 天:常數 `SEEN_RETENTION_MS = 90 * 24 * 60 * 60 * 1000`。

## 測試方式說明(重要)

本專案**無自動化測試框架、無 package.json、無建置流程**,且所有邏輯都緊耦合 DOM 與
`chrome.*` API(content script IIFE + options DOM)。導入 jsdom/jest 並 mock 整套
chrome API 與此微型擴充不成比例,且違反「沿用既有模式」原則(現況即靠手動驗證)。

因此每個 Task 的「測試循環」採**載入未封裝擴充 + 真實 591 列表頁手動驗證**,並用
**選項頁 console 檢查 `chrome.storage.local`** 確認狀態。每個 Task 結尾都有一組具體、
可獨立驗收的手動步驟。

通用重載流程(每次改檔後)：
1. 開 `chrome://extensions`,開啟右上「開發人員模式」。
2. 首次:「載入未封裝項目」選擇 `~/develop/personal/projects/591-tool/` 資料夾;
   之後每次改檔按該擴充卡片上的「↻ 重新載入」。
3. 開 `https://rent.591.com.tw/list`(隨意帶篩選),驗證行為。
4. 檢查 storage:開擴充選項頁(擴充卡片「詳細資料 → 擴充功能選項」或點列表頁右下
   齒輪),在選項頁 DevTools console 執行 `chrome.storage.local.get(null, console.log)`。

---

### Task 1: seen 儲存 + 點擊標記(content script)+ 版本號

**Files:**
- Modify: `content-script.js`(在 IIFE 內、`getRemovedItems` 函式之後新增 seen 相關函式;檔尾啟動區新增事件監聽)
- Modify: `manifest.json:4`(version 1.5 → 1.6)

**Interfaces:**
- Consumes: 既有 `extractItemId(itemElement)`、`extractItemTitle(itemElement)`。
- Produces:
  - `saveSeenItem(itemId: string, itemTitle: string|null): void` — 寫入 `seenItems`/`seenTimestamps`/`seenItemNames`。
  - `getSeenItems(callback: (ids: string[]) => void): void`
  - 常數 `SEEN_RETENTION_MS: number`
  - storage 形狀:`seenItems: string[]`、`seenTimestamps: {[id]:number}`、`seenItemNames: {[id]:string}`、`settings: {seenMode: 'fade'|'hide'}`

- [ ] **Step 1: 加入版本號 bump**

`manifest.json` 第 4 行：

```json
  "version": "1.6",
```

- [ ] **Step 2: 新增 seen 儲存函式**

在 `content-script.js` 中,`getRemovedItems`(目前結尾在第 37 行 `}`)之後、`extractItemId` 之前,插入：

```js
  // ===== 「已看過」功能 =====
  const SEEN_RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // 90 天

  // 儲存已看過的物件
  function saveSeenItem(itemId, itemTitle) {
    chrome.storage.local.get(['seenItems', 'seenTimestamps', 'seenItemNames'], (result) => {
      const seenItems = result.seenItems || [];
      const seenTimestamps = result.seenTimestamps || {};
      const seenItemNames = result.seenItemNames || {};
      if (!seenItems.includes(itemId)) {
        seenItems.push(itemId);
      }
      seenTimestamps[itemId] = Date.now();
      if (itemTitle) {
        seenItemNames[itemId] = itemTitle;
      }
      chrome.storage.local.set({ seenItems, seenTimestamps, seenItemNames });
    });
  }

  // 取得已看過的物件 ID
  function getSeenItems(callback) {
    chrome.storage.local.get(['seenItems'], (result) => {
      callback(result.seenItems || []);
    });
  }
```

- [ ] **Step 3: 新增「點進詳情即標記」事件監聽**

在 `content-script.js` 檔尾、IIFE 結束 `})();` 之前(現第 282 行 `}` 之後)插入：

```js
  // 攔截「點進物件詳情」→ 標記為已看過(capture 階段,先於 Vue 處理)
  function handleListingOpen(e) {
    // 略過自家「移除」按鈕
    if (e.target.closest && e.target.closest('.remove-591-btn')) return;
    // 必須點在指向物件詳情的連結上
    const link = e.target.closest ? e.target.closest('a[href]') : null;
    if (!link) return;
    const href = link.getAttribute('href') || '';
    const isDetail = /rent\.591\.com\.tw\/\d+/.test(href)
      || /\/rent-detail\/\d+/.test(href)
      || /^\/\d+(?:$|[/?#])/.test(href);
    if (!isDetail) return;
    const item = (e.target.closest('.item[data-id]')) || link.closest('.item[data-id]');
    if (!item) return;
    const itemId = extractItemId(item);
    if (!itemId) return;
    saveSeenItem(itemId, extractItemTitle(item));
  }

  document.addEventListener('click', handleListingOpen, true);
  document.addEventListener('auxclick', handleListingOpen, true); // 中鍵開新分頁
```

- [ ] **Step 4: 重載並驗證標記寫入**

依「通用重載流程」重載擴充 → 開 `https://rent.591.com.tw/list`。
1. 左鍵點一個物件進詳情頁,再按瀏覽器上一頁回到列表。
2. 中鍵點另一個物件(開新分頁)。
3. 開選項頁 console 執行 `chrome.storage.local.get(null, console.log)`。

Expected:
- `seenItems` 含剛剛點的兩個物件 ID。
- `seenTimestamps` 有對應時間戳;`seenItemNames` 有對應名稱。
- `removedItems` 不受影響(若先前有資料仍在)。

- [ ] **Step 5: Commit**

```bash
cd ~/develop/personal/projects/591-tool
git add content-script.js manifest.json
git commit -m "feat(seen): 點進物件詳情即標記為已看過 + 版本號 1.6"
```

---

### Task 2: 列表淡化 / 隱藏已看過物件(content script)

**Files:**
- Modify: `content-script.js`(新增 `itemWrapper`、`ensureSeenStyle`、`applySeenTreatment`;接進啟動區、MutationObserver、`storage.onChanged`)

**Interfaces:**
- Consumes: `findHouseItems()`、`extractItemId()`、`hideItem()`、`getSeenItems`(Task 1)、`settings.seenMode`。
- Produces:
  - `itemWrapper(itemElement: Element): Element` — 回傳實際要隱藏/顯示的外層元素(與 `hideItem` 的 target 邏輯一致)。
  - `applySeenTreatment(): void` — 依設定對 seen 且未 removed 的物件加 `.seen-591-faded` 或隱藏。
  - CSS class `.seen-591-faded`(opacity 0.4 + 灰階)。

- [ ] **Step 1: 新增 wrapper 輔助與淡化樣式**

在 `content-script.js` 的 `hideItem` 函式(現第 86–104 行)**之前**插入：

```js
  // 取得實際要隱藏/顯示的外層元素(與 hideItem 的 target 判斷一致)
  function itemWrapper(itemElement) {
    return (itemElement.parentElement && itemElement.parentElement.parentElement === document.querySelector('main'))
      ? itemElement.parentElement
      : itemElement;
  }

  // 注入淡化樣式(只注入一次)
  function ensureSeenStyle() {
    if (document.getElementById('seen-591-style')) return;
    const style = document.createElement('style');
    style.id = 'seen-591-style';
    style.textContent = '.seen-591-faded{opacity:0.4 !important;filter:grayscale(0.8) !important;transition:opacity 0.2s ease, filter 0.2s ease;}';
    (document.head || document.documentElement).appendChild(style);
  }
```

- [ ] **Step 2: 新增 applySeenTreatment**

在 `hideRemovedItems` 函式(現第 107–119 行)**之後**插入：

```js
  // 依設定對「已看過」物件套用淡化或隱藏(已移除的交給 hideRemovedItems)
  function applySeenTreatment() {
    chrome.storage.local.get(['seenItems', 'removedItems', 'settings'], (result) => {
      const seenItems = result.seenItems || [];
      const removedItems = result.removedItems || [];
      const seenMode = (result.settings && result.settings.seenMode === 'hide') ? 'hide' : 'fade';
      if (seenItems.length === 0) return;
      ensureSeenStyle();

      const houseItems = findHouseItems();
      houseItems.forEach(item => {
        const itemId = extractItemId(item);
        if (!itemId) return;
        if (removedItems.includes(itemId)) return; // 已移除 → 不碰,由 hideRemovedItems 隱藏

        if (seenItems.includes(itemId)) {
          if (seenMode === 'hide') {
            item.classList.remove('seen-591-faded');
            hideItem(item);
          } else {
            // 淡化:還原可能殘留的隱藏,加上淡化 class
            itemWrapper(item).style.display = '';
            item.classList.add('seen-591-faded');
          }
        } else {
          // 不是 seen(例如已從選項頁還原)→ 清除淡化殘留
          item.classList.remove('seen-591-faded');
        }
      });
    });
  }
```

- [ ] **Step 3: 接進啟動區、MutationObserver、storage 監聽**

(a) 啟動區(現第 258–262 行)改為:

```js
  setTimeout(() => {
    hideRemovedItems();
    setTimeout(() => { processItemElements(); applySeenTreatment(); }, 500);
    setTimeout(addOptionsButton, 1000);
  }, 1500);
```

(b) MutationObserver 的 debounce 回呼(現第 268–274 行)改為:

```js
    debounceTimer = setTimeout(() => {
      hideRemovedItems();
      processItemElements();
      applySeenTreatment();
      if (!document.getElementById('591-options-btn')) {
        addOptionsButton();
      }
    }, 500);
```

(c) 在 IIFE 檔尾(Task 1 新增的事件監聽之後)插入即時重套:

```js
  // 設定或清單變動 → 即時重套(免重整)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.seenItems || changes.removedItems || changes.settings) {
      applySeenTreatment();
    }
  });
```

- [ ] **Step 4: 重載並驗證淡化**

重載擴充 → 開 `https://rent.591.com.tw/list`。沿用 Task 1 已標記的 seen 物件(若已清掉,先點一個物件再返回)。重整列表頁。

Expected:
- 先前點過的物件在列表上呈**半透明 + 灰階**(預設 fade 模式),其他物件正常。
- 已用紅色「移除」鈕移除的物件仍是**完全不見**(不是淡化)。
- 捲動載入更多 / 切換篩選後,淡化規則仍正確套用到新出現的卡片。

- [ ] **Step 5: 暫時手動驗證 hide 模式(設定頁 UI 尚未做)**

在選項頁 console 執行:

```js
chrome.storage.local.set({ settings: { seenMode: 'hide' } });
```

回列表頁(免重整,storage.onChanged 會觸發)。Expected:已看過物件**完全隱藏**。
再執行 `chrome.storage.local.set({ settings: { seenMode: 'fade' } })`,Expected:回到淡化。

- [ ] **Step 6: Commit**

```bash
cd ~/develop/personal/projects/591-tool
git add content-script.js
git commit -m "feat(seen): 列表依設定淡化或隱藏已看過物件,並即時重套"
```

---

### Task 3: 90 天自動清理(content script)

**Files:**
- Modify: `content-script.js`(新增 `pruneOldSeen`,於啟動時呼叫)

**Interfaces:**
- Consumes: `SEEN_RETENTION_MS`(Task 1)。
- Produces: `pruneOldSeen(): void` — 移除 `seenTimestamps` 早於 90 天的項目(連同 names)。

- [ ] **Step 1: 新增 pruneOldSeen**

在 `applySeenTreatment`(Task 2)之後插入：

```js
  // 清理超過保留期(90 天)的已看過紀錄
  function pruneOldSeen() {
    chrome.storage.local.get(['seenItems', 'seenTimestamps', 'seenItemNames'], (result) => {
      const seenItems = result.seenItems || [];
      const seenTimestamps = result.seenTimestamps || {};
      const seenItemNames = result.seenItemNames || {};
      if (seenItems.length === 0) return;

      const cutoff = Date.now() - SEEN_RETENTION_MS;
      const kept = seenItems.filter(id => (seenTimestamps[id] || 0) >= cutoff);
      if (kept.length === seenItems.length) return; // 無可清理

      const keptTimestamps = {};
      const keptNames = {};
      kept.forEach(id => {
        if (seenTimestamps[id] != null) keptTimestamps[id] = seenTimestamps[id];
        if (seenItemNames[id] != null) keptNames[id] = seenItemNames[id];
      });
      chrome.storage.local.set({ seenItems: kept, seenTimestamps: keptTimestamps, seenItemNames: keptNames });
    });
  }
```

- [ ] **Step 2: 啟動時呼叫**

把啟動區(Task 2 Step 3a 改過的版本)的第一行 `hideRemovedItems();` 改為:

```js
    pruneOldSeen();
    hideRemovedItems();
```

- [ ] **Step 3: 重載並驗證清理**

在選項頁 console 注入一筆「91 天前」的假紀錄:

```js
const old = Date.now() - 91*24*60*60*1000;
chrome.storage.local.set({ seenItems: ['old-test-id'], seenTimestamps: { 'old-test-id': old }, seenItemNames: { 'old-test-id': '過期測試' } });
```

重整 `https://rent.591.com.tw/list`(觸發啟動清理),再回選項頁 console 執行
`chrome.storage.local.get('seenItems', console.log)`。

Expected:`seenItems` 不再含 `'old-test-id'`(已被清理)。
反向驗證:注入一筆「89 天前」的紀錄,重整後**仍在**。

- [ ] **Step 4: Commit**

```bash
cd ~/develop/personal/projects/591-tool
git add content-script.js
git commit -m "feat(seen): 啟動時自動清理超過 90 天的已看過紀錄"
```

---

### Task 4: 選項頁 — 分頁 + 設定開關 + 已看過清單管理

**Files:**
- Modify: `options.html`(nav 版本、page-header、新增設定卡與分頁、stats label/time header 加 id、新增 tab/設定 CSS)
- Modify: `options.js`(整檔改為分頁感知:資料來源依 `currentTab` 切換 `removed*`/`seen*`)

**Interfaces:**
- Consumes: storage keys `removed*`、`seen*`、`settings.seenMode`(Task 1–3 已定義)。
- Produces:
  - `TAB_KEYS = { removed: {items,ts,names}, seen: {items,ts,names} }`
  - 分頁狀態 `currentTab: 'removed'|'seen'`,UI 元素 `.tab-btn[data-tab]`、`#seen-mode-select`。
  - export 產生的 JSON 含 `removed*` 與 `seen*` 全部六組 key(Task 5 會用到此形狀)。

- [ ] **Step 1: options.html — 版本號**

`options.html:509`：

```html
      <span class="nav-version">v1.6</span>
```

- [ ] **Step 2: options.html — page-header 換成設定卡 + 分頁**

把現有區塊(現第 514–517 行)：

```html
    <div class="page-header">
      <h1 class="page-title">已移除物件</h1>
      <p class="page-description">管理您在 591 租屋列表中隱藏的物件</p>
    </div>
```

替換為：

```html
    <div class="page-header">
      <h1 class="page-title">物件管理</h1>
      <p class="page-description">管理您在 591 租屋列表中標記的物件</p>
    </div>

    <div class="settings-card">
      <label class="settings-label" for="seen-mode-select">已看過的物件在列表上要</label>
      <select id="seen-mode-select" class="settings-select">
        <option value="fade">淡化顯示</option>
        <option value="hide">完全隱藏</option>
      </select>
    </div>

    <div class="tabs">
      <button class="tab-btn active" data-tab="removed">已移除</button>
      <button class="tab-btn" data-tab="seen">已看過</button>
    </div>
```

- [ ] **Step 3: options.html — stats label 與時間表頭加 id**

stats label(現第 521 行)：

```html
        <div class="stat-label" id="stats-label">已移除物件數量</div>
```

時間表頭(現第 562 行)：

```html
              <th class="col-time sorted" data-sort="time" id="time-col-header">移除時間 <span class="sort-icon">↓</span></th>
```

- [ ] **Step 4: options.html — 新增 CSS**

在 `<style>` 內 `/* Responsive */`(現第 461 行附近)**之前**插入：

```css
    /* Settings card */
    .settings-card {
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: 16px 20px;
      margin-bottom: 16px;
    }

    .settings-label {
      font-size: 14px;
      color: var(--color-text-primary);
      font-weight: 500;
    }

    .settings-select {
      padding: 8px 12px;
      font-size: 14px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      color: var(--color-text-primary);
      cursor: pointer;
    }

    /* Tabs */
    .tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 16px;
    }

    .tab-btn {
      background: transparent;
      color: var(--color-text-secondary);
      border: 1px solid transparent;
      border-radius: var(--radius-md);
      padding: 8px 16px;
      font-size: 14px;
      font-weight: 500;
    }

    .tab-btn:hover {
      background: var(--color-bg);
      color: var(--color-text-primary);
    }

    .tab-btn.active {
      background: var(--color-primary-light);
      color: var(--color-primary);
      border-color: var(--color-primary);
    }
```

- [ ] **Step 5: options.js — 整檔替換為分頁感知版本**

將 `options.js` **整檔**替換為以下內容：

```js
// options.js - 591 租屋列表過濾選項頁面
document.addEventListener('DOMContentLoaded', function () {
  // 分頁 ↔ storage key 對應
  const TAB_KEYS = {
    removed: { items: 'removedItems', ts: 'removedTimestamps', names: 'removedItemNames' },
    seen: { items: 'seenItems', ts: 'seenTimestamps', names: 'seenItemNames' },
  };
  const TAB_LABELS = {
    removed: { stat: '已移除物件數量', time: '移除時間', emptyTitle: '目前沒有已移除的物件', emptyText: '在 591 租屋列表中點擊「移除」按鈕來隱藏物件' },
    seen: { stat: '已看過物件數量', time: '查看時間', emptyTitle: '目前沒有已看過的物件', emptyText: '在 591 租屋列表中點進物件詳情就會自動記錄' },
  };

  // DOM
  const statsNumberElement = document.getElementById('stats-number');
  const statsLabelElement = document.getElementById('stats-label');
  const timeColHeader = document.getElementById('time-col-header');
  const itemsContainer = document.getElementById('items-container');
  const refreshBtn = document.getElementById('refresh-btn');
  const clearAllBtn = document.getElementById('clear-all-btn');
  const exportBtn = document.getElementById('export-btn');
  const importBtn = document.getElementById('import-btn');
  const importFileInput = document.getElementById('import-file');
  const searchInput = document.getElementById('search-input');
  const spinner = document.getElementById('spinner');
  const tabButtons = document.querySelectorAll('.tab-btn');
  const seenModeSelect = document.getElementById('seen-mode-select');

  // 狀態
  let currentTab = 'removed';
  let allItems = [];
  let allTimestamps = {};
  let allItemNames = {};
  let currentSortField = 'time';
  let currentSortOrder = 'desc';

  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => { clearTimeout(timeout); func(...args); };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  function showSpinner() { spinner.style.display = 'block'; }
  function hideSpinner() { spinner.style.display = 'none'; }
  function updateTotalCount(count) { statsNumberElement.textContent = count; }

  // 載入目前分頁的資料
  function loadItems() {
    showSpinner();
    const k = TAB_KEYS[currentTab];
    chrome.storage.local.get([k.items, k.ts, k.names], function (result) {
      hideSpinner();
      allItems = result[k.items] || [];
      allTimestamps = result[k.ts] || {};
      allItemNames = result[k.names] || {};
      updateTotalCount(allItems.length);
      searchItems();
    });
  }

  function sortItems(items) {
    return [...items].sort((a, b) => {
      let comparison = 0;
      if (currentSortField === 'time') {
        comparison = (allTimestamps[a] || 0) - (allTimestamps[b] || 0);
      } else if (currentSortField === 'name') {
        const aName = (allItemNames[a] || `物件 ID: ${a}`).toLowerCase();
        const bName = (allItemNames[b] || `物件 ID: ${b}`).toLowerCase();
        comparison = aName.localeCompare(bName, 'zh-TW');
      }
      return currentSortOrder === 'asc' ? comparison : -comparison;
    });
  }

  function updateSortIcons() {
    const headers = document.querySelectorAll('.items-table th[data-sort]');
    headers.forEach(th => {
      const sortIcon = th.querySelector('.sort-icon');
      th.classList.remove('sorted');
      if (sortIcon) sortIcon.textContent = '↕';
      if (th.dataset.sort === currentSortField) {
        th.classList.add('sorted');
        if (sortIcon) sortIcon.textContent = currentSortOrder === 'asc' ? '↑' : '↓';
      }
    });
  }

  function displayItems(items) {
    itemsContainer.innerHTML = '';
    const labels = TAB_LABELS[currentTab];

    if (items.length === 0) {
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = `
        <td colspan="3">
          <div class="empty-state">
            <div class="empty-icon">📭</div>
            <div class="empty-title">${labels.emptyTitle}</div>
            <div class="empty-text">${labels.emptyText}</div>
          </div>
        </td>
      `;
      itemsContainer.appendChild(emptyRow);
      return;
    }

    const sortedItems = sortItems(items);
    sortedItems.forEach(itemId => {
      const tr = document.createElement('tr');
      tr.dataset.id = itemId;

      const tdName = document.createElement('td');
      tdName.className = 'col-name';
      const itemName = allItemNames[itemId];
      const nameDiv = document.createElement('div');
      nameDiv.className = 'item-name';

      if (!isNaN(Number(itemId))) {
        nameDiv.textContent = itemName || `物件 ID: ${itemId}`;
        const linkDiv = document.createElement('div');
        linkDiv.className = 'item-link';
        const itemLink = document.createElement('a');
        itemLink.href = `https://rent.591.com.tw/${itemId}`;
        itemLink.textContent = `rent.591.com.tw/${itemId}`;
        itemLink.target = '_blank';
        linkDiv.appendChild(itemLink);
        tdName.appendChild(nameDiv);
        tdName.appendChild(linkDiv);
      } else if (itemId.startsWith('hash_')) {
        nameDiv.textContent = itemName || `雜湊物件: ${itemId.substring(5, 15)}...`;
        tdName.appendChild(nameDiv);
        const linkDiv = document.createElement('div');
        linkDiv.className = 'item-link';
        linkDiv.textContent = '自動產生的雜湊 ID';
        tdName.appendChild(linkDiv);
      } else {
        nameDiv.textContent = itemName || `其他 ID: ${itemId}`;
        tdName.appendChild(nameDiv);
      }

      const tdTime = document.createElement('td');
      tdTime.className = 'col-time';
      const timestamp = allTimestamps[itemId];
      tdTime.textContent = timestamp ? formatDateTime(new Date(timestamp)) : '未記錄';

      const tdActions = document.createElement('td');
      tdActions.className = 'col-actions';
      const restoreButton = document.createElement('button');
      restoreButton.className = 'btn-ghost';
      restoreButton.textContent = '還原';
      restoreButton.addEventListener('click', () => { restoreItem(itemId); });
      tdActions.appendChild(restoreButton);

      tr.appendChild(tdName);
      tr.appendChild(tdTime);
      tr.appendChild(tdActions);
      itemsContainer.appendChild(tr);
    });
  }

  function handleSortClick(e) {
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    const field = th.dataset.sort;
    if (currentSortField === field) {
      currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      currentSortField = field;
      currentSortOrder = field === 'time' ? 'desc' : 'asc';
    }
    updateSortIcons();
    searchItems();
  }

  // 還原(從目前分頁移除一筆)
  function restoreItem(itemId) {
    showSpinner();
    const k = TAB_KEYS[currentTab];
    chrome.storage.local.get([k.items, k.ts, k.names], function (result) {
      const items = (result[k.items] || []).filter(id => id !== itemId);
      const ts = result[k.ts] || {};
      const names = result[k.names] || {};
      delete ts[itemId];
      delete names[itemId];
      chrome.storage.local.set({ [k.items]: items, [k.ts]: ts, [k.names]: names }, function () {
        hideSpinner();
        allItems = items;
        allTimestamps = ts;
        allItemNames = names;
        updateTotalCount(items.length);
        searchItems();
      });
    });
  }

  // 清空目前分頁
  function clearAllItems() {
    const labels = TAB_LABELS[currentTab];
    if (confirm(`確定要清除所有${currentTab === 'seen' ? '已看過' : '已移除'}的物件嗎？此操作無法還原。`)) {
      showSpinner();
      const k = TAB_KEYS[currentTab];
      chrome.storage.local.set({ [k.items]: [], [k.ts]: {}, [k.names]: {} }, function () {
        hideSpinner();
        allItems = [];
        allTimestamps = {};
        allItemNames = {};
        updateTotalCount(0);
        displayItems([]);
      });
    }
  }

  function searchItems() {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) { displayItems(allItems); return; }
    const filtered = allItems.filter(itemId => {
      if (itemId.toLowerCase().includes(query)) return true;
      const name = allItemNames[itemId];
      return name && name.toLowerCase().includes(query);
    });
    displayItems(filtered);
    if (filtered.length === 0 && allItems.length > 0) {
      const noResults = document.createElement('tr');
      noResults.innerHTML = `
        <td colspan="3">
          <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <div class="empty-title">沒有符合的搜尋結果</div>
            <div class="empty-text">試試其他關鍵字</div>
          </div>
        </td>
      `;
      itemsContainer.appendChild(noResults);
    }
  }

  // 匯出(同時含已移除與已看過)
  function exportData() {
    chrome.storage.local.get(
      ['removedItems', 'removedTimestamps', 'removedItemNames', 'seenItems', 'seenTimestamps', 'seenItemNames'],
      function (result) {
        const payload = {
          removedItems: result.removedItems || [],
          removedTimestamps: result.removedTimestamps || {},
          removedItemNames: result.removedItemNames || {},
          seenItems: result.seenItems || [],
          seenTimestamps: result.seenTimestamps || {},
          seenItemNames: result.seenItemNames || {},
        };
        const dataBlob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = `591_過濾資料_${formatDate(new Date())}.json`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
      }
    );
  }

  // 匯入(向後相容:舊檔只有 removed*)
  function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data.removedItems) && !Array.isArray(data.seenItems)) {
          alert('匯入的檔案格式不正確！');
          return;
        }
        const removedCount = Array.isArray(data.removedItems) ? data.removedItems.length : 0;
        const seenCount = Array.isArray(data.seenItems) ? data.seenItems.length : 0;
        if (!confirm(`確定要匯入 ${removedCount} 個已移除、${seenCount} 個已看過的物件嗎？`)) return;
        showSpinner();
        chrome.storage.local.get(
          ['removedItems', 'removedTimestamps', 'removedItemNames', 'seenItems', 'seenTimestamps', 'seenItemNames'],
          function (result) {
            const merged = {
              removedItems: [...new Set([...(result.removedItems || []), ...(data.removedItems || [])])],
              removedTimestamps: { ...(result.removedTimestamps || {}), ...(data.removedTimestamps || {}) },
              removedItemNames: { ...(result.removedItemNames || {}), ...(data.removedItemNames || {}) },
              seenItems: [...new Set([...(result.seenItems || []), ...(data.seenItems || [])])],
              seenTimestamps: { ...(result.seenTimestamps || {}), ...(data.seenTimestamps || {}) },
              seenItemNames: { ...(result.seenItemNames || {}), ...(data.seenItemNames || {}) },
            };
            chrome.storage.local.set(merged, function () {
              hideSpinner();
              loadItems();
              alert(`匯入完成！已移除 ${merged.removedItems.length} 個、已看過 ${merged.seenItems.length} 個。`);
            });
          }
        );
      } catch (error) {
        alert('匯入失敗：' + error.message);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatDateTime(date) {
    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
  }

  // 切換分頁
  function switchTab(tab) {
    if (tab === currentTab) return;
    currentTab = tab;
    tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    const labels = TAB_LABELS[tab];
    statsLabelElement.textContent = labels.stat;
    timeColHeader.childNodes[0].nodeValue = labels.time + ' ';
    searchInput.value = '';
    loadItems();
  }

  // 設定:已看過模式
  function loadSeenMode() {
    chrome.storage.local.get(['settings'], function (result) {
      const mode = (result.settings && result.settings.seenMode === 'hide') ? 'hide' : 'fade';
      seenModeSelect.value = mode;
    });
  }

  function saveSeenMode() {
    chrome.storage.local.get(['settings'], function (result) {
      const settings = result.settings || {};
      settings.seenMode = seenModeSelect.value === 'hide' ? 'hide' : 'fade';
      chrome.storage.local.set({ settings });
    });
  }

  // 事件綁定
  refreshBtn.addEventListener('click', loadItems);
  clearAllBtn.addEventListener('click', clearAllItems);
  exportBtn.addEventListener('click', exportData);
  importBtn.addEventListener('click', () => importFileInput.click());
  importFileInput.addEventListener('change', importData);
  tabButtons.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  seenModeSelect.addEventListener('change', saveSeenMode);

  document.getElementById('items-table').querySelector('thead').addEventListener('click', handleSortClick);

  const debouncedSearch = debounce(searchItems, 200);
  searchInput.addEventListener('input', debouncedSearch);
  searchInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') searchItems(); });

  // 初始
  loadSeenMode();
  loadItems();
});
```

- [ ] **Step 6: 重載並驗證分頁、設定、清單管理**

重載擴充 → 開選項頁(列表頁右下齒輪 或 擴充功能選項)。先確保兩種資料都有(列表頁點一個物件→返回 產生 seen;按一次紅色移除鈕 產生 removed)。重新整理選項頁。

Expected:
1. 預設在「已移除」分頁,統計標籤「已移除物件數量」、時間欄標題「移除時間」、列表為 removed 內容。
2. 點「已看過」分頁:統計變「已看過物件數量」、時間欄變「查看時間」、列表換成 seen 內容;名稱、連結、排序、搜尋都正常。
3. 在「已看過」分頁按某列「還原」→ 該列消失;回列表頁該物件不再淡化(storage.onChanged 即時)。
4. 在「已看過」分頁按「清除全部」→ 確認後清空。
5. 頂部下拉切「完全隱藏」→ 開著的列表頁即時改為隱藏已看過物件;切回「淡化顯示」即時還原。重整選項頁後下拉維持上次選擇。

- [ ] **Step 7: Commit**

```bash
cd ~/develop/personal/projects/591-tool
git add options.html options.js
git commit -m "feat(seen): 選項頁新增已看過分頁、淡化/隱藏設定與清單管理"
```

---

### Task 5: 匯出/匯入回歸驗證 + 文件更新

**Files:**
- Modify: `README.md`(新增「已看過」功能說明)
- 驗證(無程式改動):Task 4 已實作的 export/import 含 seen 行為

**Interfaces:**
- Consumes: Task 4 的 `exportData`/`importData`(已含 seen* 六組 key、向後相容舊檔)。

- [ ] **Step 1: 匯出/匯入 round-trip 驗證**

在選項頁:確保 removed 與 seen 都有資料 → 按「匯出」下載 JSON。
1. 用文字編輯器開該 JSON,確認同時含 `removedItems` 與 `seenItems`(及對應 timestamps/names)。
2. 回選項頁按「清除全部」清掉目前分頁,並切到另一分頁也清掉。
3. 按「匯入」選剛剛的 JSON → 確認 alert 顯示「已移除 N 個、已看過 M 個」。
4. 切換兩個分頁確認資料都復原。

Expected:removed 與 seen 都正確還原。

- [ ] **Step 2: 向後相容驗證(舊版匯出檔)**

在 console 造一個只含舊欄位的檔測試:

```js
const blob = new Blob([JSON.stringify({ removedItems: ['9999999'], removedTimestamps: { '9999999': Date.now() }, removedItemNames: { '9999999': '舊檔測試' } })], { type: 'application/json' });
const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'old.json'; a.click();
```

用「匯入」載入 `old.json`。Expected:alert 顯示「已移除 1 個、已看過 0 個」,匯入不報錯,seen 不受影響。

- [ ] **Step 3: 更新 README**

在 `README.md`「功能說明」段落(現「### 2. 選項頁面功能」之後)新增：

```markdown
### 3. 已看過標記功能
- 在列表頁點進任一物件的詳情頁(含中鍵開新分頁),該物件會被記為「已看過」
- 回到列表時,已看過的物件預設**淡化顯示**(可在選項頁改為**完全隱藏**)
- 選項頁「已看過」分頁可檢視/還原/清空已看過清單,並支援匯出/匯入
- 已看過紀錄保留 90 天後自動清理;所有資料僅存於本機
```

- [ ] **Step 4: Commit**

```bash
cd ~/develop/personal/projects/591-tool
git add README.md
git commit -m "docs: README 補充已看過標記功能說明"
```

---

## Self-Review

**1. Spec coverage**(對照設計文件 `docs/plans/2026-06-25-seen-listings-design.md`):
- 點進詳情標記 seen(含中鍵)→ Task 1 ✓
- removed 全隱藏(現有不動)、seen 依設定淡化/隱藏 → Task 2 ✓
- storage schema `seen*` 對稱 removed* → Task 1 ✓
- content script 攔截 + MutationObserver + storage.onChanged 即時 → Task 1/2 ✓
- 抓 ID 失敗跳過、不壞列表 → Task 1 `handleListingOpen` / Task 2 `applySeenTreatment` 皆 `if (!itemId) return` ✓
- 90 天自動清理 → Task 3 ✓
- 不需新權限、純本地 → 無 fetch、permissions 不變 ✓
- 選項頁設定開關(淡化/隱藏,預設淡化)→ Task 4 ✓
- 已移除/已看過分頁,沿用表格,還原/清空 → Task 4 ✓
- 匯出/匯入含 seen → Task 4 實作 + Task 5 驗證 ✓
- 範圍外(重複刊登去重、自動淡化)→ 未納入 ✓

**2. Placeholder scan:** 無 TBD/TODO;所有程式步驟均含完整程式碼;所有驗證步驟含具體指令與預期結果。

**3. Type consistency:**
- storage keys 全程一致:`seenItems`/`seenTimestamps`/`seenItemNames`、`removedItems`/`removedTimestamps`/`removedItemNames`、`settings.seenMode`。
- `seenMode` 取值統一 `'fade'|'hide'`,content script 與 options 都以 `=== 'hide' ? ... : 'fade'` 判斷,預設 fade,一致。
- `SEEN_RETENTION_MS` 定義於 Task 1、使用於 Task 3,一致。
- options.js 內部函式名(`loadItems`/`restoreItem`/`clearAllItems`/`searchItems`/`switchTab`)整檔自洽。
- `TAB_KEYS` / `TAB_LABELS` 的 key (`removed`/`seen`) 與 `.tab-btn[data-tab]` 值一致。

---

## Execution Handoff

Plan complete。兩種執行方式:
1. **Subagent-Driven(建議)** — 每個 Task 派新的 subagent,Task 間 review,快速迭代。
2. **Inline Execution** — 在本 session 用 executing-plans 批次執行 + checkpoint。

不過注意:本計畫每個 Task 的驗證都需要**人工在 Chrome 載入未封裝擴充並操作真實 591 列表頁**,subagent 無法自動完成這部分——實務上比較適合你在本機邊改邊測。
