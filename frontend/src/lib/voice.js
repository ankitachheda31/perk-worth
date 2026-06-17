// Web Speech API helper (Chrome / Safari / Edge)
const Rec = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null

export const isVoiceSupported = !!Rec

export function startVoiceRecognition({ lang = 'en-IN', onResult, onEnd, onError }) {
  if (!Rec) { onError && onError(new Error('Speech recognition not supported')); return null }
  const rec = new Rec()
  rec.lang = lang
  rec.interimResults = false
  rec.continuous = false
  rec.maxAlternatives = 1
  rec.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript || ''
    onResult && onResult(transcript.trim())
  }
  rec.onerror = (e) => { onError && onError(e) }
  rec.onend = () => { onEnd && onEnd() }
  try { rec.start() } catch (e) { onError && onError(e) }
  return rec
}
