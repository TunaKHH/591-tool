chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openOptionsPage') {
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
  }
});
