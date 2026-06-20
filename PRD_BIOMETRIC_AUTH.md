# Biometric Authentication — PRD & Implementation Plan

**Priority**: P0 (user-requested)
**Estimated effort**: 6-10 hours (split across 2 sessions due to APK testing requirement)
**Status**: Not yet implemented. This doc is the spec for the next session.

---

## 1. WHY

PerkWorth holds sensitive financial data (voucher codes worth ₹thousands, credit card hints, family member info). Today's PIN entry is fine but feels dated — users expect Face ID / Fingerprint like every Indian banking app (HDFC, Paytm, PhonePe all use biometric).

**Trust value**: Razorpay reviewers + early users see Face ID = "this is a serious money app" instead of "another coupon clone."

---

## 2. SCOPE

### Must Have
- Biometric prompt on app launch (replaces PIN keypad when available)
- PIN keypad **always remains** as fallback (for new devices, non-biometric phones, or biometric-disabled accessibility users)
- Setting toggle: Profile → Security → "Use Biometric Lock" (on/off)
- After 3 failed biometric attempts → forced fallback to PIN
- Lockout after 3 failed PINs (already exists)

### Nice-to-Have (defer to v2)
- Biometric-confirm on Pro membership payment (Razorpay)
- Biometric-confirm on family share / voucher delete
- Per-feature biometric guards (e.g., view credit card code requires biometric, not just PIN)

### Out of Scope
- iOS support (requires separate Capacitor iOS build pipeline — defer to iOS launch)
- Voice biometric (no compelling use case)

---

## 3. TECHNICAL APPROACH

### 3.1 Capacitor + Android (native)
Use `@capacitor/biometric` or `@aparajita/capacitor-biometric-auth` (latter is more actively maintained).

```bash
cd frontend && yarn add @aparajita/capacitor-biometric-auth
npx cap sync android
```

In `frontend/android/app/src/main/AndroidManifest.xml` add:
```xml
<uses-permission android:name="android.permission.USE_BIOMETRIC" />
```

### 3.2 PWA / Web fallback (WebAuthn)
For browser users, use the native `navigator.credentials.create()` + `.get()` API. Works on:
- ✅ Chrome / Edge on Android (uses fingerprint sensor)
- ✅ Safari on iOS (Face ID — when user installs PerkWorth as PWA)
- ✅ Desktop with Windows Hello / Touch ID

Store the WebAuthn credential ID in backend, tied to user_id.

### 3.3 Architecture
```
App boot
  ├─ PIN exists locally? ──→ No  → AuthScreen (cloud login)
  │                          Yes →
  ├─ User has enabled biometric? ──→ No  → PinLock (verify)
  │                                  Yes →
  ├─ Capacitor available? ──→ Yes → call BiometricAuth.verify()
  │                          No  → call WebAuthn navigator.credentials.get()
  ├─ Biometric success → setLocked(false)
  ├─ Biometric cancel/fail → fallback to PinLock
```

---

## 4. BACKEND CHANGES

### New endpoints
```python
@api.post("/auth/biometric/register")
async def biometric_register(body: BiometricRegisterBody):
    """Store WebAuthn credential ID for the user."""
    ...

@api.post("/auth/biometric/verify")
async def biometric_verify(body: BiometricVerifyBody):
    """Validate the WebAuthn assertion. Returns short-lived token."""
    ...

@api.delete("/auth/biometric")
async def biometric_remove():
    """User disabled biometric in settings → wipe credential."""
    ...
```

### New User field
```python
class User(BaseDocument):
    ...
    biometric_credential_id: Optional[str] = None  # WebAuthn credential.id (base64)
    biometric_public_key: Optional[str] = None      # WebAuthn public key
    biometric_enabled: bool = False
```

---

## 5. FRONTEND CHANGES

### New screen
- `BiometricLockScreen.jsx` — fullscreen pulse animation while waiting for biometric prompt. "Use PIN instead" link at bottom.

### Modified files
- `App.jsx` — route resolver checks biometric enabled before showing PinLock
- `SettingsPage.jsx` — add toggle row "Use biometric to unlock"
- `lib/biometric.js` — new module, exports `tryBiometric()` that picks Capacitor or WebAuthn based on `window.Capacitor?.isNativePlatform()`

---

## 6. TESTING PLAN

### Unit tests (backend)
- POST /auth/biometric/register stores credential
- POST /auth/biometric/verify with valid assertion returns 200
- POST /auth/biometric/verify with mismatched assertion returns 401
- DELETE /auth/biometric clears the credential

### Manual tests (frontend)
1. **Web (Chrome on Android)**: Enable in settings → close app → reopen → fingerprint prompt → unlock
2. **PWA installed**: Same as web; should work post-installation
3. **APK on real Android device**: Same, using native BiometricPrompt UI
4. **Fallback**: Disable biometric in OS → app falls back to PIN prompt
5. **Lockout**: Fail biometric 3 times → app shows PIN keypad
6. **Disable in settings**: Toggle off → next launch goes straight to PIN

---

## 7. EXPLICIT TODOs FOR NEXT SESSION

1. [ ] Run `yarn add @aparajita/capacitor-biometric-auth` + `npx cap sync android`
2. [ ] Add `USE_BIOMETRIC` permission to AndroidManifest.xml
3. [ ] Create `/app/frontend/src/lib/biometric.js` abstraction layer
4. [ ] Add User model fields (biometric_credential_id, biometric_public_key, biometric_enabled)
5. [ ] Implement 3 new backend endpoints
6. [ ] Create `BiometricLockScreen.jsx`
7. [ ] Wire App.jsx boot resolver
8. [ ] Add settings toggle
9. [ ] Generate Android APK and physically test on a phone
10. [ ] Document Android build steps in `/app/scripts/ANDROID_BUILD.md`

---

## 8. RISKS & MITIGATIONS

| Risk | Mitigation |
|---|---|
| User's device has no fingerprint sensor | Detect via `BiometricAuth.checkBiometry()` — silently fall back to PIN |
| User disabled biometric in Android settings | Same fallback |
| WebAuthn doesn't work in WebView contexts | Capacitor's native plugin takes precedence on Android — WebAuthn is web-only |
| Storing biometric data on backend | We DON'T store biometric data (fingerprint image) — only the WebAuthn public key, which is useless without the user's device |
| Lost device → can't unlock | PIN remains as cloud-recoverable backup. Cloud login via email/password also works. |

---

## 9. ROLLOUT

- Ship behind a feature flag `ENABLE_BIOMETRIC` in `.env`
- Test on 10% of users via remote toggle
- Roll out fully after 1 week of zero crash reports

---

**End of PRD. Hand to next-session agent or human dev.**
