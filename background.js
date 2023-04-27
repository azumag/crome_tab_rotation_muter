const SWITCH_INTERVAL = 50000; // タブ切り替え間隔（ミリ秒）

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
              let currentTabIndex = tabs.findIndex((tab) => tab.active);
              let nextTabIndex = (currentTabIndex + 1) % tabs.length;

              chrome.tabs.update(tabs[currentTabIndex].id, { muted: true });
              chrome.tabs.update(tabs[nextTabIndex].id, { active: true, muted: false });

              // suspend previous tab
              const suspendedUrl = "chrome-extension://" + chrome.runtime.id + "/suspended.html#" + encodeURIComponent(tabs[currentTabIndex].url);
              chrome.tabs.update(tabs[currentTabIndex].id, { url: suspendedUrl });

              // Close duplicate tabs
              const urls = tabs.map(tab => tab.url);
              const uniqueUrls = [...new Set(urls)]; // Get unique URLs
              if (urls.length !== uniqueUrls.length) { // If there are duplicate URLs
                const tabsToRemove = tabs.filter((tab, index) => urls.indexOf(tab.url) !== index); // Get duplicate tabs
                for (let i = 0; i < tabsToRemove.length; i++) {
                  chrome.tabs.remove(tabsToRemove[i].id); // Remove duplicate tabs
                }
                tabs = tabs.filter(tab => urls.indexOf(tab.url) === urls.lastIndexOf(tab.url)); // Remove duplicate tabs from tabs array
              }
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
  suspendTimeouts[tabId] = false;
}

// タブがアクティブになったときに再開する関数
async function resumeTab(tab) {
  // clearSuspendTimeout(tab.id)
  console.log('resumeTab', tab.url);

  if (await checkAndCloseOfflineTab(tab)) {
    // if online
    if (tab.url.startsWith("chrome-extension://" + chrome.runtime.id + "/suspended.html")) {
      console.log('suspendedTab');
      const originalUrl = decodeURIComponent(tab.url.split("#")[1]);
      chrome.tabs.update(tab.id, { url: originalUrl, muted: false })
    }
  };
}

// タブのアクティブ状態を監視して、必要に応じてサスペンドと再開を行う
chrome.tabs.onActivated.addListener(async activeInfo => {
  const targetWindowId = await new Promise((resolve) => chrome.storage.sync.get('targetWindowId', ({ targetWindowId }) => resolve(targetWindowId)))
  if (activeInfo.windowId === targetWindowId) {
    chrome.tabs.get(activeInfo.tabId, resumeTab);
    console.log('activated', activeInfo);
  }
});

function getUserId(clientId, accessToken, username) {
  const requestUrl = `https://api.twitch.tv/helix/users?login=${username}`;

  return fetch(requestUrl, {
    headers: {
      "Client-ID": clientId,
      "Authorization": `Bearer ${accessToken}`
    }
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.data.length > 0) {
        return data.data[0].id;
      } else {
        throw new Error("User not found");
      }
    })
    .catch((error) => {
      console.error("Error fetching user ID:", error);
    });
}

async function checkAndCloseOfflineTab(tab) {
  console.log('check offline', tab.url);
  if (!tab.url.includes("twitch")) {
    console.log('tab is not twitch', tab.url);
    return;
  }

  let channelName;
  if (tab.url.includes("extension")) {
    console.log('tab is suspended', tab.url);
    const splittedUrl = tab.url.split("%2F");
    channelName = splittedUrl[splittedUrl.length - 1];
  } else {
    const splittedUrl = tab.url.split("/");
    channelName = splittedUrl[splittedUrl.length - 1];
  }
  console.log('channelName', channelName);

  const settings = await chrome.storage.sync.get(["clientId", "accessToken"]);
  const clientId = settings.clientId;
  const accessToken = settings.accessToken;

  const userId = await getUserId(clientId, accessToken, channelName);
  const requestUrl = `https://api.twitch.tv/helix/streams?user_id=${userId}`;
  const response = await fetch(requestUrl, {
    headers: {
      "Client-ID": clientId,
      "Authorization": `Bearer ${accessToken}`
    }
  });
  const data = await response.json();

  if (data.data.length > 0) {
    // Stream is online
    console.log("online", tab.url);
    return true;
  } else {
    // offline
    console.log("offline", tab.url);
    chrome.tabs.remove(tab.id);
    return false;
  }
}

// TODO: 一気に5タブ開いてしまう問題を解決したi
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === "openNewStream") {
    const targetWindowId = await new Promise((resolve) => chrome.storage.sync.get('targetWindowId', ({ targetWindowId }) => resolve(targetWindowId)))
    const url = message.value;
    console.log("openNew:", url);
    if (targetWindowId) {
      const suspendedUrl = "chrome-extension://" + chrome.runtime.id + "/suspended.html#" + encodeURIComponent(url);

      chrome.tabs.query({ windowId: targetWindowId }, tabs => {
        const activeTabIndex = tabs.findIndex(tab => tab.active);
        console.log("Active tab Idx", activeTabIndex);
        chrome.tabs.query({ url: suspendedUrl, windowId: targetWindowId }, (tabs) => {
          if (tabs.length > 0) {
            // nothing to do
            console.log('duplicate tabs');
          } else {
            chrome.tabs.create({ url: suspendedUrl, windowId: targetWindowId, active: false, index: activeTabIndex + 1 });
          }
        });
      });
    }
  }
  return true;
});

// // タブが閉じられたときにタイムアウトをクリアする
// chrome.tabs.onRemoved.addListener(tabId => {
//   clearSuspendTimeout(tabId)
// });

// // タブが更新されたときにタイムアウトをクリアする
// chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
//   if (changeInfo.status === "complete") {
//     if (tab.active) {
//       resumeTab(tab);
//     } else {
//       suspendTab(tab);
//     }
//   }
// });

// [x] タブ自動巡回
// [x] すべてミュート
// [x] 対象ウィンドウ限定
// [x] enable/disable
// [x] タブサスペンド
// [x] 重複除外
// 対象ウィンドウのみ処理
// 
// 巡回時間設定

// サスペンドディレイの設定が変更された場合には、拡張機能をリロードするか、すべてのタブを再起動する必要がある
// 対象ウィンドウのタブだけにサスペンド処理をしたい
// サスペンドするかどうかを切り替えたい
// オフラインなら閉じる（オンオフ切り替えも実装）
// オンライン通知なれば別タブで開きたい

// アクティブタブになったらそのときだけmutaitonobserverを設定、視聴するがでたらリンクを別タブで開く
// アクティブタブになったとき、そのライブ状況をapiで見て、オフラインなら閉じる
// [x] 重複なら閉じる