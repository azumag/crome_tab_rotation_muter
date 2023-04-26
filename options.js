document.addEventListener("DOMContentLoaded", () => {
  const suspendDelayInput = document.getElementById("suspendDelay");
  const saveButton = document.getElementById("saveButton");

  // 保存されているサスペンド時間を読み込む
  chrome.storage.sync.get("suspendDelay", data => {
    suspendDelayInput.value = data.suspendDelay || 10;
  });

  // サスペンド時間を保存する
  saveButton.addEventListener("click", () => {
    const suspendDelay = parseInt(suspendDelayInput.value);
    chrome.storage.sync.set({ suspendDelay });
  });
});


document.addEventListener("DOMContentLoaded", () => {
  // Load saved settings
  chrome.storage.sync.get(["clientId", "accessToken"], (settings) => {
    if (settings.clientId) {
      document.getElementById("clientId").value = settings.clientId;
    }
    if (settings.accessToken) {
      document.getElementById("accessToken").value = settings.accessToken;
    }
  });

  // Save settings when form is submitted
  document.getElementById("settings-form").addEventListener("submit", (event) => {
    event.preventDefault();

    const clientId = document.getElementById("clientId").value;
    const accessToken = document.getElementById("accessToken").value;

    chrome.storage.sync.set({ clientId, accessToken }, () => {
      console.log("Settings saved.");
    });
  });
});