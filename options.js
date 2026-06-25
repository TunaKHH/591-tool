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

  // 還原（從目前分頁移除一筆）
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

  // 匯出（同時含已移除與已看過）
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

  // 匯入（向後相容：舊檔只有 removed*）
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

  // 設定：已看過模式
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
