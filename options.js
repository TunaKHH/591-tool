// options.js - 591 租屋列表過濾選項頁面
document.addEventListener('DOMContentLoaded', function () {
  // 獲取DOM元素
  const totalCountElement = document.getElementById('total-count');
  const itemsContainer = document.getElementById('items-container');
  const refreshBtn = document.getElementById('refresh-btn');
  const clearAllBtn = document.getElementById('clear-all-btn');
  const exportBtn = document.getElementById('export-btn');
  const importBtn = document.getElementById('import-btn');
  const importFileInput = document.getElementById('import-file');
  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-btn');
  const clearSearchBtn = document.getElementById('clear-search-btn');
  const spinner = document.getElementById('spinner');

  // 存儲當前所有移除項目的全局變量
  let allRemovedItems = [];
  let allRemovedTimestamps = {};

  // 加載移除項目資料
  function loadRemovedItems() {
    showSpinner();
    chrome.storage.local.get(['removedItems', 'removedTimestamps'], function (result) {
      hideSpinner();
      const removedItems = result.removedItems || [];
      allRemovedTimestamps = result.removedTimestamps || {};
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
    totalCountElement.textContent = `共有 ${count} 個已移除的物件`;
  }

  // 顯示項目列表
  function displayItems(items) {
    // 清空容器
    itemsContainer.innerHTML = '';

    if (items.length === 0) {
      const emptyElement = document.createElement('div');
      emptyElement.className = 'empty-list';
      emptyElement.textContent = '沒有已移除的物件';
      itemsContainer.appendChild(emptyElement);
      return;
    }

    // 按移除時間排序（最新在最上面），無時間戳記的排在最後
    items.sort((a, b) => {
      const aTime = allRemovedTimestamps[a] || 0;
      const bTime = allRemovedTimestamps[b] || 0;
      return bTime - aTime;
    });

    // 建立項目卡片
    items.forEach(itemId => {
      const itemCard = document.createElement('div');
      itemCard.className = 'item-card';
      itemCard.dataset.id = itemId;

      const itemInfo = document.createElement('div');
      itemInfo.className = 'item-info';

      const itemIdElement = document.createElement('div');
      itemIdElement.className = 'item-id';

      // 判斷是數字 ID 還是雜湊 ID
      if (!isNaN(Number(itemId))) {
        itemIdElement.textContent = `物件 ID: ${itemId}`;

        // 添加連結預覽
        const itemPreview = document.createElement('div');
        itemPreview.className = 'item-preview';

        const itemLink = document.createElement('a');
        itemLink.href = `https://rent.591.com.tw/rent-detail/${itemId}`;
        itemLink.textContent = `前往查看: rent.591.com.tw/rent-detail/${itemId}`;
        itemLink.target = '_blank';

        itemPreview.appendChild(itemLink);
        itemInfo.appendChild(itemIdElement);
        itemInfo.appendChild(itemPreview);
      } else if (itemId.startsWith('hash_')) {
        itemIdElement.textContent = `雜湊物件: ${itemId.substring(5, 15)}...`;
        itemInfo.appendChild(itemIdElement);

        const itemPreview = document.createElement('div');
        itemPreview.className = 'item-preview';
        itemPreview.textContent = '自動產生的雜湊 ID (無法連結至原始頁面)';
        itemInfo.appendChild(itemPreview);
      } else {
        itemIdElement.textContent = `其他 ID: ${itemId}`;
        itemInfo.appendChild(itemIdElement);
      }

      // 顯示移除時間
      const timestamp = allRemovedTimestamps[itemId];
      const itemTime = document.createElement('div');
      itemTime.className = 'item-time';
      if (timestamp) {
        itemTime.textContent = `移除時間：${formatDateTime(new Date(timestamp))}`;
      } else {
        itemTime.textContent = '移除時間：未記錄';
      }
      itemInfo.appendChild(itemTime);

      const itemActions = document.createElement('div');
      itemActions.className = 'item-actions';

      // 還原按鈕
      const restoreButton = document.createElement('button');
      restoreButton.className = 'restore-btn';
      restoreButton.textContent = '還原';
      restoreButton.addEventListener('click', () => {
        restoreItem(itemId);
      });

      // 刪除按鈕
      const deleteButton = document.createElement('button');
      deleteButton.className = 'danger-btn';
      deleteButton.textContent = '刪除';
      deleteButton.addEventListener('click', () => {
        deleteItem(itemId);
      });

      itemActions.appendChild(restoreButton);
      itemActions.appendChild(deleteButton);

      itemCard.appendChild(itemInfo);
      itemCard.appendChild(itemActions);

      itemsContainer.appendChild(itemCard);
    });
  }

  // 還原項目
  function restoreItem(itemId) {
    showSpinner();
    chrome.storage.local.get(['removedItems', 'removedTimestamps'], function (result) {
      const removedItems = result.removedItems || [];
      const removedTimestamps = result.removedTimestamps || {};
      const updatedItems = removedItems.filter(id => id !== itemId);
      delete removedTimestamps[itemId];

      chrome.storage.local.set({ removedItems: updatedItems, removedTimestamps }, function () {
        hideSpinner();
        allRemovedItems = updatedItems;
        allRemovedTimestamps = removedTimestamps;
        updateTotalCount(updatedItems.length);
        displayItems(updatedItems);
      });
    });
  }

  // 刪除項目 (同 restoreItem，但語意不同)
  function deleteItem(itemId) {
    restoreItem(itemId);
  }

  // 清除所有項目
  function clearAllItems() {
    if (confirm('確定要清除所有已移除的物件嗎？此操作無法還原。')) {
      showSpinner();
      chrome.storage.local.set({ removedItems: [], removedTimestamps: {} }, function () {
        hideSpinner();
        allRemovedItems = [];
        allRemovedTimestamps = {};
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

    const filteredItems = allRemovedItems.filter(itemId =>
      itemId.toLowerCase().includes(query)
    );

    displayItems(filteredItems);

    if (filteredItems.length === 0) {
      const noResults = document.createElement('div');
      noResults.className = 'no-results';
      noResults.textContent = '沒有符合的搜尋結果';
      itemsContainer.appendChild(noResults);
    }
  }

  // 匯出資料
  function exportData() {
    const dataStr = JSON.stringify({ removedItems: allRemovedItems, removedTimestamps: allRemovedTimestamps });
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
            chrome.storage.local.get(['removedItems', 'removedTimestamps'], function (result) {
              const currentItems = result.removedItems || [];
              const currentTimestamps = result.removedTimestamps || {};
              const mergedItems = [...new Set([...currentItems, ...data.removedItems])];
              const importedTimestamps = data.removedTimestamps || {};
              const mergedTimestamps = { ...currentTimestamps, ...importedTimestamps };

              chrome.storage.local.set({ removedItems: mergedItems, removedTimestamps: mergedTimestamps }, function () {
                hideSpinner();
                allRemovedItems = mergedItems;
                allRemovedTimestamps = mergedTimestamps;
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

  // 格式化日期時間為 YYYY-MM-DD HH:mm
  function formatDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  // 事件綁定
  refreshBtn.addEventListener('click', loadRemovedItems);
  clearAllBtn.addEventListener('click', clearAllItems);
  exportBtn.addEventListener('click', exportData);
  importBtn.addEventListener('click', () => importFileInput.click());
  importFileInput.addEventListener('change', importData);
  searchBtn.addEventListener('click', searchItems);
  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    displayItems(allRemovedItems);
  });
  searchInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
      searchItems();
    }
  });

  // 初始加載資料
  loadRemovedItems();
});