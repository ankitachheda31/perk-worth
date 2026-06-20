import React, { useEffect, useState } from 'react'
import { UserPlus, LinkIcon, Trash2 } from 'lucide-react'
import { Card, Empty, PrimaryButton, TopBar } from '../components/ui'
import { FormField } from '../components/widgets'
import { Circle } from '../lib/api'
import { getProfile } from '../lib/store'

export default function CirclePage({ onBack, pin, toast, onOpenMember, onProfileClick }) {
  const [members, setMembers] = useState([])
  const [name, setName] = useState('')
  const [relation, setRelation] = useState('Family')
  const [email, setEmail] = useState('')
  const load = () => Circle.list(pin).then(setMembers)
  useEffect(() => { load() /* eslint-disable-next-line */ }, [pin])

  const add = async () => {
    if (!name.trim()) return
    const profile = getProfile() || {}
    const inviter_name = profile.name || (() => { try { return (JSON.parse(localStorage.getItem('perk_orbit_user') || '{}').name) } catch { return '' } })()
    const body = { user_pin: pin, name: name.trim(), relation }
    if (email.trim()) {
      body.email = email.trim().toLowerCase()
      if (inviter_name) body.inviter_name = inviter_name
    }
    const res = await Circle.add(body)
    setName(''); setEmail(''); load()
    toast(res?.invite_email_sent ? `Invite emailed to ${body.email}` : 'Member added')
  }
  const remove = async (id) => { await Circle.remove(id); load(); toast('Removed') }
  const copyInvite = async (m) => {
    const link = `https://perkworth.app/invite/${m.invite_token}`
    try { await navigator.clipboard.writeText(link); toast('Invite link copied') } catch { toast('Copy failed') }
  }

  return (
    <>
      <TopBar
        title="Family Circle"
        subtitle="Selectively share vouchers with family"
        onBack={onBack}
        right={onProfileClick ? (
          <button data-testid="profile-avatar-circle" onClick={onProfileClick} className="w-10 h-10 rounded-full bg-emerald-800 grid place-items-center text-white font-display font-bold border-2 border-white shadow-soft">
            {(getProfile().name || 'M')[0].toUpperCase()}
          </button>
        ) : null}
      />
      <main className="px-5 space-y-4">
        <Card className="p-5 space-y-3">
          <FormField label="Family member name" testid="circle-name" value={name} onChange={setName} placeholder="e.g. Priya (Wife)" />
          <FormField label="Relation" testid="circle-relation" value={relation} onChange={setRelation} placeholder="Family / Parent / Sibling" />
          <FormField label="Email (optional — sends invite)" testid="circle-email" value={email} onChange={setEmail} placeholder="priya@example.com" type="email" />
          <PrimaryButton data-testid="circle-add" onClick={add}><UserPlus className="w-4 h-4" /> Add to circle</PrimaryButton>
        </Card>

        {members.length === 0 ? (
          <Empty title="Your circle is empty" sub="Add a member to start sharing vouchers." icon={<UserPlus className="w-6 h-6" />} testid="empty-circle" />
        ) : (
          <div className="space-y-2" data-testid="circle-list">
            {members.map(m => (
              <Card key={m.id} className="p-4 flex items-center justify-between gap-3">
                <button
                  data-testid={`open-family-cards-${m.id}`}
                  onClick={() => onOpenMember(m)}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left active:scale-[0.99] transition"
                >
                  <div className="w-11 h-11 rounded-full bg-emerald-100 grid place-items-center text-emerald-800 font-display font-bold">{m.name[0].toUpperCase()}</div>
                  <div className="min-w-0">
                    <p className="font-display font-bold text-ink-900 truncate">{m.name}</p>
                    <p className="text-[11px] text-ink-500">{m.relation || 'Family'} · View their cards</p>
                  </div>
                </button>
                <div className="flex items-center gap-1">
                  <button data-testid={`copy-invite-${m.id}`} onClick={() => copyInvite(m)} className="w-9 h-9 rounded-full bg-ink-100 grid place-items-center text-ink-700 active:scale-95"><LinkIcon className="w-4 h-4" /></button>
                  <button data-testid={`remove-member-${m.id}`} onClick={() => remove(m.id)} className="w-9 h-9 rounded-full bg-terracotta-50 grid place-items-center text-terracotta-700 active:scale-95"><Trash2 className="w-4 h-4" /></button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </>
  )
}
