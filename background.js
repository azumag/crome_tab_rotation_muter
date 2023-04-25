let lastActiveTabId;
let lastActiveWindowId;

const SWITCH_INTERVAL = 120000; // タブ切り替え間隔（ミリ秒）

const suspendTimeouts = {};

async function switchTab() {
  try {
    const targetWindowId = await new Promise((resolve) =>
      chrome.storage.sync.get('targetWindowId', ({ targetWindowId }) => resolve(targetWindowId))
    );

    if (targetWindowId) {
      // Check if the window still exists
      chrome.windows.get(targetWindowId, (window) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
          // Clear the targetWindowId if the window does not exist
          chrome.storage.sync.set({ targetWindowId: null });
        } else {
          // If the window exists, switch tabs
          chrome.tabs.query({ windowId: targetWindowId }, async (tabs) => {
            if (tabs.length > 1) {
              let currentTab = await new Promise((resolve) => chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0])));
              let currentTabIndex = tabs.findIndex((tab) => tab.active);
              let nextTabIndex = (currentTabIndex + 1) % tabs.length;

               // Close duplicate tabs
               const currentTabUrl = currentTab.url;
               for (let i = 0; i < tabs.length; i++) {
                 const tab = tabs[i];
                 if (tab.url === currentTabUrl && tab.id !== currentTab.id) {
                   chrome.tabs.remove(tab.id);
                 }
               }

              chrome.tabs.update(tabs[currentTabIndex].id, { muted: true });
              chrome.tabs.update(tabs[nextTabIndex].id, { active: true, muted: false });
            }
          });
        }
      });
    }
  } catch (error) {
    console.error('Error in switchTab:', error);
  }
}

chrome.storage.sync.get('isEnabled', ({ isEnabled }) => {
  if (isEnabled === undefined) {
    chrome.storage.sync.set({ isEnabled: true });
  }
});

chrome.alarms.create('switchTabAlarm', { periodInMinutes: SWITCH_INTERVAL / 60000 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'switchTabAlarm') {
    const isEnabled = await new Promise((resolve) => chrome.storage.sync.get('isEnabled', ({ isEnabled }) => resolve(isEnabled)));
    if (isEnabled) {
      switchTab();
    }
  }
});

// タブが非アクティブになったときにサスペンドする関数
function suspendTab(tab) {
  chrome.storage.sync.get("suspendDelay", data => {
    const suspendDelay = data.suspendDelay || 10;
    if (!tab.url.startsWith("chrome://") && !tab.url.startsWith("chrome-extension://")) {
      if (!suspendTimeouts[tab.id]) {
        suspendTimeouts[tab.id] = setTimeout(() => {
          const suspendedUrl = "chrome-extension://" + chrome.runtime.id + "/suspended.html#" + encodeURIComponent(tab.url);
          chrome.tabs.update(tab.id, { url: suspendedUrl });
        }, suspendDelay * 60 * 1000);
      }
    }
  });
}

function clearSuspendTimeout(tabId) {
  clearTimeout(suspendTimeouts[tabId]);
  suspendTimeouts[tabId] = null;
}

// タブがアクティブになったときに再開する関数
function resumeTab(tab) {
  clearSuspendTimeout(tab.id)
  if (tab.url.startsWith("chrome-extension://" + chrome.runtime.id + "/suspended.html")) {
    const originalUrl = decodeURIComponent(tab.url.split("#")[1]);
    chrome.tabs.update(tab.id, { url: originalUrl });
  }
}

// タブのアクティブ状態を監視して、必要に応じてサスペンドと再開を行う
chrome.tabs.onActivated.addListener(activeInfo => {
  chrome.tabs.get(activeInfo.tabId, resumeTab);

  // chrome.tabs.query({ active: false, currentWindow: true }, tabs => {
  chrome.tabs.query({ active: false }, tabs => {
    tabs.forEach(suspendTab);
  });
});

// タブが閉じられたときにタイムアウトをクリアする
chrome.tabs.onRemoved.addListener(tabId => {
  clearSuspendTimeout(tabId)
});

// タブが更新されたときにタイムアウトをクリアする
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    if (tab.active) {
      resumeTab(tab);
    } else {
      suspendTab(tab);
    }
  }
});

// サスペンドディレイの設定が変更された場合には、拡張機能をリロードするか、すべてのタブを再起動する必要がある