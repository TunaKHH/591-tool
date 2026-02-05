(() => {
  // 儲存移除的物件 ID 到 chrome.storage.local
  function saveRemovedItem(itemId) {
    chrome.storage.local.get(['removedItems'], (result) => {
      const removedItems = result.removedItems || [];
      if (!removedItems.includes(itemId)) {
        removedItems.push(itemId);
        chrome.storage.local.set({ removedItems }, () => {
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

  // 提取物件 ID — 591 目前使用 .item[data-id] 結構
  function extractItemId(itemElement) {
    // 優先從 data-id 屬性取得（591 目前的結構）
    const dataId = itemElement.getAttribute('data-id');
    if (dataId) return dataId;

    // 從內部 .item[data-id] 子元素取得
    const innerItem = itemElement.querySelector('[data-id]');
    if (innerItem) return innerItem.getAttribute('data-id');

    // 從連結 URL 中提取 ID（591 目前格式: /20628481）
    const linkElement = itemElement.querySelector('a[href*="rent.591.com.tw/"]');
    if (linkElement) {
      const href = linkElement.getAttribute('href');
      const match = href.match(/rent\.591\.com\.tw\/(\d+)/);
      if (match && match[1]) return match[1];
    }

    // 舊版格式相容: /rent-detail/12345
    const legacyLink = itemElement.querySelector('a[href*="/rent-detail/"]');
    if (legacyLink) {
      const href = legacyLink.getAttribute('href');
      const match = href.match(/\/rent-detail\/(\d+)/);
      if (match && match[1]) return match[1];
    }

    return null;
  }

  // 查找房屋物件列表元素
  // 591 目前的 DOM 結構:
  //   main > div(無class, data-v-xxx) > div.item[data-id]
  function findHouseItems() {
    // 精確選擇器：直接找 .item[data-id]
    const items = document.querySelectorAll('main .item[data-id]');
    if (items.length > 0) return Array.from(items);

    // 備用：找 main 下含有 data-id 的大型 div
    const mainEl = document.querySelector('main');
    if (!mainEl) return [];

    return Array.from(mainEl.querySelectorAll('div[data-id]')).filter(el =>
      el.offsetWidth > 200 && el.offsetHeight > 100
    );
  }

  // 隱藏房屋物件（隱藏外層包裝 div 避免留下空白）
  function hideItem(itemElement) {
    const wrapper = itemElement.parentElement;
    if (wrapper && wrapper.parentElement === document.querySelector('main')) {
      wrapper.style.display = 'none';
    } else {
      itemElement.style.display = 'none';
    }
  }

  // 頁面載入時隱藏已移除的物件
  function hideRemovedItems() {
    getRemovedItems((removedItems) => {
      if (removedItems.length === 0) return;

      const houseItems = findHouseItems();
      houseItems.forEach(item => {
        const itemId = extractItemId(item);
        if (itemId && removedItems.includes(itemId)) {
          hideItem(item);
        }
      });
    });
  }

  // 為房屋物件添加移除按鈕
  function processItemElements() {
    const houseItems = findHouseItems();

    houseItems.forEach(item => {
      // 跳過已處理的元素
      if (item.querySelector('.remove-591-btn')) return;

      const itemId = extractItemId(item);
      if (!itemId) return;

      // 確保元素有定位上下文讓按鈕能 absolute 定位
      if (getComputedStyle(item).position === 'static') {
        item.style.position = 'relative';
      }

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-591-btn';
      removeBtn.textContent = '\u2715 移除';
      removeBtn.setAttribute('data-item-id', itemId);

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

      removeBtn.onmouseover = () => { removeBtn.style.background = 'darkred'; };
      removeBtn.onmouseout = () => { removeBtn.style.background = 'red'; };

      // 使用 capture 階段攔截事件，防止 Vue 在 bubble 階段先處理導致頁面跳轉
      removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        hideItem(item);
        saveRemovedItem(itemId);
      }, true);

      // 同時也攔截 mousedown/mouseup 防止 Vue 的其他事件處理
      removeBtn.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
      }, true);

      removeBtn.addEventListener('mouseup', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
      }, true);

      item.appendChild(removeBtn);
    });
  }

  // 添加固定的選項按鈕
  function addOptionsButton() {
    if (document.getElementById('591-options-btn')) return;

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

    optionsBtn.innerHTML = '\u2699\uFE0F';
    optionsBtn.title = '管理已移除物件';

    optionsBtn.onmouseover = () => { optionsBtn.style.transform = 'scale(1.1)'; };
    optionsBtn.onmouseout = () => { optionsBtn.style.transform = 'scale(1)'; };

    optionsBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'openOptionsPage' });
    });

    document.body.appendChild(optionsBtn);
    updateRemoveCount();
  }

  // 更新移除數量徽章
  function updateRemoveCount() {
    const oldBadge = document.getElementById('591-count-badge');
    if (oldBadge) oldBadge.remove();

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
        if (optionsBtn) optionsBtn.appendChild(badge);
      }
    });
  }

  // 啟動：等待頁面 DOM 就緒
  setTimeout(() => {
    hideRemovedItems();
    setTimeout(processItemElements, 500);
    setTimeout(addOptionsButton, 1000);
  }, 1500);

  // 監視 DOM 變化（591 使用 Vue SPA，翻頁時 DOM 會動態更新）
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      hideRemovedItems();
      processItemElements();
      if (!document.getElementById('591-options-btn')) {
        addOptionsButton();
      }
    }, 500);
  });

  setTimeout(() => {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }, 2000);
})();