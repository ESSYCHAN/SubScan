// components/StatementReview.tsx
'use client';
import React from 'react';

export type ParsedResult = {
  name: string;
  category?: string;
  cost: number;
  frequency?: 'monthly' | 'weekly' | 'annual' | 'unknown';
  nextBilling?: string;
  lastUsed?: string;
  confidence?: number; // 0-100
  meta?: Record<string, any>;
};

export type Candidate = {
  name: string;
  ref?: string; // e.g., bank reference or memo
  amount: number;
  frequency?: 'monthly' | 'weekly' | 'annual' | 'unknown';
};

type Props = {
  open: boolean;
  onClose: () => void;
  results: ParsedResult[];
  candidates?: Candidate[];
  onAddManual?: (c: Candidate) => void;
  onEdit?: (idx: number) => void;
  stats?: {
    detected: number;
    monthlyTotal: number;
    annualTotal: number;
    avgConfidence: number;
    windowLabel?: string;
  };
  onSaveAll: () => Promise<void>;
  onExportCSV: () => void;
};

const cls = (...s: (string | false | null | undefined)[]) =>
  s.filter(Boolean).join(' ');

// Neutral confidence tone (no gradients)
export function confidenceTone(confidence: number): string {
  if (confidence < 60) return 'text-red-600';
  if (confidence < 85) return 'text-amber-600';
  return 'text-emerald-700';
}

