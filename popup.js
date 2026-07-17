const PROFILE_KEY = "__quickfill_profile";
const VAULT_KEY = "__quickfill_card_vault";
const PROFILE_SECURITY_KEY = "__quickfill_profile_security";
const CARD_AUTOFILL_CVV_KEY = "__quickfill_card_autofill_cvv";
const CARD_REVEAL_MS = 30000;
const PROFILE_REVEAL_MS = 30000;
const RESERVED_KEYS = new Set([
  PROFILE_KEY,
  VAULT_KEY,
  PROFILE_SECURITY_KEY,
  CARD_AUTOFILL_CVV_KEY,
]);

let profileEditKey = null;
let cardEditId = null;
let unlockedVault = null;
let unlockedPassword = "";
let activeView = "profile";
let revealedCardId = null;
let revealTimer = null;
let revealedProfileKey = null;
let profileRevealTimer = null;

document.addEventListener("DOMContentLoaded", async () => {
  applyExpandedMode();
  bindEvents();
  await migrateLegacyStorage();
  await refreshAll();
  setActiveView("profile");
});

function bindEvents() {
  document
    .getElementById("expand-dashboard")
    .addEventListener("click", openExpandedDashboard);
  document
    .getElementById("toggle-profile-panel")
    .addEventListener("click", () => setActiveView("profile"));
  document
    .getElementById("toggle-vault-panel")
    .addEventListener("click", () => setActiveView("vault"));
  document
    .getElementById("profile-security-form")
    .addEventListener("submit", saveProfileSecurityPassword);
  document
    .getElementById("profile-form")
    .addEventListener("submit", handleProfileSubmit);
  document
    .getElementById("profile-cancel")
    .addEventListener("click", resetProfileForm);
  document
    .getElementById("clear-profile")
    .addEventListener("click", clearProfileData);
  document
    .getElementById("export-word")
    .addEventListener("click", () => exportProfileData("word"));
  document
    .getElementById("export-pdf")
    .addEventListener("click", () => exportProfileData("pdf"));
  document
    .getElementById("export-json")
    .addEventListener("click", () => exportProfileData("json"));
  document
    .getElementById("vault-setup-form")
    .addEventListener("submit", createVault);
  document
    .getElementById("vault-unlock-form")
    .addEventListener("submit", unlockVault);
  document.getElementById("lock-vault").addEventListener("click", lockVault);
  document
    .getElementById("delete-vault")
    .addEventListener("click", deleteVault);
  document.getElementById("card-form").addEventListener("submit", saveCard);
  document
    .getElementById("autofill-cvv")
    .addEventListener("change", saveCardAutofillCvvSetting);
}

function applyExpandedMode() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("view") === "expanded") {
    document.body.classList.add("expanded-view");
    const expandButton = document.getElementById("expand-dashboard");
    expandButton.setAttribute("aria-label", "Close fullscreen dashboard");
    expandButton.title = "Close fullscreen dashboard";
  }
}

function openExpandedDashboard() {
  if (document.body.classList.contains("expanded-view")) {
    closeExpandedDashboard();
    return;
  }

  chrome.tabs.create({
    url: chrome.runtime.getURL("popup.html?view=expanded"),
  });
}

function closeExpandedDashboard() {
  if (chrome.tabs?.getCurrent && chrome.tabs?.remove) {
    chrome.tabs.getCurrent((tab) => {
      if (tab?.id) {
        chrome.tabs.remove(tab.id);
        return;
      }

      window.close();
    });
    return;
  }

  window.close();
}

function setActiveView(view) {
  activeView = view;
  const isProfile = view === "profile";
  document.getElementById("profile-panel").classList.toggle("hidden", !isProfile);
  document.getElementById("vault-content").classList.toggle("hidden", isProfile);
  document
    .getElementById("toggle-profile-panel")
    .setAttribute("aria-selected", String(isProfile));
  document
    .getElementById("toggle-vault-panel")
    .setAttribute("aria-selected", String(!isProfile));
}

