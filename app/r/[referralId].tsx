import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { captureReferralLink } from '@/src/lib/journey-runtime';
import { safeReferralId } from '@/src/lib/referral-contract';

// A referral changes only local attribution metadata, never auth or package state.
export default function ReferralEntry() {
  const { referralId } = useLocalSearchParams<{ referralId?: string }>();
  useEffect(() => {
    const id = safeReferralId(referralId);
    if (id) void captureReferralLink(`gigxomi://r/${id}`);
  }, [referralId]);
  return <Redirect href="/" />;
}
