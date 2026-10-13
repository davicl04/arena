import { useEffect, useRef } from 'react'
import type { MatchDetail } from '../api/matches'

/** Relê permissões nos horários de início, limite de cancelamento e fim da janela de resultado. */
export function useMatchDeadlines(match: MatchDetail | null, refresh: () => Promise<boolean>) {
  const latest = useRef(refresh)
  useEffect(() => { latest.current = refresh }, [refresh])
  const id = match?.id
  const start = match?.starts_at
  const cancel = match?.cancel_until
  const end = match?.result_deadline

  useEffect(() => {
    const pending = [start, cancel, end].filter((iso): iso is string => Boolean(iso))
      .map(iso => Date.parse(iso)).filter(at => at > Date.now()).sort((a, b) => a - b)
    if (!pending.length) return
    let timer: number | undefined
    let stopped = false
    let busy = false
    function schedule(retry = false) {
      window.clearTimeout(timer)
      if (stopped || document.hidden || !pending.length) return
      timer = window.setTimeout(() => void check(), retry ? 15_000 : Math.min(60_000, Math.max(0, pending[0] - Date.now())))
    }
    async function check() {
      if (busy || stopped || document.hidden || !pending.length) return
      const now = Date.now()
      if (pending[0] > now) { schedule(); return }
      busy = true
      try {
        if (await latest.current()) {
          while (pending.length && pending[0] <= now) pending.shift()
          schedule()
        } else schedule(true)
      } finally { busy = false }
    }
    const visible = () => { window.clearTimeout(timer); if (!document.hidden) void check() }
    document.addEventListener('visibilitychange', visible)
    schedule()
    return () => { stopped = true; window.clearTimeout(timer); document.removeEventListener('visibilitychange', visible) }
  }, [id, start, cancel, end])
}
