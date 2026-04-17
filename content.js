const PROFILE_KEY = "__quickfill_profile";

function normalizeFieldName(name) {
  if (!name) {
    return "";
  }

  const lowerName = name.toLowerCase();
  if (lowerName.includes("email")) return "email";
  if (
    lowerName.includes("phone") ||
    lowerName.includes("tel") ||
    lowerName.includes("mobile")
  ) {
    return "phone";
  }
  if (
    lowerName.includes("name") &&
    !lowerName.includes("user") &&
    !lowerName.includes("company")
  ) {
    return "name";
  }
  if (lowerName.includes("address")) return "address";
  if (
    lowerName.includes("letter") ||
    lowerName.includes("cover") ||
    lowerName.includes("application")
  ) {
    return "application_letter";
  }
  if (lowerName.includes("message") || lowerName.includes("comment")) {
    return "message";
  }

  return lowerName.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || name;
}

function getFieldIdentifier(input) {
  return (
    input.name ||
    input.id ||
    input.getAttribute("autocomplete") ||
    input.getAttribute("aria-label") ||
    getLabelText(input)
  );
}

function getLabelText(input) {
  if (input.labels && input.labels.length) {
    return Array.from(input.labels)
      .map((label) => label.textContent?.trim() || "")
      .join(" ");
  }

  const wrapperLabel = input.closest("label");
  return wrapperLabel?.textContent?.trim() || "";
}

function getFillableInputs(scope = document) {
  return scope.querySelectorAll(
    'input:not([type="password"]):not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="file"]), textarea, select',
  );
}

function setNativeValue(input, value) {
  const prototype =
    input instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

  if (descriptor?.set) {
    descriptor.set.call(input, value);
  } else {
    input.value = value;
  }

  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function autoFillForms() {
  chrome.storage.local.get([PROFILE_KEY], (items) => {
    const profile = items[PROFILE_KEY] || {};

    getFillableInputs().forEach((input) => {
      const identifier = getFieldIdentifier(input);
      if (!identifier || input.value) {
        return;
      }

      const normalized = normalizeFieldName(identifier);
      const savedValue = profile[normalized];
      if (savedValue) {
        setNativeValue(input, savedValue);
      }
    });
  });
}

function saveFormData() {
  document.querySelectorAll("form").forEach((form) => {
    if (form.dataset.quickfillBound === "true") {
      return;
    }

    form.dataset.quickfillBound = "true";
    form.addEventListener("submit", () => {
      chrome.storage.local.get([PROFILE_KEY], (items) => {
        const existingProfile = items[PROFILE_KEY] || {};
        const nextProfile = { ...existingProfile };

        getFillableInputs(form).forEach((input) => {
          const identifier = getFieldIdentifier(input);
          const value = input.value?.trim();
          if (!identifier || !value) {
            return;
          }

          const normalized = normalizeFieldName(identifier);
          nextProfile[normalized] = value;
        });

        chrome.storage.local.set({ [PROFILE_KEY]: nextProfile });
      });
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  autoFillForms();
  saveFormData();
});

if (document.readyState !== "loading") {
  autoFillForms();
  saveFormData();
}
