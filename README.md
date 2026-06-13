# Vault

A minimal, local-first password manager Chrome extension.

---

## Overview

Vault stores your credentials securely in your browser using modern Web Crypto APIs.  
Everything is encrypted locally — nothing leaves your machine.

---

## Features

- Master password protection
- AES-GCM encryption (Web Crypto API)
- PBKDF2 key derivation (100k iterations)
- Autofill for login forms
- Domain-based matching
- Password generator
- One-click copy
- Fast search
- Session-only decrypted memory cache
- Clean, lightweight UI

---

## How It Works

### Encryption

- Master password → PBKDF2 → AES-GCM key
- Each entry is encrypted before storage
- Data saved in `chrome.storage.local`

### Session Security

- Decrypted data exists only in memory
- Password cache stored in `chrome.storage.session`
- Automatically cleared on lock or browser close

---

## Autofill

- Detects login forms on active page
- Matches saved entries by domain
- Injects username + password into fields
- Triggers native input events for compatibility

---

## Installation

1. Clone the repository

```bash
1. Download this repo
2. Unpack the zip
3. Extensions -> load the folder
4. Set password
5. Youre good to go!
```
