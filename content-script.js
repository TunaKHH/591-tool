(() => {
  // 從物件元素中提取標題
  function extractItemTitle(itemElement) {
    const titleLink = itemElement.querySelector('.item-info-title a');
    if (titleLink) return titleLink.textContent.trim();

    const titleDiv = itemElement.querySelector('.item-info-title');
    if (titleDiv) return titleDiv.textContent.trim();

    return null;
  }

  // 檢查擴充套件 context 是否仍有效（重新載入擴充套件後舊 script 會失效）
  function isContextValid() {
    return !!(chrome.runtime && chrome.runtime.id);
  }

  // 儲存移除的物件 ID 到 chrome.storage.local
  function saveRemovedItem(itemId, itemTitle) {
    if (!isContextValid()) return;
    chrome.storage.local.get(['removedItems', 'removedTimestamps', 'removedItemNames'], (result) => {
      const removedItems = result.removedItems || [];
      const removedTimestamps = result.removedTimestamps || {};
      const removedItemNames = result.removedItemNames || {};
      if (!removedItems.includes(itemId)) {
        removedItems.push(itemId);
        removedTimestamps[itemId] = Date.now();
        if (itemTitle) {
          removedItemNames[itemId] = itemTitle;
        }
        chrome.storage.local.set({ removedItems, removedTimestamps, removedItemNames }, () => {
          updateRemoveCount();
        });
      }
    });
  }

  // 獲取已移除的物件 ID 列表
  function getRemovedItems(callback) {
    if (!isContextValid()) return;
    chrome.storage.local.get(['removedItems'], (result) => {
      callback(result.removedItems || []);
    });
  }

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

  // 取得實際要隱藏/顯示的外層元素（與 hideItem 的 target 判斷一致）
  function itemWrapper(itemElement) {
    return (itemElement.parentElement && itemElement.parentElement.parentElement === document.querySelector('main'))
      ? itemElement.parentElement
      : itemElement;
  }

  // 注入淡化樣式（只注入一次）
  function ensureSeenStyle() {
    if (document.getElementById('seen-591-style')) return;
    const style = document.createElement('style');
    style.id = 'seen-591-style';
    style.textContent = '.seen-591-faded{opacity:0.4 !important;filter:grayscale(0.8) !important;transition:opacity 0.2s ease, filter 0.2s ease;}';
    (document.head || document.documentElement).appendChild(style);
  }

  // 隱藏房屋物件（隱藏外層包裝 div 避免留下空白）
  function hideItem(itemElement, animate = false) {
    const target = (itemElement.parentElement && itemElement.parentElement.parentElement === document.querySelector('main'))
      ? itemElement.parentElement
      : itemElement;

    if (!animate) {
      target.style.display = 'none';
      return;
    }

    target.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    target.style.transform = 'scale(0)';
    target.style.opacity = '0';
    target.addEventListener('transitionend', (e) => {
      if (e.propertyName === 'opacity') {
        target.style.display = 'none';
      }
    }, { once: true });
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

  // 依設定對「已看過」物件套用淡化或隱藏（已移除的交給 hideRemovedItems）
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
        if (removedItems.includes(itemId)) return; // 已移除 → 不碰，由 hideRemovedItems 隱藏

        if (seenItems.includes(itemId)) {
          if (seenMode === 'hide') {
            item.classList.remove('seen-591-faded');
            hideItem(item);
          } else {
            // 淡化：還原可能殘留的隱藏，加上淡化 class
            itemWrapper(item).style.display = '';
            item.classList.add('seen-591-faded');
          }
        } else {
          // 不是 seen（例如已從選項頁還原）→ 清除淡化殘留
          item.classList.remove('seen-591-faded');
        }
      });
    });
  }

  // 清理超過保留期（90 天）的已看過紀錄
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

        hideItem(item, true);
        saveRemovedItem(itemId, extractItemTitle(item));
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
      if (!isContextValid()) return;
      chrome.runtime.sendMessage({ action: 'openOptionsPage' });
    });

    document.body.appendChild(optionsBtn);
    updateRemoveCount();
  }

  // 更新移除數量徽章
  function updateRemoveCount() {
    const oldBadge = document.getElementById('591-count-badge');
    if (oldBadge) oldBadge.remove();

    if (!isContextValid()) return;
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
    pruneOldSeen();
    hideRemovedItems();
    setTimeout(() => { processItemElements(); applySeenTreatment(); }, 500);
    setTimeout(addOptionsButton, 1000);
  }, 1500);

  // 監視 DOM 變化（591 使用 Vue SPA，翻頁時 DOM 會動態更新）
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    if (!isContextValid()) {
      observer.disconnect();
      return;
    }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (!isContextValid()) return;
      hideRemovedItems();
      processItemElements();
      applySeenTreatment();
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

  // 攔截「點進物件詳情」→ 標記為已看過（capture 階段，先於 Vue 處理）
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

  // 設定或清單變動 → 即時重套（免重整）
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.seenItems || changes.removedItems || changes.settings) {
      applySeenTreatment();
    }
  });
})();