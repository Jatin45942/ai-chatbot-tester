chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    sentinelSettings: {
      delayMs: 2500,
      maxTests: 12,
      autoSubmit: false,
      transform: "none"
    }
  });
});
