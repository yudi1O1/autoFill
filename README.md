# QuickFill Extension

QuickFill remembers personal form information, helps you manage it from a cleaner popup dashboard, and keeps saved card details behind a password-protected vault.

## Features

- Automatically fills common form fields from saved profile data
- Saves submitted form values locally for future auto-fill
- Modern popup dashboard with a more polished visual design
- View, add, edit, and delete saved personal information
- Export saved profile data as `Word (.doc)`, `PDF (.pdf)`, or `JSON (.json)`
- Password-protected encrypted card vault for storing card details separately
- Legacy storage migration so older saved data is moved into the new profile format automatically
- Ignores password, hidden, submit, button, reset, and file inputs during regular profile capture

## Installation

1. Download or clone this repository.
2. Open your browser's extension management page:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
3. Enable Developer Mode.
4. Choose `Load unpacked` and select this folder.
5. Pin `QuickFill` to the toolbar if you want fast access to the dashboard.

## Usage

1. Visit a website with a form and submit personal details once.
2. QuickFill stores supported fields locally and can reuse them on future pages.
3. Open the extension popup to:
   - review saved profile fields
   - edit or delete entries
   - clear all profile data
   - export profile data to Word, PDF, or JSON
4. In the Protected Vault section:
   - create a master password
   - unlock the vault when needed
   - add, edit, or remove saved card details
   - lock or delete the vault at any time

## Data Handling

- Standard auto-fill data is stored in a dedicated profile object in `chrome.storage.local`.
- Card details are encrypted with `AES-GCM` using a key derived from your password with `PBKDF2`.
- The vault is only readable after unlocking it with the correct password in the popup.
- Export actions only include regular profile data, not encrypted card details.

## Notes

- Existing older flat storage entries are migrated the next time the popup opens.
- PDF export is generated directly by the extension without external services.
- Everything stays local to the browser; no data is sent to any server.
