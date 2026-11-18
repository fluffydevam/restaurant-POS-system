import type { TenantSettings } from './types'

export interface OrderTotals {
  subtotalCents: number
  serviceChargeCents: number
  taxCents: number
  totalCents: number
}

export function calculateTotals(subtotalCents: number, settings: TenantSettings | null | undefined): OrderTotals {
  const serviceRate = settings?.service_charge?.enabled ? settings.service_charge.rate_bps : 0
  const taxRate = settings?.tax?.enabled ? settings.tax.rate_bps : 0

  const serviceChargeCents = Math.round((subtotalCents * serviceRate) / 10000)
  const taxCents = Math.round(((subtotalCents + serviceChargeCents) * taxRate) / 10000)

  return {
    subtotalCents,
    serviceChargeCents,
    taxCents,
    totalCents: subtotalCents + serviceChargeCents + taxCents,
  }
}

export function basisPointsToPercent(rateBps: number): string {
  return (rateBps / 100).toFixed(2).replace(/\.?0+$/, '') || '0'
}

export function percentToBasisPoints(percent: number): number {
  return Math.round(percent * 100)
}
