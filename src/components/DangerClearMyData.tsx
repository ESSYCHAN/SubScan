// src/components/DangerClearMyData.tsx
// Replace your DangerClearMyData component with this improved version:

'use client';
import React, { useState } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import {
  collection, query, where, getDocs, deleteDoc, doc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Collections that should be cleared (organized by what they actually contain)
const SUBSCRIPTION_DATA = [
  { id: 'subscriptions', label: 'Subscriptions (Netflix, Spotify, etc.)', description: 'Your tracked recurring payments' },
  { id: 'plannedItems', label: 'Planned Expenses', description: 'One-time and recurring expenses you added manually' }
];

const BUDGET_DATA = [
  { id: 'categories', label: 'Budget Categories', description: 'Your custom spending categories and budgets' },
  { id: 'transactions', label: 'Transaction History', description: 'Individual spending records and payments' }
];

const ANALYSIS_DATA = [
  { id: 'insights', label: 'Spending Insights', description: 'AI-generated spending analysis and recommendations' },
  { id: 'scanResults', label: 'Bank Statement Scans', description: 'Results from uploaded bank statement analysis' }
];

const DEPRECATED_DATA = [
  { id: 'envelopes', label: 'Budget Envelopes (Old)', description: 'Legacy budgeting system - likely empty' },
  { id: 'userSubscriptions', label: 'User Subscriptions (Old)', description: 'Old subscription format - likely empty' }
];

export default function ImprovedDataClear() {
  const [user] = useAuthState(auth);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string>('');
  const [clearMode, setClearMode] = useState<'subscriptions' | 'budget' | 'analysis' | 'all' | 'custom'>('subscriptions');
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);

  const append = (s: string) => setLog(prev => prev + s + '\n');

  const debugDataStructure = async () => {
    if (!user?.uid) return;
    
    append('🔍 Checking what data you actually have...');
    
    const allCollections = [...SUBSCRIPTION_DATA, ...BUDGET_DATA, ...ANALYSIS_DATA, ...DEPRECATED_DATA];
    
    for (const collectionItem of allCollections) {
      try {
        const q = query(collection(db, collectionItem.id), where('userId', '==', user.uid));
        const snapshot = await getDocs(q);
        if (snapshot.size > 0) {
          append(`${collectionItem.label}: ${snapshot.size} items`);
        }
      } catch (error) {
        // Skip collections that don't exist or have permission issues
      }
    }
  };

  const clearCollection = async (collectionName: string) => {
    append(`→ Clearing ${collectionName}...`);
    let deleted = 0;
    let errors = 0;

    try {
      const q = query(collection(db, collectionName), where('userId', '==', user!.uid));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        append(`   ✓ No documents found in ${collectionName}`);
        return { deleted: 0, errors: 0 };
      }

      // Delete one by one for better error handling
      for (const docSnap of snapshot.docs) {
        try {
          await deleteDoc(doc(db, collectionName, docSnap.id));
          deleted++;
        } catch (docError: any) {
          append(`   ❌ Failed to delete ${docSnap.id}: ${docError.message}`);
          errors++;
        }
      }

      append(`   ✓ ${deleted} deleted, ${errors} errors in ${collectionName}`);
      return { deleted, errors };

    } catch (error: any) {
      append(`   ❌ Collection ${collectionName} failed: ${error.message}`);
      return { deleted: 0, errors: 1 };
    }
  };

  const handleClearSubscriptions = async () => {
    if (!user?.uid) { alert('Not signed in'); return; }
    if (!confirm('Clear subscription data? This cannot be undone.')) return;

    setBusy(true);
    setLog('');
    append('Clearing subscription data...');

    try {
      let totalDeleted = 0;
      let totalErrors = 0;

      for (const item of SUBSCRIPTION_DATA) {
        const result = await clearCollection(item.id);
        totalDeleted += result.deleted;
        totalErrors += result.errors;
      }

      append(`Complete! Deleted ${totalDeleted} items with ${totalErrors} errors.`);
    } catch (e: any) {
      append(`Unexpected error: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const handleClearBudget = async () => {
    if (!user?.uid) { alert('Not signed in'); return; }
    if (!confirm('Clear budget and category data? This cannot be undone.')) return;

    setBusy(true);
    setLog('');
    append('Clearing budget data...');

    try {
      let totalDeleted = 0;
      let totalErrors = 0;

      for (const item of BUDGET_DATA) {
        const result = await clearCollection(item.id);
        totalDeleted += result.deleted;
        totalErrors += result.errors;
      }

      append(`Complete! Deleted ${totalDeleted} items with ${totalErrors} errors.`);
    } catch (e: any) {
      append(`Unexpected error: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const handleClearAnalysis = async () => {
    if (!user?.uid) { alert('Not signed in'); return; }
    if (!confirm('Clear analysis and scan data? This cannot be undone.')) return;

    setBusy(true);
    setLog('');
    append('Clearing analysis data...');

    try {
      let totalDeleted = 0;
      let totalErrors = 0;

      for (const item of ANALYSIS_DATA) {
        const result = await clearCollection(item.id);
        totalDeleted += result.deleted;
        totalErrors += result.errors;
      }

      append(`Complete! Deleted ${totalDeleted} items with ${totalErrors} errors.`);
    } catch (e: any) {
      append(`Unexpected error: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const handleClearAll = async () => {
    if (!user?.uid) { alert('Not signed in'); return; }
    if (!confirm('Delete ALL your data? This is permanent and cannot be undone!')) return;
    if (!confirm('Are you absolutely sure? This will delete everything.')) return;

    setBusy(true);
    setLog('');
    append('🗑️ Clearing all data...');

    try {
      let totalDeleted = 0;
      let totalErrors = 0;
      const allCollections = [...SUBSCRIPTION_DATA, ...BUDGET_DATA, ...ANALYSIS_DATA, ...DEPRECATED_DATA];

      for (const collectionItem of allCollections) {
        const result = await clearCollection(collectionItem.id);
        totalDeleted += result.deleted;
        totalErrors += result.errors;
      }

      append(`\n✅ Complete! Deleted ${totalDeleted} items with ${totalErrors} errors.`);

    } catch (e: any) {
      append(`Unexpected error: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSelectiveClear = async (collectionIds: string[]) => {
    if (!user?.uid) { alert('Not signed in'); return; }
    if (!confirm(`Clear data from selected collections?`)) return;

    setBusy(true);
    setLog('');
    append('🎯 Selective clearing...');

    try {
      let totalDeleted = 0;
      let totalErrors = 0;

      for (const collectionId of collectionIds) {
        const result = await clearCollection(collectionId);
        totalDeleted += result.deleted;
        totalErrors += result.errors;
      }

      append(`\n✅ Complete! Deleted ${totalDeleted} items with ${totalErrors} errors.`);

    } catch (e: any) {
      append(`Unexpected error: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 border rounded-xl bg-red-50 space-y-4">
      <h3 className="font-semibold text-red-700 mb-4">Data Management</h3>
      
      {/* Mode Selection */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">What do you want to clear?</label>
        <div className="space-y-2">
          <label className="flex items-start">
            <input
              type="radio"
              value="subscriptions"
              checked={clearMode === 'subscriptions'}
              onChange={(e) => setClearMode(e.target.value as any)}
              className="mr-3 mt-0.5"
            />
            <div>
              <span className="font-medium">Subscription Data</span>
              <div className="text-sm text-gray-600">Netflix, Spotify, planned expenses - your main tracking data</div>
            </div>
          </label>
          
          <label className="flex items-start">
            <input
              type="radio"
              value="budget"
              checked={clearMode === 'budget'}
              onChange={(e) => setClearMode(e.target.value as any)}
              className="mr-3 mt-0.5"
            />
            <div>
              <span className="font-medium">Budget & Categories</span>
              <div className="text-sm text-gray-600">Custom spending categories, transaction history</div>
            </div>
          </label>
          
          <label className="flex items-start">
            <input
              type="radio"
              value="analysis"
              checked={clearMode === 'analysis'}
              onChange={(e) => setClearMode(e.target.value as any)}
              className="mr-3 mt-0.5"
            />
            <div>
              <span className="font-medium">Analysis Data</span>
              <div className="text-sm text-gray-600">Bank scan results, spending insights, AI analysis</div>
            </div>
          </label>
          
          <label className="flex items-start">
            <input
              type="radio"
              value="custom"
              checked={clearMode === 'custom'}
              onChange={(e) => setClearMode(e.target.value as any)}
              className="mr-3 mt-0.5"
            />
            <div>
              <span className="font-medium">Custom Selection</span>
              <div className="text-sm text-gray-600">Pick exactly what to delete</div>
            </div>
          </label>
          
          <label className="flex items-start">
            <input
              type="radio"
              value="all"
              checked={clearMode === 'all'}
              onChange={(e) => setClearMode(e.target.value as any)}
              className="mr-3 mt-0.5"
            />
            <div>
              <span className="font-medium text-red-600">Everything</span>
              <div className="text-sm text-red-500">Complete reset - all your SubScan data</div>
            </div>
          </label>
        </div>
      </div>

      {/* Custom Collection Selection */}
      {clearMode === 'custom' && (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">Select what to delete:</label>
          
          <div className="space-y-3">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Subscription Data</h4>
              <div className="space-y-2">
                {SUBSCRIPTION_DATA.map(item => (
                  <label key={item.id} className="flex items-start">
                    <input
                      type="checkbox"
                      value={item.id}
                      checked={selectedCollections.includes(item.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedCollections([...selectedCollections, item.id]);
                        } else {
                          setSelectedCollections(selectedCollections.filter(id => id !== item.id));
                        }
                      }}
                      className="mr-3 mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-medium">{item.label}</span>
                      <div className="text-xs text-gray-600">{item.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Budget Data</h4>
              <div className="space-y-2">
                {BUDGET_DATA.map(item => (
                  <label key={item.id} className="flex items-start">
                    <input
                      type="checkbox"
                      value={item.id}
                      checked={selectedCollections.includes(item.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedCollections([...selectedCollections, item.id]);
                        } else {
                          setSelectedCollections(selectedCollections.filter(id => id !== item.id));
                        }
                      }}
                      className="mr-3 mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-medium">{item.label}</span>
                      <div className="text-xs text-gray-600">{item.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Analysis Data</h4>
              <div className="space-y-2">
                {ANALYSIS_DATA.map(item => (
                  <label key={item.id} className="flex items-start">
                    <input
                      type="checkbox"
                      value={item.id}
                      checked={selectedCollections.includes(item.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedCollections([...selectedCollections, item.id]);
                        } else {
                          setSelectedCollections(selectedCollections.filter(id => id !== item.id));
                        }
                      }}
                      className="mr-3 mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-medium">{item.label}</span>
                      <div className="text-xs text-gray-600">{item.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 flex-wrap">
        {/* Debug Button */}
        <button
          onClick={debugDataStructure}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-50"
        >
          Check What Data You Have
        </button>

        {clearMode === 'subscriptions' && (
          <button
            onClick={handleClearSubscriptions}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {busy ? 'Clearing...' : 'Clear Subscription Data'}
          </button>
        )}

        {clearMode === 'budget' && (
          <button
            onClick={handleClearBudget}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? 'Clearing...' : 'Clear Budget Data'}
          </button>
        )}

        {clearMode === 'analysis' && (
          <button
            onClick={handleClearAnalysis}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {busy ? 'Clearing...' : 'Clear Analysis Data'}
          </button>
        )}

        {clearMode === 'all' && (
          <button
            onClick={handleClearAll}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? 'Deleting...' : 'Delete Everything'}
          </button>
        )}

        {clearMode === 'custom' && (
          <button
            onClick={() => {
              if (selectedCollections.length > 0) {
                handleSelectiveClear(selectedCollections);
              } else {
                alert('Please select at least one collection');
              }
            }}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? 'Clearing...' : `Clear Selected (${selectedCollections.length})`}
          </button>
        )}
      </div>

      {/* Log Output */}
      {log && (
        <div className="mt-4">
          <pre className="text-xs text-red-800 whitespace-pre-wrap bg-white p-3 rounded border max-h-64 overflow-y-auto">
            {log}
          </pre>
        </div>
      )}

      {/* Help Text */}
      <div className="text-sm text-gray-600 bg-white p-3 rounded border">
        <p className="font-medium mb-2">Multiple Bank Account Strategy:</p>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>Yes, you can upload from 4+ banks separately</strong></li>
          <li>Each upload adds to your existing data (no overwrites)</li>
          <li>Use "Clear Subscriptions" to start fresh before new uploads</li>
          <li>The system will detect and merge similar subscriptions</li>
          <li>Upload statements in order: Primary bank first, then others</li>
        </ul>
      </div>
    </div>
  );
}