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