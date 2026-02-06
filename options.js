// options.js - 591 租屋列表過濾選項頁面
document.addEventListener('DOMContentLoaded', function () {
  // 獲取DOM元素
  const statsNumberElement = document.getElementById('stats-number');
  const itemsContainer = document.getElementById('items-container');
  const refreshBtn = document.getElementById('refresh-btn');
  const clearAllBtn = document.getElementById('clear-all-btn');
  const exportBtn = document.getElementById('export-btn');
  const importBtn = document.getElementById('import-btn');
  const importFileInput = document.getElementById('import-file');
  const searchInput = document.getElementById('search-input');
  const spinner = document.getElementById('spinner');

  // 存儲當前所有移除項目的全局變量
  let allRemovedItems = [];
  let allRemovedTimestamps = {};
  let allRemovedItemNames = {};

  // 排序狀態
  let currentSortField = 'time';  // 'name' | 'time'
  let currentSortOrder = 'desc';  // 'asc' | 'desc'

  // 防抖函數
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // 加載移除項目資料
  function loadRemovedItems() {
    showSpinner();
    chrome.storage.local.get(['removedItems', 'removedTimestamps', 'removedItemNames'], function (result) {
      hideSpinner();
      const removedItems = result.removedItems || [];
      allRemovedTimestamps = result.removedTimestamps || {};
      allRemovedItemNames = result.removedItemNames || {};
      allRemovedItems = removedItems;
      updateTotalCount(removedItems.length);
      displayItems(removedItems);
    });
  }

  // 顯示加載圖示
  function showSpinner() {
    spinner.style.display = 'block';
  }

  // 隱藏加載圖示
  function hideSpinner() {
    spinner.style.display = 'none';
  }

  // 更新總數量顯示
  function updateTotalCount(count) {
    statsNumberElement.textContent = count;
  }

  // 排序項目
  function sortItems(items) {
    return [...items].sort((a, b) => {
      let comparison = 0;

      if (currentSortField === 'time') {
        const aTime = allRemovedTimestamps[a] || 0;
        const bTime = allRemovedTimestamps[b] || 0;
        comparison = aTime - bTime;
      } else if (currentSortField === 'name') {
        const aName = (allRemovedItemNames[a] || `物件 ID: ${a}`).toLowerCase();
        const bName = (allRemovedItemNames[b] || `物件 ID: ${b}`).toLowerCase();
        comparison = aName.localeCompare(bName, 'zh-TW');
      }

      return currentSortOrder === 'asc' ? comparison : -comparison;
    });
  }

  // 更新表頭排序圖示
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

  // 顯示項目列表
  function displayItems(items) {
    // 清空容器
    itemsContainer.innerHTML = '';

    if (items.length === 0) {
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = `
        <td colspan="3">
          <div class="empty-state">
            <div class="empty-icon">📭</div>
            <div class="empty-title">目前沒有已移除的物件</div>
            <div class="empty-text">在 591 租屋列表中點擊「移除」按鈕來隱藏物件</div>
          </div>
        </td>
      `;
      itemsContainer.appendChild(emptyRow);
      return;
    }

    // 排序項目
    const sortedItems = sortItems(items);

    // 建立表格列
    sortedItems.forEach(itemId => {
      const tr = document.createElement('tr');
      tr.dataset.id = itemId;

      // 名稱欄位
      const tdName = document.createElement('td');
      tdName.className = 'col-name';

      const itemName = allRemovedItemNames[itemId];
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

      // 時間欄位
      const tdTime = document.createElement('td');
      tdTime.className = 'col-time';
      const timestamp = allRemovedTimestamps[itemId];
      tdTime.textContent = timestamp ? formatDateTime(new Date(timestamp)) : '未記錄';

      // 操作欄位
      const tdActions = document.createElement('td');
      tdActions.className = 'col-actions';

      const restoreButton = document.createElement('button');
      restoreButton.className = 'btn-ghost';
      restoreButton.textContent = '還原';
      restoreButton.addEventListener('click', () => {
        restoreItem(itemId);
      });

      tdActions.appendChild(restoreButton);

      tr.appendChild(tdName);
      tr.appendChild(tdTime);
      tr.appendChild(tdActions);

      itemsContainer.appendChild(tr);
    });
  }

  // 處理表頭點擊排序
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

  // 還原項目
  function restoreItem(itemId) {
    showSpinner();
    chrome.storage.local.get(['removedItems', 'removedTimestamps', 'removedItemNames'], function (result) {
      const removedItems = result.removedItems || [];
      const removedTimestamps = result.removedTimestamps || {};
      const removedItemNames = result.removedItemNames || {};
      const updatedItems = removedItems.filter(id => id !== itemId);
      delete removedTimestamps[itemId];
      delete removedItemNames[itemId];

      chrome.storage.local.set({ removedItems: updatedItems, removedTimestamps, removedItemNames }, function () {
        hideSpinner();
        allRemovedItems = updatedItems;
        allRemovedTimestamps = removedTimestamps;
        allRemovedItemNames = removedItemNames;
        updateTotalCount(updatedItems.length);
        // 重新搜尋以更新顯示
        searchItems();
      });
    });
  }

  // 清除所有項目
  function clearAllItems() {
    if (confirm('確定要清除所有已移除的物件嗎？此操作無法還原。')) {
      showSpinner();
      chrome.storage.local.set({ removedItems: [], removedTimestamps: {}, removedItemNames: {} }, function () {
        hideSpinner();
        allRemovedItems = [];
        allRemovedTimestamps = {};
        allRemovedItemNames = {};
        updateTotalCount(0);
        displayItems([]);
      });
    }
  }

  // 搜尋項目
  function searchItems() {
    const query = searchInput.value.trim().toLowerCase();

    if (!query) {
      displayItems(allRemovedItems);
      return;
    }

    const filteredItems = allRemovedItems.filter(itemId => {
      if (itemId.toLowerCase().includes(query)) return true;
      const name = allRemovedItemNames[itemId];
      return name && name.toLowerCase().includes(query);
    });

    displayItems(filteredItems);

    if (filteredItems.length === 0 && allRemovedItems.length > 0) {
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

  // 匯出資料
  function exportData() {
    const dataStr = JSON.stringify({ removedItems: allRemovedItems, removedTimestamps: allRemovedTimestamps, removedItemNames: allRemovedItemNames });
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = `591_過濾資料_${formatDate(new Date())}.json`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }

  // 匯入資料
  function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = JSON.parse(e.target.result);

        if (Array.isArray(data.removedItems)) {
          if (confirm(`確定要匯入 ${data.removedItems.length} 個已移除的物件嗎？`)) {
            showSpinner();

            // 合併現有資料和匯入資料，並去除重複項
            chrome.storage.local.get(['removedItems', 'removedTimestamps', 'removedItemNames'], function (result) {
              const currentItems = result.removedItems || [];
              const currentTimestamps = result.removedTimestamps || {};
              const currentItemNames = result.removedItemNames || {};
              const mergedItems = [...new Set([...currentItems, ...data.removedItems])];
              const importedTimestamps = data.removedTimestamps || {};
              const importedItemNames = data.removedItemNames || {};
              const mergedTimestamps = { ...currentTimestamps, ...importedTimestamps };
              const mergedItemNames = { ...currentItemNames, ...importedItemNames };

              chrome.storage.local.set({ removedItems: mergedItems, removedTimestamps: mergedTimestamps, removedItemNames: mergedItemNames }, function () {
                hideSpinner();
                allRemovedItems = mergedItems;
                allRemovedTimestamps = mergedTimestamps;
                allRemovedItemNames = mergedItemNames;
                updateTotalCount(mergedItems.length);
                displayItems(mergedItems);
                alert(`成功匯入資料！總共有 ${mergedItems.length} 個已移除的物件。`);
              });
            });
          }
        } else {
          alert('匯入的檔案格式不正確！');
        }
      } catch (error) {
        alert('匯入失敗：' + error.message);
      }
    };

    reader.readAsText(file);
    // 重置 input 以便再次選擇相同文件
    event.target.value = '';
  }

  // 格式化日期為 YYYY-MM-DD
  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 格式化日期時間為 YYYY-MM-DD HH:mm:ss
  function formatDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  // 事件綁定
  refreshBtn.addEventListener('click', loadRemovedItems);
  clearAllBtn.addEventListener('click', clearAllItems);
  exportBtn.addEventListener('click', exportData);
  importBtn.addEventListener('click', () => importFileInput.click());
  importFileInput.addEventListener('change', importData);

  // 表頭排序點擊
  const itemsTable = document.getElementById('items-table');
  itemsTable.querySelector('thead').addEventListener('click', handleSortClick);

  // 即時搜尋（防抖）
  const debouncedSearch = debounce(searchItems, 200);
  searchInput.addEventListener('input', debouncedSearch);
  searchInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
      searchItems();
    }
  });

  // 初始加載資料
  loadRemovedItems();
});
