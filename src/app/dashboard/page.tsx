// src/app/dashboard/page.tsx
// Streamlined single-system approach for new users

'use client';
import React, { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { signInAnonymously } from 'firebase/auth';
import { ensureSoloHousehold } from '@/lib/initHousehold';

// Single provider approach
import HouseholdBudgetProvider from '@/components/HouseholdBudgetProvider';
import StreamlinedSubScan from '@/components/StreamlinedSubScan';   
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoadingState } from '@/components/Loading';
import SubScanDashboardV2 from '@/components/SubScanDashboardV2';
import { MonthlyBudgetProvider } from '@/components/MonthlyBudgetProvider';
export default function DashboardPage() {
  const [user, authLoading] = useAuthState(auth);
  const [hid, setHid] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  // 1) Ensure we have a user (anon signin if needed)
  useEffect(() => {
    if (!authLoading && !user) {
      signInAnonymously(auth).catch(console.error);
    }
  }, [authLoading, user]);

  // 2) Ensure the solo household & membership exist, then store hid
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      try {
        const id = await ensureSoloHousehold(user.uid);
        if (!cancelled) setHid(id);
      } catch (e) {
        console.error('ensureSoloHousehold failed', e);
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // 3) Wait until we have both a user AND a household id
  if (authLoading || bootstrapping || !user || !hid) {
    return <LoadingState message="Setting up your financial dashboard" type="dashboard" />;
  }

  // 4) Render single streamlined system
  return (
    <ErrorBoundary>
      <HouseholdBudgetProvider householdId={hid}>
        <MonthlyBudgetProvider householdId={hid}>
          <div className="min-h-screen bg-gray-50">
            <SubScanDashboardV2 />
          </div>
        </MonthlyBudgetProvider>
      </HouseholdBudgetProvider>
    </ErrorBoundary>
  );
}