const toggleSwitch = document.getElementById('toggleSwitch');

async function updateSwitch() {
  const isEnabled = await new Promise((resolve) =>
    chrome.storage.sync.get('isEnabled', ({ isEnabled }) => resolve(isEnabled))
  );
  toggleSwitch.checked = isEnabled;
}

toggleSwitch.addEventListener('change', async () => {
  const isEnabled = await new Promise((resolve) =>
    chrome.storage.sync.get('isEnabled', ({ isEnabled }) => resolve(isEnabled))
  );
  chrome.storage.sync.set({ isEnabled: !isEnabled });
});

updateSwitch();

const registerWindow = document.getElementById('registerWindow');

registerWindow.addEventListener('click', async () => {
  const currentWindow = await new Promise((resolve) =>
    chrome.windows.getCurrent({}, (win) => resolve(win))
  );
  chrome.storage.sync.set({ targetWindowId: currentWindow.id });
});

const muteAllTabs = () => {
  chrome.tabs.query({ currentWindow: true }, (tabs) => {
    tabs.forEach((tab) => {
      chrome.tabs.update(tab.id, { muted: true });
    });
  });
};

document.getElementById("muteAllTabsBtn").addEventListener("click", muteAllTabs);