chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "QUICKFILL_FILL_CARD") {
    return false;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "No active tab found." });
      return;
    }

    chrome.tabs.sendMessage(
      tabId,
      {
        type: "QUICKFILL_APPLY_CARD",
        card: message.card,
        includeCvv: Boolean(message.includeCvv),
      },
      (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          sendResponse({ ok: false, error: error.message });
          return;
        }

        sendResponse(response || { ok: true });
      },
    );
  });

  return true;
});