export default function StatementReview({
  open,
  onClose,
  results,
  stats,
  candidates = [],
  onAddManual,
  onEdit,
  onSaveAll,
  onExportCSV,
}: Props) {
  if (!open) return null;

  const badge = (cat?: string) => {
    const c = (cat || 'other').toLowerCase();
    const base = 'category-badge';
    const map: Record<string, string> = {
      software: 'badge-software',
      entertainment: 'badge-entertainment',
      fitness: 'badge-fitness',
      telecom: 'badge-telecom',
      productivity: 'badge-productivity',
      cloud: 'badge-cloud',
      video: 'badge-video',
      music: 'badge-music',
      other: 'badge-other',
    };
    return cls(base, map[c] || 'badge-other');
  };

  const freqLabel = (f?: string) => f || 'unknown';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40">
      <div className="min-h-full py-8 px-4">
        <div className="mx-auto max-w-6xl bg-white rounded-2xl shadow">
          {/* Header */}
          <div className="p-6 border-b">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold">Bank Statement Analysis</h1>
                <p className="text-slate-600">
                  Detected subscriptions {stats?.windowLabel ? `(${stats.windowLabel})` : ''}
                </p>
              </div>
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg border hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="p-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="stat-card">
              <h3 className="detected text-2xl font-bold">
                {stats?.detected ?? results.length}
              </h3>
              <p>Subscriptions Detected</p>
            </div>
            <div className="stat-card">
              <h3 className="monthly text-2xl font-bold">
                £{(stats?.monthlyTotal ?? 0).toFixed(2)}
              </h3>
              <p>Monthly Spending</p>
            </div>
            <div className="stat-card">
              <h3 className="annual text-2xl font-bold">
                £{(stats?.annualTotal ?? 0).toFixed(2)}
              </h3>
              <p>Annual Spending</p>
            </div>
            <div className="stat-card">
              <h3 className="confidence text-2xl font-bold">
                {(stats?.avgConfidence ?? 0).toFixed(0)}%
              </h3>
              <p>Average Confidence</p>
            </div>
          </div>

          {/* Detected Grid */}
          <div className="p-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {results.map((r, idx) => (
              <div
                key={idx}
                className={cls(
                  'subscription-card border-l-4 rounded-xl p-5 shadow-sm hover:shadow transition',
                  (r.category || 'other').toLowerCase()
                )}
              >
                <div className="subscription-header flex items-start justify-between mb-3">
                  <div>
                    <div className="service-name text-lg font-semibold">
                      {r.name}
                    </div>
                    <span className={badge(r.category)}>
                      {r.category || 'Other'}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="cost text-xl font-bold">
                      £{(r.cost || 0).toFixed(2)}
                    </div>
                    {typeof r.confidence === 'number' && (
                      <div
                        className={cls(
                          'text-xs mt-0.5',
                          confidenceTone(r.confidence)
                        )}
                      >
                        Confidence: {Math.round(r.confidence)}%
                      </div>
                    )}
                  </div>
                </div>
                <div className="subscription-details text-sm text-slate-600 space-y-1">
                  <div className="detail-row flex justify-between">
                    <span>Frequency:</span>
                    <span className="px-2 py-0.5 rounded bg-slate-100">
                      {freqLabel(r.frequency)}
                    </span>
                  </div>
                  {!!r.nextBilling && (
                    <div className="detail-row flex justify-between">
                      <span>Next billing:</span>
                      <span>{r.nextBilling}</span>
                    </div>
                  )}
                  {!!r.lastUsed && (
                    <div className="detail-row flex justify-between">
                      <span>Last used:</span>
                      <span>{r.lastUsed}</span>
                    </div>
                  )}
                </div>

                {onEdit && (
                  <div className="mt-3">
                    <button
                      className="px-3 py-1.5 rounded-lg border text-sm hover:bg-gray-50"
                      onClick={() => onEdit(idx)}
                    >
                      Review/Edit
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Potentially Missing Subscriptions */}
          {candidates.length > 0 && (
            <>
              <div className="px-6 pb-2">
                <h2 className="text-lg font-bold mb-3">
                  Potentially Missing Subscriptions
                </h2>
              </div>
              <div className="px-6 pb-6 grid gap-3">
                {candidates.map((c, i) => (
                  <div
                    key={i}
                    className="rounded-xl border p-4 flex items-center justify-between bg-slate-50"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{c.name}</div>
                      <div className="text-sm text-slate-600">
                        {c.ref ? <span className="mr-2">{c.ref}</span> : null}
                        • {c.frequency || 'unknown'} • £{c.amount.toFixed(2)}
                      </div>
                    </div>
                    {onAddManual && (
                      <button
                        className="px-3 py-1.5 rounded-lg border bg-white text-sm hover:bg-gray-50"
                        onClick={() => onAddManual(c)}
                      >
                        Add Manual
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Actions */}
          <div className="p-6 border-t flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-600">
              Review detected subscriptions then save to your account.
            </div>
            <div className="flex gap-2">
              <button
                className="px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700"
                onClick={onSaveAll}
              >
                Save All Subscriptions
              </button>
              <button
                className="px-4 py-2 rounded-lg border"
                onClick={onExportCSV}
              >
                Export as CSV
              </button>
              <button
                className="px-4 py-2 rounded-lg border"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* local styles */}
      <style jsx>{`
        .stat-card {
          background: #fff;
          padding: 16px;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
          text-align: center;
        }
        .detected {
          color: #059669;
        }
        .monthly {
          color: #dc2626;
        }
        .annual {
          color: #7c3aed;
        }
        .confidence {
          color: #ea580c;
        }
        .category-badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
        }
        .badge-software {
          background: #dbeafe;
          color: #1d4ed8;
        }
        .badge-entertainment {
          background: #fee2e2;
          color: #dc2626;
        }
        .badge-fitness {
          background: #d1fae5;
          color: #065f46;
        }
        .badge-telecom {
          background: #ede9fe;
          color: #7c2d12;
        }
        .badge-productivity {
          background: #fef3c7;
          color: #92400e;
        }
        .badge-cloud {
          background: #cffafe;
          color: #155e75;
        }
        .badge-video {
          background: #fce7f3;
          color: #be185d;
        }
        .badge-music {
          background: #ecfccb;
          color: #365314;
        }
        .badge-other {
          background: #f3f4f6;
          color: #374151;
        }
        .software {
          border-left-color: #3b82f6;
        }
        .entertainment {
          border-left-color: #ef4444;
        }
        .fitness {
          border-left-color: #10b981;
        }
        .telecom {
          border-left-color: #8b5cf6;
        }
        .productivity {
          border-left-color: #f59e0b;
        }
        .cloud {
          border-left-color: #06b6d4;
        }
        .video {
          border-left-color: #ec4899;
        }
        .music {
          border-left-color: #84cc16;
        }
        .other {
          border-left-color: #6b7280;
        }
      `}</style>
    </div>
  );
}
