// src/app/dashboard/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { signInAnonymously } from 'firebase/auth';

import { ensureSoloHousehold } from '@/lib/initHousehold';
import HouseholdBudgetProvider from '@/components/HouseholdBudgetProvider';
import SubScanDashboardV2 from '@/components/SubScanDashboardV2';
import DangerClearMyData from '@/components/DangerClearMyData';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoadingState } from '@/components/Loading';

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
        const id = await ensureSoloHousehold(user.uid); // <= returns "solo:{uid}"
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
    return <LoadingState message="Setting up your dashboard" type="dashboard" />;
  }

  // 4) Provide the household id to the budget context
  return (
    <ErrorBoundary>
      <HouseholdBudgetProvider householdId={hid}>
        <div className="space-y-6">
          <SubScanDashboardV2 />
          <DangerClearMyData />
        </div>
      </HouseholdBudgetProvider>
    </ErrorBoundary>
  );
}
