import type { Metadata } from 'next';
import TennisApp from '@/tennis/tennis-app';
export const metadata: Metadata = {
  title: 'Baseline — Tennis at home',
  description:
    'A private tennis practice court with configurable hand and arm controls.',
};
export default function TennisPage() {
  return <TennisApp />;
}
