// Custom pull-to-refresh hook for mobile/web.
import { useEffect, useRef, useState } from 'react'

export default function usePullToRefresh(onRefresh, { topThreshold = 70, enabled = true } = {}) {
  const startY = useRef(null)
  const [pullY, setPullY] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const refreshingRef = useRef(false)

  useEffect(() => {
    if (!enabled) return
    const el = window
    const onTouchStart = (e) => {
      if (refreshingRef.current) return
      // Only trigger when scrolled to top
      if (window.scrollY > 5) { startY.current = null; return }
      startY.current = e.touches[0].clientY
    }
    const onTouchMove = (e) => {
      if (startY.current == null) return
      const dy = e.touches[0].clientY - startY.current
      if (dy > 0) {
        // Damp the drag
        setPullY(Math.min(120, dy * 0.5))
      }
    }
    const onTouchEnd = async () => {
      if (startY.current == null) return
      const trigger = pullY >= topThreshold
      startY.current = null
      setPullY(0)
      if (trigger && onRefresh) {
        setRefreshing(true); refreshingRef.current = true
        try { await onRefresh() } finally { setRefreshing(false); refreshingRef.current = false }
      }
    }
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [enabled, onRefresh, pullY, topThreshold])

  return { pullY, refreshing }
}
