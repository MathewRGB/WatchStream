import { TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { hasPublicAddress, type CandidateSummary } from '@/core/peer/candidates';

interface NoPublicAddressNoticeProps {
  candidates: CandidateSummary;
}

/**
 * Shown next to a code that cannot be reached from another network. The
 * cause is usually on the sender's side, so it appears before anyone has
 * spent minutes passing codes back and forth.
 */
export function NoPublicAddressNotice({ candidates }: NoPublicAddressNoticeProps) {
  if (hasPublicAddress(candidates)) return null;
  return (
    <Alert variant="destructive" data-testid="no-public-address">
      <TriangleAlert />
      <AlertDescription>
        This code contains no public network address, so someone on another network will probably
        not be able to connect. A VPN, a firewall or a blocked STUN server can cause this. Inside
        one network it still works.
      </AlertDescription>
    </Alert>
  );
}