async function migrateLegacyStorage() {
  const items = await storageGet(null);
  if (items[PROFILE_KEY]) {
    return;
  }

  const legacyEntries = Object.entries(items).filter(
    ([key]) => !RESERVED_KEYS.has(key),
  );

  if (!legacyEntries.length) {
    await storageSet({ [PROFILE_KEY]: {} });
    return;
  }

  const profile = Object.fromEntries(
    legacyEntries.map(([key, value]) => [key, String(value ?? "")]),
  );

  await storageSet({ [PROFILE_KEY]: profile });
  await storageRemove(legacyEntries.map(([key]) => key));
}

async function refreshAll() {
  const profile = await getProfileData();
  const vault = await getVaultData();
  const profileSecurity = await getProfileSecurity();
  const cardAutofillCvv = await getCardAutofillCvvSetting();

  renderProfile(profile, profileSecurity);
  renderVault(vault);
  renderCardAutofillCvvSetting(cardAutofillCvv);
}

async function getProfileData() {
  const items = await storageGet([PROFILE_KEY]);
  return items[PROFILE_KEY] || {};
}

async function setProfileData(profile) {
  await storageSet({ [PROFILE_KEY]: profile });
}

async function getProfileSecurity() {
  const items = await storageGet([PROFILE_SECURITY_KEY]);
  return items[PROFILE_SECURITY_KEY] || null;
}

async function getVaultData() {
  const items = await storageGet([VAULT_KEY]);
  return items[VAULT_KEY] || null;
}

async function getCardAutofillCvvSetting() {
  const items = await storageGet([CARD_AUTOFILL_CVV_KEY]);
  return Boolean(items[CARD_AUTOFILL_CVV_KEY]);
}

async function saveCardAutofillCvvSetting(event) {
  await storageSet({ [CARD_AUTOFILL_CVV_KEY]: event.target.checked });
  setFeedback(event.target.checked ? "CVV autofill enabled." : "CVV autofill disabled.");
}

function renderCardAutofillCvvSetting(enabled) {
  document.getElementById("autofill-cvv").checked = enabled;
}

function renderProfile(profile, profileSecurity) {
  const list = document.getElementById("profile-list");
  const count = Object.keys(profile).length;
  const clearButton = document.getElementById("clear-profile");
  const passwordInput = document.getElementById("profile-security-password");
  const passwordButton = document.getElementById("profile-security-submit");
  document.getElementById("profile-count").textContent = String(count);
  clearButton.classList.toggle("hidden", count === 0);
  passwordInput.placeholder = profileSecurity
    ? "Update delete password"
    : "Set delete password";
  passwordButton.textContent = profileSecurity ? "Update password" : "Save password";

  if (!count) {
    list.className = "card-list empty-state";
    list.textContent = "No profile data saved yet.";
    return;
  }

  list.className = "card-list";
  list.innerHTML = "";

  Object.entries(profile)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, value]) => {
      const isRevealed = revealedProfileKey === key;
      const card = document.createElement("article");
      card.className = "entry-card";

      const head = document.createElement("div");
      head.className = "entry-head";

      const textWrap = document.createElement("div");
      const title = document.createElement("div");
      title.className = "entry-key";
      title.textContent = key;
      const body = document.createElement("div");
      body.className = "entry-value";
      body.textContent = isRevealed ? value || "(empty)" : "Hidden - password required";
      textWrap.append(title, body);

      const actions = document.createElement("div");
      actions.className = "entry-actions";

      const viewButton = document.createElement("button");
      viewButton.type = "button";
      viewButton.className = "ghost-button";
      viewButton.textContent = isRevealed ? "Hide details" : "View details";
      viewButton.addEventListener("click", () => toggleProfileDetails(key));

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "ghost-button";
      editButton.textContent = "Edit";
      editButton.addEventListener("click", () => beginProfileEdit(key, value));

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "danger-button";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", () => deleteProfileField(key));

      actions.append(viewButton, editButton, deleteButton);
      head.append(textWrap, actions);
      card.append(head);
      list.append(card);
    });
}

