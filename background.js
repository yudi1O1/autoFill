const PROFILE_KEY = "__quickfill_profile";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "QUICKFILL_SAVE_FORM_FIELDS") {
    saveUniqueFormFields(message.fields);
    return false;
  }

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

function saveUniqueFormFields(fields) {
  const submittedFields = Array.isArray(fields) ? fields : [];
  if (!submittedFields.length) {
    return;
  }

  chrome.storage.local.get([PROFILE_KEY], (items) => {
    const existingProfile = items[PROFILE_KEY] || {};
    const nextProfile = { ...existingProfile };
    let changed = false;

    submittedFields.forEach((field) => {
      const name = String(field?.name || "").trim();
      const value = String(field?.value || "").trim();
      if (
        !name ||
        !value ||
        Object.prototype.hasOwnProperty.call(nextProfile, name)
      ) {
        return;
      }

      nextProfile[name] = value;
      changed = true;
    });

    if (changed) {
      chrome.storage.local.set({ [PROFILE_KEY]: nextProfile });
    }
  });
}
