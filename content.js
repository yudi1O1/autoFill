const PROFILE_KEY = "__quickfill_profile";
const PROFILE_SECURITY_KEY = "__quickfill_profile_security";

let profileAutofillAttempted = false;

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
    input.getAttribute("placeholder") ||
    getLabelText(input)
  );
}

function getFieldSearchText(input) {
  return [
    input.name,
    input.id,
    input.getAttribute("autocomplete"),
    input.getAttribute("aria-label"),
    input.getAttribute("placeholder"),
    getLabelText(input),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
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

function getInputValue(input) {
  if (
    input instanceof HTMLInputElement &&
    ["checkbox", "radio"].includes(input.type) &&
    !input.checked
  ) {
    return "";
  }

  return input.value?.trim() || "";
}

function getCardFillableInputs(scope = document) {
  return scope.querySelectorAll(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="file"]), select',
  );
}

function isCardField(input) {
  return Boolean(detectCardFieldType(input));
}

function detectCardFieldType(input) {
  const text = getFieldSearchText(input);

  if (
    text.includes("cvv") ||
    text.includes("cvc") ||
    text.includes("cc-csc") ||
    text.includes("security code") ||
    text.includes("card verification")
  ) {
    return "cvv";
  }

  if (
    text.includes("cc-number") ||
    text.includes("cardnumber") ||
    text.includes("card-number") ||
    text.includes("card number") ||
    text.includes("credit card number") ||
    text.includes("debit card number")
  ) {
    return "number";
  }

  if (
    text.includes("cc-name") ||
    text.includes("cardholder") ||
    text.includes("card holder") ||
    text.includes("name on card")
  ) {
    return "name";
  }

  if (
    text.includes("cc-exp-month") ||
    text.includes("exp month") ||
    text.includes("expiry month") ||
    text.includes("expiration month")
  ) {
    return "expiryMonth";
  }

  if (
    text.includes("cc-exp-year") ||
    text.includes("exp year") ||
    text.includes("expiry year") ||
    text.includes("expiration year")
  ) {
    return "expiryYear";
  }

  if (
    text.includes("cc-exp") ||
    text.includes("exp date") ||
    text.includes("expiry date") ||
    text.includes("expiration date")
  ) {
    return "expiryDate";
  }

  if (
    text.includes("billing zip") ||
    text.includes("billing postal") ||
    text.includes("card zip") ||
    text.includes("card postal") ||
    text.includes("cc-postal")
  ) {
    return "billingZip";
  }

  return "";
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

async function autoFillForms() {
  if (profileAutofillAttempted) {
    return;
  }
  profileAutofillAttempted = true;

  const items = await storageGet([PROFILE_KEY, PROFILE_SECURITY_KEY]);
  const profile = items[PROFILE_KEY] || {};
  const security = items[PROFILE_SECURITY_KEY] || null;
  const fieldsToFill = [];

  getFillableInputs().forEach((input) => {
    const identifier = getFieldIdentifier(input);
    if (!identifier || input.value || isCardField(input)) {
      return;
    }

    const normalized = normalizeFieldName(identifier);
    const savedValue = profile[normalized];
    if (savedValue) {
      fieldsToFill.push({ input, savedValue });
    }
  });

  if (!fieldsToFill.length) {
    return;
  }

  const allowed = confirm("QuickFill found saved data for this page. Do you want to autofill it?");
  if (!allowed) {
    return;
  }

  if (!security) {
    alert("Set a QuickFill password before autofilling saved data.");
    return;
  }

  const password = prompt("Enter your QuickFill password to autofill saved data:");
  if (!password) {
    return;
  }

  const isValid = await verifyPassword(password, security);
  if (!isValid) {
    alert("Incorrect QuickFill password. Autofill canceled.");
    return;
  }

  fieldsToFill.forEach(({ input, savedValue }) => {
    if (!input.value) {
      setNativeValue(input, savedValue);
    }
  });
}

function saveFormData() {
  document.querySelectorAll("form").forEach((form) => {
    if (form.dataset.quickfillBound === "true") {
      return;
    }

    form.dataset.quickfillBound = "true";
    form.addEventListener("submit", () => {
      const fields = [];
      const fieldNames = new Set();

      getFillableInputs(form).forEach((input) => {
        const identifier = getFieldIdentifier(input);
        const value = getInputValue(input);
        if (!identifier || !value || isCardField(input)) {
          return;
        }

        const fieldName = normalizeFieldName(identifier);
        if (!fieldName || fieldNames.has(fieldName)) {
          return;
        }

        fieldNames.add(fieldName);
        fields.push({ name: fieldName, value });
      });

      if (fields.length) {
        chrome.runtime.sendMessage({
          type: "QUICKFILL_SAVE_FORM_FIELDS",
          fields,
        });
      }
    });
  });
}

function fillCardFields(card, includeCvv) {
  let filledCount = 0;

  getCardFillableInputs().forEach((input) => {
    const fieldType = detectCardFieldType(input);
    if (!fieldType || input.value) {
      return;
    }

    const value = getCardFieldValue(card, fieldType, input, includeCvv);
    if (!value) {
      return;
    }

    setNativeValue(input, value);
    filledCount += 1;
  });

  return filledCount;
}

function getCardFieldValue(card, fieldType, input, includeCvv) {
  if (fieldType === "cvv") {
    return includeCvv ? card.cvv : "";
  }

  if (fieldType === "number") {
    return card.number;
  }

  if (fieldType === "name") {
    return card.nameOnCard;
  }

  if (fieldType === "expiryMonth") {
    return card.expiryMonth;
  }

  if (fieldType === "expiryYear") {
    return card.expiryYear;
  }

  if (fieldType === "expiryDate") {
    const maxLength = Number(input.getAttribute("maxlength") || 0);
    const year = maxLength > 0 && maxLength <= 5 ? card.expiryYear.slice(-2) : card.expiryYear;
    return `${card.expiryMonth}/${year}`;
  }

  if (fieldType === "billingZip") {
    return card.billingZip;
  }

  return "";
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "QUICKFILL_APPLY_CARD") {
    return false;
  }

  const filledCount = fillCardFields(message.card || {}, Boolean(message.includeCvv));
  sendResponse({ ok: true, filledCount });
  return false;
});

document.addEventListener("DOMContentLoaded", () => {
  autoFillForms();
  saveFormData();
});

if (document.readyState !== "loading") {
  autoFillForms();
  saveFormData();
}

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

async function hashPassword(password, salt) {
  const data = new Uint8Array([
    ...salt,
    ...new TextEncoder().encode(password),
  ]);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bufferToBase64(new Uint8Array(digest));
}

async function verifyPassword(password, security) {
  const salt = base64ToUint8Array(security.salt);
  const hash = await hashPassword(password, salt);
  return hash === security.hash;
}

function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...buffer));
}

function base64ToUint8Array(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