function renderVault(vault) {
  const setupForm = document.getElementById("vault-setup-form");
  const unlockForm = document.getElementById("vault-unlock-form");
  const vaultPanel = document.getElementById("vault-panel");
  const lockButton = document.getElementById("lock-vault");
  const deleteButton = document.getElementById("delete-vault");
  const status = document.getElementById("vault-status");
  const countEl = document.getElementById("vault-count");

  const cardCount = unlockedVault?.cards?.length || 0;
  countEl.textContent = String(vault ? cardCount || vault.cardCount || 0 : 0);

  setupForm.classList.add("hidden");
  unlockForm.classList.add("hidden");
  vaultPanel.classList.add("hidden");
  lockButton.classList.add("hidden");
  deleteButton.classList.add("hidden");

  if (!vault) {
    setupForm.classList.remove("hidden");
    status.textContent = "Create a master password to protect card data";
    renderCardList([]);
    return;
  }

  deleteButton.classList.remove("hidden");

  if (!unlockedVault) {
    unlockForm.classList.remove("hidden");
    status.textContent = "Vault locked";
    renderCardList([]);
    return;
  }

  vaultPanel.classList.remove("hidden");
  lockButton.classList.remove("hidden");
  status.textContent = "Vault unlocked in this popup session";
  renderCardList(unlockedVault.cards || []);
}

