// src/app/i/page.tsx
'use client';

import React, { useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { signInAnonymously } from 'firebase/auth';
import SubScanDashboardV2 from '@/components/SubScanDashboardV2';
import DangerClearMyData from '@/components/DangerClearMyData';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoadingState } from '@/components/Loading';

export default function DashboardPage() {
  const [user, authLoading] = useAuthState(auth);

  useEffect(() => {
    if (!authLoading && !user) {
      signInAnonymously(auth).catch(console.error);
    }
  }, [authLoading, user]);

  if (authLoading || !user) {
    return <LoadingState message="Setting up your dashboard" type="dashboard" />;
  }

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        <SubScanDashboardV2 />
        <DangerClearMyData />
      </div>
    </ErrorBoundary>
  );
}
