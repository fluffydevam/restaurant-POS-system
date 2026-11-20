import type { LimitResource, LimitUsageMap } from '../lib/types'

/**
 * Compact soft-cap indicator. Stays subtle until a tenant is near the limit,
 * then turns into an explicit warning without blocking the page.
 */
export function LimitUsageNotice({
  usage,
  resource,
  label,
}: {
  usage?: LimitUsageMap
  resource: LimitResource
  label: string
}) {
  const item = usage?.[resource]
  if (!item || item.limit <= 0) return null

  const tone = item.at_limit
    ? { border: 'border-red-500/30', bar: 'bg-red-400', text: 'text-red-200', bg: 'bg-red-500/10' }
    : item.near_limit
      ? { border: 'border-amber-400/30', bar: 'bg-amber-400', text: 'text-amber-200', bg: 'bg-amber-400/10' }
      : { border: 'border-white/10', bar: 'bg-slate-400', text: 'text-slate-400', bg: 'bg-white/5' }

  return (
    <div className={`rounded-2xl border px-4 py-3 ${tone.border} ${tone.bg}`}>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className={`font-medium ${tone.text}`}>{label}</span>
        <span className={`tabular-nums ${tone.text}`}>
          {item.used} / {item.limit}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${item.percent}%` }} />
      </div>
      {item.at_limit ? (
        <p className={`mt-2 text-[11px] ${tone.text}`}>
          Free limit reached. Remove an existing {label.toLowerCase().replace(/s$/, '')} to add another.
        </p>
      ) : item.near_limit ? (
        <p className={`mt-2 text-[11px] ${tone.text}`}>Approaching the free plan limit.</p>
      ) : null}
    </div>
  )
}
