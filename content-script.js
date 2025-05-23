(() => {
  // 在頁面頂部創建測試用浮動面板，用於顯示除錯訊息
  function createDebugPanel() {
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      position: 'fixed',
      top: '10px',
      right: '10px',
      zIndex: '99999',
      background: 'rgba(0,0,0,0.8)',
      color: '#fff',
      padding: '10px',
      borderRadius: '5px',
      maxWidth: '300px',
      maxHeight: '200px',
      overflow: 'auto',
      fontSize: '12px',
      fontFamily: 'Microsoft JhengHei, 微軟正黑體, sans-serif'
    });
    panel.id = 'debug-591-panel';
    document.body.appendChild(panel);
    return panel;
  }

  // 添加訊息到面板
  function addDebugMessage(message) {
    const panel = document.getElementById('debug-591-panel') || createDebugPanel();
    const msgElem = document.createElement('div');
    msgElem.textContent = message;
    msgElem.style.borderBottom = '1px solid #555';
    msgElem.style.padding = '3px 0';
    panel.appendChild(msgElem);

    // 限制訊息數量
    while (panel.childNodes.length > 10) {
      panel.removeChild(panel.firstChild);
    }
  }

  // 儲存移除的物件 ID 到 chrome.storage.local
  function saveRemovedItem(itemId) {
    chrome.storage.local.get(['removedItems'], (result) => {
      const removedItems = result.removedItems || [];
      if (!removedItems.includes(itemId)) {
        removedItems.push(itemId);
        chrome.storage.local.set({ removedItems }, () => {
          addDebugMessage(`儲存物件ID: ${itemId} 到已移除清單`);
          // 更新移除數量徽章
          updateRemoveCount();
        });
      }
    });
  }


  // 獲取已移除的物件 ID 列表
  function getRemovedItems(callback) {
    chrome.storage.local.get(['removedItems'], (result) => {
      callback(result.removedItems || []);
    });
  }

  // 提取物件 ID
  function extractItemId(itemElement) {
    // 嘗試從 data 屬性獲取 ID
    const dataId = itemElement.getAttribute('data-bind') ||
      itemElement.getAttribute('data-id') ||
      itemElement.getAttribute('data-item-id');
    if (dataId) {
      // 使用正則表達式從字符串中提取數字 ID
      const match = dataId.match(/\d+/);
      if (match) return match[0];
    }

    // 嘗試從內部元素獲取 ID
    const idElement = itemElement.querySelector('[data-bind*="id"]') ||
      itemElement.querySelector('[data-id]') ||
      itemElement.querySelector('[class*="item-id"]');
    if (idElement) {
      const idText = idElement.getAttribute('data-bind') ||
        idElement.getAttribute('data-id') ||
        idElement.textContent;
      const match = idText.match(/\d+/);
      if (match) return match[0];
    }

    // 嘗試從URL連結中提取 ID
    const linkElement = itemElement.querySelector('a[href*="/rent-detail/"]');
    if (linkElement) {
      const href = linkElement.getAttribute('href');
      const match = href.match(/\/rent-detail\/(\d+)/);
      if (match && match[1]) return match[1];
    }

    // 最後嘗試從包含數字的類名或 ID 屬性中提取
    const idFromClass = itemElement.className.match(/item[-_]?(\d+)/) ||
      itemElement.id.match(/item[-_]?(\d+)/);
    if (idFromClass && idFromClass[1]) return idFromClass[1];

    // 若無法找到 ID，使用元素的一些特徵作為唯一標識
    // 例如：標題+價格+面積 組合的雜湊值
    const titleElem = itemElement.querySelector('[class*="title"]') ||
      itemElement.querySelector('h3') ||
      itemElement.querySelector('h4');
    const priceElem = itemElement.querySelector('[class*="price"]');

    let signature = '';
    if (titleElem) signature += titleElem.textContent.trim();
    if (priceElem) signature += '-' + priceElem.textContent.trim();

    if (signature) {
      // 創建一個簡單的雜湊字符串作為 ID
      return 'hash_' + signature.replace(/\s+/g, '');
    }

    // 如果所有方法都失敗，返回隨機 ID 加上時間戳
    return 'random_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
  }

  // 隱藏指定的物件元素
  function hideItem(itemElement, itemId) {
    itemElement.style.display = 'none';
    addDebugMessage(`已隱藏物件: ${itemId}`);
  }

  // 頁面載入時隱藏已移除的物件
  function hideRemovedItems() {
    getRemovedItems((removedItems) => {
      if (removedItems.length === 0) {
        addDebugMessage('沒有發現已移除的物件');
        return;
      }

      addDebugMessage(`載入了 ${removedItems.length} 個已移除物件`);

      // 查找所有房屋物件元素
      const listContainer = document.querySelector('.list-container') ||
        document.querySelector('.vue-list-rent-container') ||
        document.querySelector('.main-content') ||
        document.querySelector('main');

      if (!listContainer) {
        addDebugMessage('找不到列表容器，無法隱藏已移除物件');
        return;
      }

      // 尋找所有可能的房屋項目
      const allPossibleItems = [];

      // 使用多種選擇器
      const selectors = [
        '.item-container',
        '.vue-list-rent-item',
        '.rent-item',
        '[class*="item-container"]',
        '[class*="view-item"]',
        '[class*="house-item"]',
        'div[class*="item"]'
      ];

      selectors.forEach(selector => {
        const items = listContainer.querySelectorAll(selector);
        items.forEach(item => {
          if (item.offsetWidth > 200 && item.offsetHeight > 100) {
            allPossibleItems.push(item);
          }
        });
      });

      let hiddenCount = 0;

      // 檢查每個物件並隱藏已移除的
      allPossibleItems.forEach(item => {
        const itemId = extractItemId(item);
        if (itemId && removedItems.includes(itemId)) {
          hideItem(item, itemId);
          hiddenCount++;
        } else if (itemId && removedItems.some(id =>
          id.startsWith('hash_') &&
          itemId.startsWith('hash_') &&
          // 比較雜湊值的一部分來提高匹配機率
          id.substring(5, 15) === itemId.substring(5, 15)
        )) {
          hideItem(item, itemId);
          hiddenCount++;
        }
      });

      addDebugMessage(`自動隱藏了 ${hiddenCount} 個已移除物件`);
    });
  }

  // 專注處理房屋物件元素
  function processItemElements() {
    addDebugMessage('開始尋找房屋物件...');

    // 先移除之前可能添加的所有按鈕，避免重複
    document.querySelectorAll('.remove-591-btn').forEach(btn => btn.remove());

    // 查找主要容器 - 通常是列表容器
    const listContainer = document.querySelector('.list-container') ||
      document.querySelector('.vue-list-rent-container') ||
      document.querySelector('.main-content') ||
      document.querySelector('main');

    if (!listContainer) {
      addDebugMessage('找不到列表容器');
      return;
    }

    // 尋找最上層的房屋物件 - 這些通常是直接的子元素或孫元素
    // 使用更精確的選擇器來找到頂層房屋項目
    const houseItems = [];
    const possibleItemClasses = [
      '.item-container',
      '.vue-list-rent-item',
      '.rent-item',
      '[class*="item-container"]',
      '[class*="view-item"]',
      '[class*="house-item"]'
    ];

    // 嘗試使用更精確的選擇器
    possibleItemClasses.forEach(selector => {
      const items = listContainer.querySelectorAll(selector);
      if (items.length > 0) {
        addDebugMessage(`選擇器 ${selector} 找到 ${items.length} 個物件`);
        items.forEach(item => houseItems.push(item));
      }
    });

    // 如果沒找到，嘗試更通用的選擇器
    if (houseItems.length === 0) {
      // 尋找包含圖片和價格資訊的大型區塊
      const candidates = Array.from(listContainer.querySelectorAll('div[class*="item"]')).filter(el => {
        // 檢查是否包含圖片
        const hasImage = el.querySelector('img') !== null;
        // 檢查是否包含價格資訊 (常見的價格文字)
        const hasPrice = el.textContent.includes('元') || el.textContent.includes('萬') ||
          el.textContent.match(/\d{4,}/); // 包含4位數以上的數字
        // 檢查是否為一個較大的元素
        const isLargeElement = el.offsetWidth > 200 && el.offsetHeight > 100;

        return hasImage && (hasPrice || isLargeElement);
      });

      if (candidates.length > 0) {
        addDebugMessage(`找到 ${candidates.length} 個可能的房屋物件`);
        candidates.forEach(item => houseItems.push(item));
      }
    }

    // 如果仍然沒有找到元素，使用最後的備用方法
    if (houseItems.length === 0) {
      // 直接獲取所有頂層容器並篩選可能的物件
      const allDivs = listContainer.querySelectorAll('div');
      const largeContainers = Array.from(allDivs).filter(div =>
        div.offsetWidth > 300 &&
        div.offsetHeight > 150 &&
        div.children.length >= 3 &&
        !div.querySelector('.remove-591-btn') // 避免已經處理過的元素
      );

      addDebugMessage(`備用方法找到 ${largeContainers.length} 個可能物件`);
      largeContainers.forEach(item => houseItems.push(item));
    }

    addDebugMessage(`總共找到 ${houseItems.length} 個房屋物件待處理`);

    // 防止重複處理
    const processedItems = new Set();

    // 添加按鈕到這些元素
    houseItems.forEach((item, index) => {
      // 避免處理重複元素
      if (processedItems.has(item) || item.querySelector('.remove-591-btn')) {
        return;
      }

      // 嘗試提取物件 ID
      const itemId = extractItemId(item);

      // 設置相對定位
      if (getComputedStyle(item).position === 'static') {
        item.style.position = 'relative';
      }

      // 創建移除按鈕
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-591-btn';
      removeBtn.textContent = '✕ 移除';
      removeBtn.setAttribute('data-item-id', itemId);

      // 設置按鈕樣式
      Object.assign(removeBtn.style, {
        position: 'absolute',
        top: '5px',
        right: '5px',
        zIndex: '999999',
        background: 'red',
        color: 'white',
        border: '2px solid white',
        borderRadius: '4px',
        padding: '3px 8px',
        fontWeight: 'bold',
        fontSize: '14px',
        cursor: 'pointer',
        boxShadow: '0 0 5px rgba(0,0,0,0.5)',
        fontFamily: 'Arial, sans-serif'
      });

      // 懸停效果
      removeBtn.onmouseover = () => {
        removeBtn.style.background = 'darkred';
      };

      removeBtn.onmouseout = () => {
        removeBtn.style.background = 'red';
      };

      // 點擊事件
      removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // 隱藏房屋物件
        item.style.display = 'none';

        // 儲存物件 ID 到 chrome.storage.local
        if (itemId) {
          saveRemovedItem(itemId);
          addDebugMessage(`已隱藏並儲存物件 #${index + 1} (ID: ${itemId})`);
        } else {
          addDebugMessage(`已隱藏物件 #${index + 1} (無法獲取 ID)`);
        }
      });

      // 添加按鈕
      item.appendChild(removeBtn);
      processedItems.add(item);
    });

    addDebugMessage(`成功添加 ${processedItems.size} 個移除按鈕`);

    // 如果完全沒找到物件或無法添加按鈕，顯示緊急控制面板
    if (processedItems.size === 0 && houseItems.length > 0) {
      addEmergencyControls();
    }
  }

  // 應急方案 - 添加浮動控制面板
  function addEmergencyControls() {
    if (document.getElementById('emergency-591-controls')) {
      return; // 避免重複添加
    }

    addDebugMessage('啟動應急控制面板');

    const controlPanel = document.createElement('div');
    controlPanel.id = 'emergency-591-controls';
    Object.assign(controlPanel.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: 'rgba(0,0,0,0.8)',
      padding: '10px',
      borderRadius: '5px',
      zIndex: '9999999',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      boxShadow: '0 0 10px rgba(0,0,0,0.5)'
    });

    // 添加說明文字
    const infoText = document.createElement('div');
    infoText.textContent = '無法添加移除按鈕，請使用以下選項：';
    infoText.style.color = 'white';
    infoText.style.marginBottom = '10px';
    controlPanel.appendChild(infoText);

    // 使用數字標記頂部物件
    const markItemsBtn = document.createElement('button');
    markItemsBtn.textContent = '標記房屋物件';
    Object.assign(markItemsBtn.style, {
      padding: '8px',
      background: '#4CAF50',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer'
    });

    markItemsBtn.addEventListener('click', () => {
      // 先移除之前的標記
      document.querySelectorAll('.item-marker-591').forEach(m => m.remove());

      // 標記可能的房屋物件
      const items = document.querySelectorAll('div[class*="item"]');
      items.forEach((item, i) => {
        if (i < 20 && item.offsetWidth > 200 && item.offsetHeight > 100) {
          const marker = document.createElement('div');
          marker.className = 'item-marker-591';
          marker.textContent = `#${i + 1}`;
          Object.assign(marker.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            background: 'red',
            color: 'white',
            padding: '5px',
            fontWeight: 'bold',
            zIndex: '999999'
          });

          if (getComputedStyle(item).position === 'static') {
            item.style.position = 'relative';
          }

          item.appendChild(marker);
        }
      });
      addDebugMessage('已標記前20個物件');
    });

    // 隱藏指定編號物件的輸入框
    const inputContainer = document.createElement('div');
    Object.assign(inputContainer.style, {
      display: 'flex',
      gap: '5px'
    });

    const numInput = document.createElement('input');
    Object.assign(numInput.style, {
      width: '60px',
      padding: '8px',
      boxSizing: 'border-box'
    });
    numInput.type = 'number';
    numInput.min = '1';
    numInput.placeholder = '編號';

    const hideBtn = document.createElement('button');
    hideBtn.textContent = '隱藏';
    Object.assign(hideBtn.style, {
      padding: '8px',
      background: '#f44336',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      flexGrow: '1'
    });

    hideBtn.addEventListener('click', () => {
      const num = parseInt(numInput.value);
      if (isNaN(num) || num < 1) return;

      const items = document.querySelectorAll('div[class*="item"]');
      const targetItems = Array.from(items).filter(item =>
        item.offsetWidth > 200 && item.offsetHeight > 100
      );

      if (num <= targetItems.length) {
        const item = targetItems[num - 1];
        const itemId = extractItemId(item);

        item.style.display = 'none';

        // 儲存物件 ID 到 chrome.storage.local
        if (itemId) {
          saveRemovedItem(itemId);
          addDebugMessage(`已隱藏並儲存物件 #${num} (ID: ${itemId})`);
        } else {
          addDebugMessage(`已隱藏物件 #${num} (無法獲取 ID)`);
        }

        numInput.value = '';
      }
    });

    inputContainer.appendChild(numInput);
    inputContainer.appendChild(hideBtn);

    // 添加已移除物件計數器
    const removedCounter = document.createElement('div');
    removedCounter.id = 'removed-counter';
    removedCounter.style.color = 'white';
    removedCounter.style.marginTop = '5px';
    removedCounter.style.fontSize = '12px';

    // 獲取已移除物件數量
    getRemovedItems(items => {
      removedCounter.textContent = `已移除物件數: ${items.length}`;
    });

    // 添加選項頁面按鈕
    const optionsBtn = document.createElement('button');
    optionsBtn.textContent = '管理已移除物件';
    Object.assign(optionsBtn.style, {
      padding: '8px',
      background: '#2196F3',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      marginTop: '5px'
    });

    optionsBtn.addEventListener('click', () => {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open(chrome.runtime.getURL('options.html'));
      }
    });

    // 添加關閉按鈕
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '關閉控制面板';
    Object.assign(closeBtn.style, {
      padding: '8px',
      background: '#607D8B',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      marginTop: '5px'
    });

    closeBtn.addEventListener('click', () => {
      controlPanel.remove();
    });

    controlPanel.appendChild(markItemsBtn);
    controlPanel.appendChild(inputContainer);
    controlPanel.appendChild(removedCounter);
    controlPanel.appendChild(optionsBtn);
    controlPanel.appendChild(closeBtn);
    document.body.appendChild(controlPanel);
  }

  // 添加固定的選項按鈕
  function addOptionsButton() {
    // 檢查按鈕是否已存在
    if (document.getElementById('591-options-btn')) {
      return;
    }

    const optionsBtn = document.createElement('div');
    optionsBtn.id = '591-options-btn';
    Object.assign(optionsBtn.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      width: '50px',
      height: '50px',
      borderRadius: '50%',
      background: '#e53935',
      color: 'white',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.3)',
      zIndex: '999997',
      cursor: 'pointer',
      fontSize: '20px',
      fontWeight: 'bold',
      transition: 'all 0.2s ease'
    });

    optionsBtn.innerHTML = '⚙️';
    optionsBtn.title = '管理已移除物件';

    // 懸停效果
    optionsBtn.onmouseover = () => {
      optionsBtn.style.transform = 'scale(1.1)';
    };

    optionsBtn.onmouseout = () => {
      optionsBtn.style.transform = 'scale(1)';
    };

    // 點擊打開選項頁面
    optionsBtn.addEventListener('click', () => {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open(chrome.runtime.getURL('options.html'));
      }
    });

    document.body.appendChild(optionsBtn);

    // 創建移除數量的小徽章
    updateRemoveCount();
  }

  // 更新移除數量徽章
  function updateRemoveCount() {
    // 移除舊的徽章
    const oldBadge = document.getElementById('591-count-badge');
    if (oldBadge) {
      oldBadge.remove();
    }

    // 獲取移除數量
    chrome.storage.local.get(['removedItems'], (result) => {
      const count = result.removedItems ? result.removedItems.length : 0;

      if (count > 0) {
        const badge = document.createElement('div');
        badge.id = '591-count-badge';
        Object.assign(badge.style, {
          position: 'absolute',
          top: '-5px',
          right: '-5px',
          background: '#4CAF50',
          color: 'white',
          borderRadius: '50%',
          padding: '2px 6px',
          fontSize: '12px',
          fontWeight: 'bold',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)'
        });

        badge.textContent = count > 99 ? '99+' : count;

        const optionsBtn = document.getElementById('591-options-btn');
        if (optionsBtn) {
          optionsBtn.appendChild(badge);
        }
      }
    });
  }

  // 設置執行時機
  setTimeout(() => {
    addDebugMessage('591租屋過濾擴充功能啟動');

    // 先隱藏已移除的物件，再處理添加按鈕
    hideRemovedItems();

    // 然後處理物件元素和添加按鈕
    setTimeout(processItemElements, 500);

    // 添加選項按鈕
    setTimeout(addOptionsButton, 1000);
  }, 1500);

  // 定期檢查新元素
  setInterval(() => {
    processItemElements();
    // 每 10 秒重新檢查一次已移除物件
    if (Math.random() < 0.3) { // 隨機約 30% 的機率執行，減少資源消耗
      hideRemovedItems();
    }
  }, 3000);

  // 監視 DOM 變化
  const observer = new MutationObserver(() => {
    setTimeout(() => {
      hideRemovedItems();
      processItemElements();

      // 確保選項按鈕存在
      if (!document.getElementById('591-options-btn')) {
        addOptionsButton();
      }
    }, 1000);
  });

  setTimeout(() => {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    addDebugMessage('DOM 監視器已啟動');
  }, 2000);
})();