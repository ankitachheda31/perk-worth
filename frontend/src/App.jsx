import React, { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'

import { Shell, Toast, OfflineBanner } from './components/ui'
import BottomNav from './components/BottomNav'
import ProfileMenu from './components/ProfileMenu'
import HowWeProtectYouModal from './components/HowWeProtectYouModal'

import PinLock from './screens/PinLock'
import AuthScreen from './screens/AuthScreen'
import ResetPasswordScreen from './screens/ResetPasswordScreen'
import Walkthrough from './screens/Walkthrough'
import BiometricPromptScreen from './screens/BiometricPromptScreen'
import BackendHealthBanner from './components/BackendHealthBanner'
import SmartDiscoveryScreen from './screens/SmartDiscoveryScreen'
import PerkTipsScreen from './screens/PerkTipsScreen'
import SecurityFAQScreen from './screens/SecurityFAQScreen'
import PrivacyControlScreen from './screens/PrivacyControlScreen'
import HomeScreen from './screens/HomeScreen'
import MyCouponsScreen from './screens/MyCouponsScreen'
import MyPointsScreen from './screens/MyPointsScreen'
import ProfilePage from './screens/ProfilePage'
import SettingsPage from './screens/SettingsPage'
import MembershipPage from './screens/MembershipPage'
import CirclePage from './screens/CirclePage'
import FamilyCardsPage from './screens/FamilyCardsPage'
import SmsScannerScreen from './screens/SmsScannerScreen'
import SupportHistoryScreen from './screens/SupportHistoryScreen'
import PrivacyScreen from './screens/PrivacyScreen'
import HistoryScreen from './screens/HistoryScreen'
import CardOptimizerScreen from './screens/CardOptimizerScreen'
import AdminRegistryScreen from './screens/AdminRegistryScreen'

import AddVoucherSheet from './sheets/AddVoucherSheet'
import HowToSheet from './sheets/HowToSheet'
import ShareSheet from './sheets/ShareSheet'
import NotificationSheet from './sheets/NotificationSheet'

import { Auth, Membership, Notifications } from './lib/api'
import { getStoredPin, setStoredPin } from './lib/store'
import { isBiometricAvailable, isBiometricEnrolled, getBiometricBackend } from './lib/biometric'
import { ensureServiceWorker, requestNotificationPermission, maybeFireBrowserNotifications } from './lib/push'

export default function App() {
  const [authChecked, setAuthChecked] = useState(false)
  const [authUser, setAuthUser] = useState(null)
  const [pin, setPin] = useState(getStoredPin())
  // Persist unlock state in sessionStorage so hard refreshes (Ctrl+Shift+R)
  // during development / payment testing don't re-prompt for the PIN. The
  // session ends when the tab is closed — same security model as banking apps.
  const [locked, setLocked] = useState(() => {
    try { return sessionStorage.getItem('perk_orbit_unlocked') !== '1' } catch { return true }
  })
  const [stack, setStack] = useState([{ screen: 'home', params: {} }])
  const [profileOpen, setProfileOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editingVoucher, setEditingVoucher] = useState(null)  // when set, AddVoucherSheet enters EDIT mode
  const [howToFor, setHowToFor] = useState(null)
  const [shareFor, setShareFor] = useState(null)
  const [toastMsg, setToastMsg] = useState('')
  const [memberStatus, setMemberStatus] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [notifsOpen, setNotifsOpen] = useState(false)
  // Deep-link: ?reset_token=... (from password-reset email)
  const [resetToken, setResetToken] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('reset_token') } catch { return null }
  })
  const [unread, setUnread] = useState(0)
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [protectOpen, setProtectOpen] = useState(false)
  const [tourDone, setTourDone] = useState(() => localStorage.getItem('perk_orbit_tour_done') === '1')
  const [discoveryDone, setDiscoveryDone] = useState(() => localStorage.getItem('perk_orbit_discovery_done') === '1')
  // Biometric first-run prompt state — shown ONCE right after PIN setup,
  // before the walkthrough. Modeled on PhonePe / GPay onboarding.
  //   - `bioPromptDismissed`: user tapped "Not now" or already enrolled elsewhere → skip
  //   - `bioCanPrompt`: device reports biometric hardware available (async check)
  const [bioPromptDismissed, setBioPromptDismissed] = useState(
    () => localStorage.getItem('perk_biometric_prompt_shown') === '1' || isBiometricEnrolled()
  )
  const [bioCanPrompt, setBioCanPrompt] = useState(false)
  useEffect(() => {
    // Try TWICE with a 15s timeout each. MIUI / ColorOS devices often take
    // 8-12s to warm up the Capacitor plugin bridge on cold start. Without
    // this retry, users get skipped past the first-run prompt.
    let alive = true
    ;(async () => {
      let ok = await isBiometricAvailable()
      if (!ok) {
        await new Promise(r => setTimeout(r, 800))
        ok = await isBiometricAvailable()
      }
      if (alive) setBioCanPrompt(!!ok)
    })()
    return () => { alive = false }
  }, [])

  // Online / offline detection
  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  const current = stack[stack.length - 1]
  const isTab = ['home', 'coupons', 'points', 'circle'].includes(current.screen)

  const toast = (m) => { setToastMsg(m); setTimeout(() => setToastMsg(''), 2200) }
  const push = (screen, params = {}) => setStack(s => [...s, { screen, params }])
  const pop = () => setStack(s => s.length > 1 ? s.slice(0, -1) : s)
  const switchTab = (screen) => setStack([{ screen, params: {} }])

  const refreshMember = async () => {
    if (!pin) return
    try { setMemberStatus(await Membership.status(pin)) } catch { /* ignore */ }
  }
  useEffect(() => { if (pin && !locked) refreshMember() /* eslint-disable-next-line */ }, [pin, locked])

  // Auto-refetch membership status when the tab regains focus AND every 60s
  // while foregrounded. Stops stale Pro/cancelled state from sticking after
  // admin-side changes (force-logout, refund, manual DB wipe, etc).
  useEffect(() => {
    if (!pin || locked) return
    const onFocus = () => { if (document.visibilityState === 'visible') refreshMember() }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    const id = setInterval(() => { if (document.visibilityState === 'visible') refreshMember() }, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
      clearInterval(id)
    }
    // eslint-disable-next-line
  }, [pin, locked])

  const refreshNotifs = async () => {
    if (!pin) return
    try {
      const d = await Notifications.list(pin)
      setUnread(d.unread || 0)
      maybeFireBrowserNotifications(d.items || [])
    } catch { /* ignore */ }
  }
  useEffect(() => {
    if (!pin || locked) return
    ensureServiceWorker()
    requestNotificationPermission()
    refreshNotifs()
    const t = setInterval(refreshNotifs, 60000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, locked, refreshKey])

  // Hardware back button — handles BOTH the browser popstate event AND the
  // Android hardware back button (Capacitor App plugin). Priority order for
  // "back" presses:
  //   1. Close notification sheet if open
  //   2. Close profile menu if open
  //   3. Close add-voucher sheet if open
  //   4. Close how-to sheet if open
  //   5. Close share sheet if open
  //   6. Close "How we protect you" modal if open
  //   7. Pop navigation stack if > 1 screen deep
  //   8. Otherwise let the OS handle it (exits the app on Android root screen)
  useEffect(() => {
    const goBack = () => {
      if (notifsOpen) { setNotifsOpen(false); return true }
      if (profileOpen) { setProfileOpen(false); return true }
      if (addOpen) { setAddOpen(false); setEditingVoucher(null); return true }
      if (howToFor) { setHowToFor(null); return true }
      if (shareFor) { setShareFor(null); return true }
      if (protectOpen) { setProtectOpen(false); return true }
      if (stack.length > 1) { pop(); return true }
      return false
    }
    const onPop = () => { goBack() }
    window.addEventListener('popstate', onPop)

    // Capacitor Android hardware back button. Dynamic import so the web
    // build doesn't fail when the native plugin isn't available.
    let removeHandle = null
    ;(async () => {
      try {
        const isNative = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()
        if (!isNative) return
        const { App: CapApp } = await import('@capacitor/app')
        const handle = await CapApp.addListener('backButton', () => {
          const handled = goBack()
          if (!handled) CapApp.exitApp()
        })
        removeHandle = () => { try { handle.remove() } catch { /* noop */ } }
      } catch { /* plugin missing on web — safe to ignore */ }
    })()

    return () => {
      window.removeEventListener('popstate', onPop)
      if (removeHandle) removeHandle()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stack.length, notifsOpen, profileOpen, addOpen, howToFor, shareFor, protectOpen])

  // Verify cloud session on cold start
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const me = await Auth.me()
        // Defensive: backend must return an object with an email; otherwise treat as unauth.
        // (Guards against rewrites returning HTML as 200 if backend URL ever misconfigured.)
        if (alive && me && typeof me === 'object' && me.email) {
          setAuthUser({ id: me._id || me.id, email: me.email, name: me.name, phone: me.phone, role: me.role })
        } else if (alive) {
          setAuthUser(null); localStorage.removeItem('perk_orbit_token')
        }
      } catch {
        if (alive) { setAuthUser(null); localStorage.removeItem('perk_orbit_token') }
      } finally {
        if (alive) setAuthChecked(true)
      }
    })()
    return () => { alive = false }
  }, [])

  // Mirror lock state into sessionStorage so refreshes don't re-prompt PIN
  // until the user explicitly locks (Profile → Lock) or closes the tab.
  useEffect(() => {
    try {
      if (locked) sessionStorage.removeItem('perk_orbit_unlocked')
      else sessionStorage.setItem('perk_orbit_unlocked', '1')
    } catch { /* private-mode browsers */ }
  }, [locked])

  // ----- Auth / PIN / Walkthrough gates -----
  if (!authChecked) return null
  // Password reset deep link (?reset_token=...) — render BEFORE the auth gate so unauthed users can complete the reset
  if (resetToken) {
    return (
      <>
        <BackendHealthBanner />
        <ResetPasswordScreen
          token={resetToken}
          onAuthed={(u) => { setResetToken(null); setAuthUser({ id: u.id, email: u.email, name: u.name || '', phone: u.phone || '', role: u.role }); setLocked(false) }}
          onCancel={() => { setResetToken(null); try { const url = new URL(window.location.href); url.searchParams.delete('reset_token'); window.history.replaceState({}, '', url.toString()) } catch { /* ignore */ } }}
        />
      </>
    )
  }
  if (!authUser) {
    return (
      <>
        <BackendHealthBanner />
        <AuthScreen existingPin={pin} onAuthed={(u) => { setAuthUser({ id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role }); setLocked(false) }} />
      </>
    )
  }
  if (!pin) {
    return <PinLock mode="set" onSuccess={(p) => { setStoredPin(p); setPin(p); setLocked(false) }} />
  }
  if (locked) {
    return <PinLock mode="verify" expected={pin} onSuccess={() => setLocked(false)} />
  }
  // First-run biometric prompt — appears once, right after PIN setup, before
  // the walkthrough. Dismissible ("Not now") — user can enable later in Settings.
  if (bioCanPrompt && !bioPromptDismissed) {
    const dismiss = () => {
      localStorage.setItem('perk_biometric_prompt_shown', '1')
      setBioPromptDismissed(true)
    }
    return (
      <BiometricPromptScreen
        backend={getBiometricBackend()}
        onEnrolled={() => { toast('Biometric unlock enabled'); dismiss() }}
        onSkip={dismiss}
      />
    )
  }
  if (!tourDone) {
    return <Walkthrough onComplete={() => {
      // Set BOTH flags — if the user skips the tour we also skip discovery
      // so they're never re-prompted across the two onboarding screens.
      localStorage.setItem('perk_orbit_tour_done', '1')
      localStorage.setItem('perk_orbit_discovery_done', '1')
      setTourDone(true); setDiscoveryDone(true)
    }} />
  }
  if (!discoveryDone) {
    return (
      <Shell>
        <SmartDiscoveryScreen
          pin={authUser?.id || pin}
          toast={toast}
          onOpenProtect={() => setProtectOpen(true)}
          onComplete={() => {
            localStorage.setItem('perk_orbit_discovery_done', '1')
            localStorage.setItem('perk_orbit_tour_done', '1')
            setDiscoveryDone(true); setTourDone(true)
          }}
        />
        <HowWeProtectYouModal open={protectOpen} onClose={() => setProtectOpen(false)} />
        <Toast message={toastMsg} />
      </Shell>
    )
  }

  // Cloud-sync canonical scope: user id (PIN remains as device-unlock)
  const effectivePin = authUser?.id || pin

  const handleNavigate = (where) => {
    if (where === 'lock') { setLocked(true); setStack([{ screen: 'home' }]); return }
    if (where === 'profile') push('profile')
    if (where === 'settings') push('settings')
    if (where === 'membership') push('membership')
    if (where === 'circle') push('circle')
    if (where === 'sms-scanner') push('sms-scanner')
    if (where === 'support') push('support')
    if (where === 'privacy') push('privacy')
    if (where === 'protect') setProtectOpen(true)
    if (where === 'perk-tips') push('perk-tips')
    if (where === 'card-optimizer') push('card-optimizer')
    if (where === 'admin-registry') push('admin-registry')
    if (where === 'faq') push('faq')
    if (where === 'privacy-control') push('privacy-control')
    if (where === 'replay-tour') { localStorage.removeItem('perk_orbit_tour_done'); setTourDone(false) }
  }

  const handleLogout = async () => {
    try { await Auth.logout() } catch { /* ignore */ }
    localStorage.removeItem('perk_orbit_token')
    setAuthUser(null)
    setLocked(true)
    setStack([{ screen: 'home' }])
  }

  const handleWipeComplete = () => {
    setAuthUser(null)
    setPin(null)
    setLocked(true)
    setMemberStatus(null)
    setStack([{ screen: 'home' }])
  }

  const onOpenAdd = (kind) => { if (kind === 'upsell') { push('membership'); return } setEditingVoucher(null); setAddOpen(true) }
  const onOpenEdit = (voucher) => { setEditingVoucher(voucher); setAddOpen(true) }
  const closeAddSheet = () => { setAddOpen(false); setEditingVoucher(null) }
  const bumpRefresh = () => setRefreshKey(k => k + 1)

  return (
    <Shell>
      <OfflineBanner online={online} />

      <div key={current.screen} className="page-enter">
        {current.screen === 'home' && (
          <HomeScreen
            pin={effectivePin} memberStatus={memberStatus}
            onProfileClick={() => setProfileOpen(true)}
            onOpenAdd={onOpenAdd} toast={toast}
            refreshKey={refreshKey} openHowTo={setHowToFor}
            onOpenNotifs={() => setNotifsOpen(true)} unread={unread}
            bumpRefresh={bumpRefresh}
          />
        )}
        {current.screen === 'coupons' && (
          <MyCouponsScreen
            pin={effectivePin}
            onProfileClick={() => setProfileOpen(true)}
            onOpenAdd={onOpenAdd} onOpenEdit={onOpenEdit} toast={toast}
            onOpenHistory={() => push('history')}
            refreshKey={refreshKey} openHowTo={setHowToFor}
            openShareSheet={setShareFor} setRefreshKey={setRefreshKey}
            bumpRefresh={bumpRefresh}
          />
        )}
        {current.screen === 'points' && (
          <MyPointsScreen
            pin={effectivePin}
            onProfileClick={() => setProfileOpen(true)}
            refreshKey={refreshKey} openHowTo={setHowToFor}
            bumpRefresh={bumpRefresh}
          />
        )}
        {current.screen === 'circle' && (
          <CirclePage
            onBack={stack.length > 1 ? pop : undefined}
            pin={effectivePin} toast={toast}
            onOpenMember={(m) => push('family-cards', { member: m })}
            onProfileClick={() => setProfileOpen(true)}
          />
        )}
        {current.screen === 'family-cards' && (
          <FamilyCardsPage
            onBack={pop} pin={effectivePin}
            member={current.params.member} toast={toast}
            refresh={bumpRefresh} openHowTo={setHowToFor}
          />
        )}
        {current.screen === 'profile' && (<ProfilePage onBack={pop} />)}
        {current.screen === 'settings' && (
          <SettingsPage
            onBack={pop}
            onResetPin={() => { setStoredPin(null); setPin(null) }}
            onOpenProtect={() => setProtectOpen(true)}
            onOpenPrivacy={() => push('privacy')}
            onOpenFAQ={() => push('faq')}
            onOpenPrivacyControl={() => push('privacy-control')}
            onOpenPerkTips={() => push('perk-tips')}
            onReplayTour={() => { localStorage.removeItem('perk_orbit_tour_done'); setTourDone(false) }}
            onLogout={handleLogout} onWipe={handleWipeComplete}
            toast={toast}
          />
        )}
        {current.screen === 'membership' && (
          <MembershipPage onBack={pop} pin={effectivePin} status={memberStatus} refresh={refreshMember} toast={toast} online={online} />
        )}
        {current.screen === 'sms-scanner' && (
          <SmsScannerScreen onBack={pop} pin={effectivePin} toast={toast} onSaved={bumpRefresh} onOpenProtect={() => setProtectOpen(true)} />
        )}
        {current.screen === 'support' && (<SupportHistoryScreen onBack={pop} pin={effectivePin} />)}
        {current.screen === 'history' && (
          <HistoryScreen
            pin={effectivePin}
            refreshKey={refreshKey}
            toast={toast}
            bumpRefresh={bumpRefresh}
            openHowTo={setHowToFor}
          />
        )}
        {current.screen === 'card-optimizer' && (
          <CardOptimizerScreen onBack={pop} pin={effectivePin} toast={toast} />
        )}
        {current.screen === 'admin-registry' && (
          <AdminRegistryScreen onBack={pop} toast={toast} />
        )}
        {current.screen === 'privacy' && (<PrivacyScreen onBack={pop} onOpenProtect={() => setProtectOpen(true)} />)}
        {current.screen === 'perk-tips' && (
          <PerkTipsScreen onBack={pop} pin={effectivePin} isPro={!!memberStatus?.active} onUpgrade={() => push('membership')} />
        )}
        {current.screen === 'faq' && (<SecurityFAQScreen onBack={pop} onOpenProtect={() => setProtectOpen(true)} />)}
        {current.screen === 'privacy-control' && (
          <PrivacyControlScreen
            onBack={pop}
            onOpenProtect={() => setProtectOpen(true)}
            onOpenFAQ={() => push('faq')}
            onOpenPrivacy={() => push('privacy')}
            onWipeOpen={() => push('settings')}
            toast={toast}
          />
        )}
      </div>

      <HowWeProtectYouModal open={protectOpen} onClose={() => setProtectOpen(false)} />
      <ProfileMenu open={profileOpen} onClose={() => setProfileOpen(false)} onNavigate={handleNavigate} memberStatus={memberStatus} isAdmin={authUser?.role === 'admin'} />

      <AddVoucherSheet key={editingVoucher?.id || 'new'} open={addOpen} onClose={closeAddSheet} pin={effectivePin} onSaved={bumpRefresh} toast={toast} editing={editingVoucher} />
      <HowToSheet voucher={howToFor} open={!!howToFor} onClose={() => setHowToFor(null)} />
      <ShareSheet open={!!shareFor} onClose={() => setShareFor(null)} voucher={shareFor} pin={effectivePin} toast={toast} refresh={bumpRefresh} />
      <NotificationSheet
        open={notifsOpen} onClose={() => setNotifsOpen(false)}
        pin={effectivePin} toast={toast}
        onJumpToScreen={(screen) => {
          if (['home','coupons','points','circle'].includes(screen)) switchTab(screen)
          else if (screen === 'membership') push('membership')
        }}
        refreshNotifs={refreshNotifs}
      />

      <Toast message={toastMsg} />
      {isTab && <BottomNav active={current.screen} onChange={switchTab} />}

      {/* Panic Lock floating button — top-LEFT so it never overlaps top-right avatar/bell */}
      <button
        data-testid="panic-lock-btn"
        onClick={() => { setLocked(true); setStack([{ screen: 'home' }]) }}
        aria-label="Lock app"
        title="Lock app instantly"
        className="fixed top-4 left-4 z-50 w-10 h-10 rounded-full bg-white/90 backdrop-blur border border-ink-200 shadow-card grid place-items-center text-emerald-800 hover:bg-emerald-50 active:scale-90 transition"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 14px)' }}
      >
        <Lock className="w-4 h-4" />
      </button>
    </Shell>
  )
}
