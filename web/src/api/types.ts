export interface TerritoryRow { territory: string; plays: number; estimatedMicros: number }
export interface TrackRow { isrc: string; title: string | null; artistName: string | null; plays: number; estimatedMicros: number }

export interface Summary {
  period: string
  streams: number
  plays: number
  estimatedMicros: number
  playsByTier: Record<string, number>
  territories: TerritoryRow[]
  topTracks: TrackRow[]
  unmatchedPlays: number
}

export type ReconciliationStatus = 'MATCH' | 'LATE_PLAYS' | 'PIPELINE_DRIFT' | 'NOT_RUN'

export interface Reconciliation {
  period: string
  status: ReconciliationStatus
  eventsAccepted: number
  playsInTotals: number
  playsInAggregates: number
  playsInStatement: number | null
  findings: string[]
}

export interface Run {
  id: number
  period: string
  totalPlays: number
  matchedPlays: number
  grossMicros: number
  allocatedCents: number
  residualNanos: number
  unmatchedPlays: number
  unmatchedMicros: number
  statementCount: number
  createdAt: string
}

export interface StatementSummary {
  id: number
  period: string
  holderId: number
  holderName: string
  holderType: string
  plays: number
  totalCents: number
}

export interface Line {
  isrc: string
  title: string | null
  territory: string
  tier: string
  plays: number
  rateMicros: number
  shareBps: number
  amountMicros: number
}

export interface RightsHolder { id: number; name: string; type: string }

export interface Page<T> { items: T[]; total: number; page: number; size: number }