function renderCardList(cards) {
  const cardList = document.getElementById("card-list");
  if (!cards.length) {
    cardList.className = "card-list empty-state";
    cardList.textContent = "No cards saved yet.";
    return;
  }

  cardList.className = "card-list";
  cardList.innerHTML = "";

  cards.forEach((card) => {
    const isRevealed = revealedCardId === card.id;
    const cardEl = document.createElement("article");
    cardEl.className = "entry-card";

    const head = document.createElement("div");
    head.className = "entry-head";

    const textWrap = document.createElement("div");
    const title = document.createElement("div");
    title.className = "entry-title";
    title.textContent = card.label;

    const subtext = document.createElement("div");
    subtext.className = "entry-subtext";
    subtext.textContent = [
      `${card.nameOnCard} - ${maskCardNumber(card.number)}`,
      `Expires ${card.expiryMonth}/${card.expiryYear}`,
      card.billingZip ? `Billing ZIP/PIN: ${card.billingZip}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    textWrap.append(title, subtext);

    if (isRevealed) {
      const details = document.createElement("div");
      details.className = "card-sensitive-details";
      details.textContent = `Card number: ${formatCardNumber(card.number)} | CVV: ${card.cvv}`;
      textWrap.append(details);
    }

    const actions = document.createElement("div");
    actions.className = "entry-actions";

    const viewButton = document.createElement("button");
    viewButton.type = "button";
    viewButton.className = "ghost-button";
    viewButton.textContent = isRevealed ? "Hide details" : "View details";
    viewButton.addEventListener("click", () => toggleCardDetails(card.id));

    const fillButton = document.createElement("button");
    fillButton.type = "button";
    fillButton.className = "ghost-button";
    fillButton.textContent = "Fill this card";
    fillButton.addEventListener("click", () => fillCard(card.id));

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "ghost-button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => beginCardEdit(card.id));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger-button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => removeCard(card.id));

    actions.append(viewButton, fillButton, editButton, deleteButton);
    head.append(textWrap, actions);
    cardEl.append(head);
    cardList.append(cardEl);
  });
}

async function handleProfileSubmit(event) {
  event.preventDefault();

  const keyInput = document.getElementById("profile-key");
  const valueInput = document.getElementById("profile-value");
  const nextKey = keyInput.value.trim();
  const nextValue = valueInput.value.trim();

  if (!nextKey || !nextValue) {
    setFeedback("Please enter both a field name and a value.", true);
    return;
  }

  const profile = await getProfileData();
  if (profileEditKey && profileEditKey !== nextKey) {
    delete profile[profileEditKey];
  }
  profile[nextKey] = nextValue;
  await setProfileData(profile);
  clearRevealedProfile();
  resetProfileForm();
  renderProfile(profile, await getProfileSecurity());
  setFeedback("Profile data saved.");
}

async function saveProfileSecurityPassword(event) {
  event.preventDefault();

  const password = document
    .getElementById("profile-security-password")
    .value.trim();

  if (password.length < 4) {
    setFeedback("Use at least 4 characters for the delete password.", true);
    return;
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPassword(password, salt);
  await storageSet({
    [PROFILE_SECURITY_KEY]: {
      salt: bufferToBase64(salt),
      hash,
    },
  });

  document.getElementById("profile-security-form").reset();
  clearRevealedProfile();
  const profile = await getProfileData();
  renderProfile(profile, await getProfileSecurity());
  setFeedback("Password saved.");
}

async function beginProfileEdit(key, value) {
  const authorized = await verifyProfilePasswordAction({
    missingMessage: "Set a password before editing saved fields.",
    promptMessage: "Enter your password to edit this saved field:",
    cancelMessage: "Edit canceled.",
  });
  if (!authorized) {
    return;
  }

  profileEditKey = key;
  document.getElementById("profile-key").value = key;
  document.getElementById("profile-value").value = value;
  document.getElementById("profile-submit").textContent = "Update field";
  document.getElementById("profile-cancel").classList.remove("hidden");
}

function resetProfileForm() {
  profileEditKey = null;
  document.getElementById("profile-form").reset();
  document.getElementById("profile-submit").textContent = "Save field";
  document.getElementById("profile-cancel").classList.add("hidden");
}

async function deleteProfileField(key) {
  const authorized = await verifyProfilePasswordAction({
    missingMessage: "Set a password before removing saved fields.",
    promptMessage: "Enter your password to delete this saved field:",
    cancelMessage: "Delete action canceled.",
  });
  if (!authorized) {
    return;
  }

  const ok = confirm(`Delete saved field "${key}"?`);
  if (!ok) {
    return;
  }

  const profile = await getProfileData();
  delete profile[key];
  await setProfileData(profile);
  if (revealedProfileKey === key) {
    clearRevealedProfile();
  }
  if (profileEditKey === key) {
    resetProfileForm();
  }
  renderProfile(profile, await getProfileSecurity());
  setFeedback("Profile field deleted.");
}

async function clearProfileData() {
  const authorized = await verifyProfilePasswordAction({
    missingMessage: "Set a password before clearing saved fields.",
    promptMessage: "Enter your password to clear saved fields:",
    cancelMessage: "Clear action canceled.",
  });
  if (!authorized) {
    return;
  }

  const ok = confirm("Clear all saved profile data?");
  if (!ok) {
    return;
  }

  await setProfileData({});
  clearRevealedProfile();
  resetProfileForm();
  renderProfile({}, await getProfileSecurity());
  setFeedback("All profile data cleared.");
}

async function toggleProfileDetails(key) {
  if (revealedProfileKey === key) {
    clearRevealedProfile();
    renderProfile(await getProfileData(), await getProfileSecurity());
    return;
  }

  clearRevealedProfile();
  const authorized = await verifyProfilePasswordAction({
    missingMessage: "Set a password before viewing saved details.",
    promptMessage: "Enter your password to view this saved field:",
    cancelMessage: "View canceled.",
  });
  if (!authorized) {
    renderProfile(await getProfileData(), await getProfileSecurity());
    return;
  }

  revealedProfileKey = key;
  window.clearTimeout(profileRevealTimer);
  profileRevealTimer = window.setTimeout(async () => {
    clearRevealedProfile();
    renderProfile(await getProfileData(), await getProfileSecurity());
  }, PROFILE_REVEAL_MS);
  renderProfile(await getProfileData(), await getProfileSecurity());
  setFeedback("Saved field revealed for 30 seconds.");
}

async function verifyProfilePasswordAction({
  missingMessage,
  promptMessage,
  cancelMessage,
}) {
  const security = await getProfileSecurity();
  if (!security) {
    setFeedback(missingMessage, true);
    return false;
  }

  const password = prompt(promptMessage);
  if (!password) {
    setFeedback(cancelMessage, true);
    return false;
  }

  const isValid = await verifyPassword(password, security);
  if (!isValid) {
    setFeedback("Incorrect password.", true);
    return false;
  }

  return true;
}

async function exportProfileData(format) {
  const profile = await getProfileData();
  if (!Object.keys(profile).length) {
    setFeedback("There is no saved profile data to export.", true);
    return;
  }

  const authorized = await verifyProfilePasswordAction({
    missingMessage: "Set a password before exporting saved fields.",
    promptMessage: `Enter your password to export ${format.toUpperCase()}:`,
    cancelMessage: "Export canceled.",
  });
  if (!authorized) {
    return;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "word") {
    const html = buildExportHtml(profile);
    await downloadBlob(
      new Blob([html], { type: "application/msword" }),
      `quickfill-profile-${stamp}.doc`,
    );
  } else if (format === "json") {
    await downloadBlob(
      new Blob([JSON.stringify(profile, null, 2)], {
        type: "application/json",
      }),
      `quickfill-profile-${stamp}.json`,
    );
  } else if (format === "pdf") {
    const pdfContent = buildPdfDocument(profile);
    await downloadBlob(
      new Blob([pdfContent], { type: "application/pdf" }),
      `quickfill-profile-${stamp}.pdf`,
    );
  }

  setFeedback(`Profile data exported as ${format.toUpperCase()}.`);
}

async function createVault(event) {
  event.preventDefault();

  const password = document.getElementById("vault-password").value;
  const confirmPassword = document.getElementById("vault-password-confirm").value;

  if (!password || password.length < 6) {
    setFeedback("Use a master password with at least 6 characters.", true);
    return;
  }

  if (password !== confirmPassword) {
    setFeedback("The two passwords do not match.", true);
    return;
  }

  const payload = { cards: [] };
  const encrypted = await encryptVaultData(payload, password);
  encrypted.cardCount = 0;
  await storageSet({ [VAULT_KEY]: encrypted });
  unlockedVault = payload;
  unlockedPassword = password;
  document.getElementById("vault-setup-form").reset();
  resetCardForm();
  await refreshAll();
  setFeedback("Secure card vault created.");
}

async function unlockVault(event) {
  event.preventDefault();

  const password = document.getElementById("unlock-password").value;
  const vault = await getVaultData();
  if (!vault) {
    setFeedback("Create the vault first.", true);
    return;
  }

  try {
    unlockedVault = await decryptVaultData(vault, password);
    unlockedPassword = password;
    document.getElementById("vault-unlock-form").reset();
    resetCardForm();
    renderVault(vault);
    setFeedback("Vault unlocked.");
  } catch (error) {
    unlockedVault = null;
    unlockedPassword = "";
    setFeedback("Incorrect password. Vault stays locked.", true);
  }
}

function lockVault() {
  unlockedVault = null;
  unlockedPassword = "";
  clearRevealedCard();
  resetCardForm();
  getVaultData().then((vault) => renderVault(vault));
  setFeedback("Vault locked.");
}

async function deleteVault() {
  const ok = confirm("Delete the full card vault? This cannot be undone.");
  if (!ok) {
    return;
  }

  await storageRemove(VAULT_KEY);
  unlockedVault = null;
  unlockedPassword = "";
  clearRevealedCard();
  resetCardForm();
  await refreshAll();
  setFeedback("Vault deleted.");
}

async function saveCard(event) {
  event.preventDefault();

  if (!unlockedVault || !unlockedPassword) {
    setFeedback("Unlock the vault before saving cards.", true);
    return;
  }

  const card = {
    id: cardEditId || crypto.randomUUID(),
    label: document.getElementById("card-label").value.trim(),
    nameOnCard: document.getElementById("card-name").value.trim(),
    number: document.getElementById("card-number").value.replace(/\s+/g, "").trim(),
    expiryMonth: document.getElementById("card-expiry-month").value.trim(),
    expiryYear: document.getElementById("card-expiry-year").value.trim(),
    cvv: document.getElementById("card-cvv").value.trim(),
    billingZip: document.getElementById("card-zip").value.trim(),
  };

  if (
    !card.label ||
    !card.nameOnCard ||
    !card.number ||
    !card.expiryMonth ||
    !card.expiryYear ||
    !card.cvv
  ) {
    setFeedback("Complete all required card fields.", true);
    return;
  }

  const cards = [...(unlockedVault.cards || [])];
  const index = cards.findIndex((item) => item.id === card.id);
  if (index >= 0) {
    cards[index] = card;
  } else {
    cards.push(card);
  }

  unlockedVault = { cards };
  const encrypted = await encryptVaultData(unlockedVault, unlockedPassword);
  encrypted.cardCount = cards.length;
  await storageSet({ [VAULT_KEY]: encrypted });
  clearRevealedCard();
  resetCardForm();
  renderVault(encrypted);
  setFeedback("Card saved to the protected vault.");
}

function beginCardEdit(cardId) {
  if (!unlockedVault) {
    return;
  }

  const card = (unlockedVault.cards || []).find((item) => item.id === cardId);
  if (!card) {
    return;
  }

  cardEditId = card.id;
  document.getElementById("card-label").value = card.label;
  document.getElementById("card-name").value = card.nameOnCard;
  document.getElementById("card-number").value = card.number;
  document.getElementById("card-expiry-month").value = card.expiryMonth;
  document.getElementById("card-expiry-year").value = card.expiryYear;
  document.getElementById("card-cvv").value = card.cvv;
  document.getElementById("card-zip").value = card.billingZip || "";
  document.getElementById("card-submit").textContent = "Update card";
}

async function removeCard(cardId) {
  if (!unlockedVault || !unlockedPassword) {
    return;
  }

  const ok = confirm("Delete this saved card?");
  if (!ok) {
    return;
  }

  unlockedVault = {
    cards: (unlockedVault.cards || []).filter((item) => item.id !== cardId),
  };
  const encrypted = await encryptVaultData(unlockedVault, unlockedPassword);
  encrypted.cardCount = unlockedVault.cards.length;
  await storageSet({ [VAULT_KEY]: encrypted });
  clearRevealedCard();
  if (cardEditId === cardId) {
    resetCardForm();
  }
  renderVault(encrypted);
  setFeedback("Card removed from vault.");
}

async function toggleCardDetails(cardId) {
  if (revealedCardId === cardId) {
    clearRevealedCard();
    renderVault(await getVaultData());
    return;
  }

  clearRevealedCard();
  renderVault(await getVaultData());

  const vaultPayload = await promptForVaultPayload("Enter your master password to view this card:");
  if (!vaultPayload) {
    return;
  }

  const card = (vaultPayload.cards || []).find((item) => item.id === cardId);
  if (!card) {
    setFeedback("Card not found in vault.", true);
    return;
  }

  unlockedVault = vaultPayload;
  revealedCardId = cardId;
  window.clearTimeout(revealTimer);
  revealTimer = window.setTimeout(async () => {
    clearRevealedCard();
    renderVault(await getVaultData());
  }, CARD_REVEAL_MS);
  renderVault(await getVaultData());
  setFeedback("Card details revealed for 30 seconds.");
}

async function fillCard(cardId) {
  const allowed = confirm("Fill this card into the active page?");
  if (!allowed) {
    setFeedback("Card autofill canceled.");
    return;
  }

  const vaultPayload = await promptForVaultPayload("Enter your master password to fill this card:");
  if (!vaultPayload) {
    return;
  }

  const card = (vaultPayload.cards || []).find((item) => item.id === cardId);
  if (!card) {
    setFeedback("Card not found in vault.", true);
    return;
  }

  const includeCvv = await getCardAutofillCvvSetting();
  try {
    await sendCardToActiveTab(card, includeCvv);
    setFeedback(includeCvv ? "Card filled, including CVV." : "Card filled without CVV.");
  } catch (error) {
    setFeedback(error?.message || "Could not fill the active page.", true);
  }
}

async function promptForVaultPayload(promptText) {
  const vault = await getVaultData();
  if (!vault) {
    setFeedback("Create the vault first.", true);
    return null;
  }

  const password = prompt(promptText);
  if (!password) {
    setFeedback("Vault password prompt canceled.", true);
    return null;
  }

  try {
    return await decryptVaultData(vault, password);
  } catch (error) {
    setFeedback("Incorrect master password.", true);
    return null;
  }
}

function sendCardToActiveTab(card, includeCvv) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "QUICKFILL_FILL_CARD",
        card: {
          nameOnCard: card.nameOnCard,
          number: card.number,
          expiryMonth: card.expiryMonth,
          expiryYear: card.expiryYear,
          cvv: includeCvv ? card.cvv : "",
          billingZip: card.billingZip || "",
        },
        includeCvv,
      },
      (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }

        if (!response?.ok) {
          reject(new Error(response?.error || "No active page accepted the card."));
          return;
        }

        resolve(response);
      },
    );
  });
}

function clearRevealedCard() {
  revealedCardId = null;
  window.clearTimeout(revealTimer);
  revealTimer = null;
}

function clearRevealedProfile() {
  revealedProfileKey = null;
  window.clearTimeout(profileRevealTimer);
  profileRevealTimer = null;
}

function resetCardForm() {
  cardEditId = null;
  document.getElementById("card-form").reset();
  document.getElementById("card-submit").textContent = "Save card";
}

function setFeedback(message, isError = false) {
  const feedback = document.getElementById("feedback");
  feedback.textContent = message;
  feedback.style.color = isError ? "#b42318" : "#115e59";
}

async function encryptVaultData(payload, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derivePasswordKey(password, salt);
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );

  return {
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(new Uint8Array(ciphertext)),
  };
}

async function decryptVaultData(vault, password) {
  const salt = base64ToUint8Array(vault.salt);
  const iv = base64ToUint8Array(vault.iv);
  const ciphertext = base64ToUint8Array(vault.ciphertext);
  const key = await derivePasswordKey(password, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );

  return JSON.parse(new TextDecoder().decode(plaintext));
}

async function derivePasswordKey(password, salt) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 250000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
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

function buildExportHtml(profile) {
  const rows = Object.entries(profile)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([key, value]) =>
        `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>QuickFill Export</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #17324d; }
      h1 { margin-bottom: 8px; }
      p { color: #58738f; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      td, th { border: 1px solid #d8e2ec; padding: 10px; text-align: left; }
      th { background: #eef6ff; }
    </style>
  </head>
  <body>
    <h1>QuickFill Saved Profile Data</h1>
    <p>Exported on ${new Date().toLocaleString()}</p>
    <table>
      <thead><tr><th>Field</th><th>Value</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </body>
</html>`;
}

function buildPdfDocument(profile) {
  const heading = "QuickFill Saved Profile Data";
  const exported = `Exported on ${new Date().toLocaleString()}`;
  const lines = [
    heading,
    exported,
    "",
    ...Object.entries(profile)
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([key, value]) => wrapPdfLine(`${key}: ${value}`, 78)),
  ];

  const textStream = [
    "BT",
    "/F1 12 Tf",
    "50 790 Td",
    "14 TL",
    ...lines.flatMap((line, index) =>
      index === 0
        ? [`(${escapePdfText(line)}) Tj`]
        : ["T*", `(${escapePdfText(line)}) Tj`],
    ),
    "ET",
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${textStream.length} >>\nstream\n${textStream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

function wrapPdfLine(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars) {
      if (current) {
        lines.push(current);
      }
      current = word;
    } else {
      current = next;
    }
  });

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : [text];
}

function escapePdfText(text) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

async function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url,
      filename,
      saveAs: true,
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
}

function maskCardNumber(number) {
  const digits = number.replace(/\D/g, "");
  const visible = digits.slice(-4).padStart(digits.length, "*");
  return visible.replace(/(.{4})/g, "$1 ").trim();
}

function formatCardNumber(number) {
  return number.replace(/\D/g, "").replace(/(.{4})/g, "$1 ").trim();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...buffer));
}

function base64ToUint8Array(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(items) {
  return new Promise((resolve) => chrome.storage.local.set(items, resolve));
}

function storageRemove(keys) {
  return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
}
