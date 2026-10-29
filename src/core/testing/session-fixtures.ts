import { HostSession, type HostSessionOptions } from '../session/host-session';
import { ViewerSession, type JoinOptions } from '../session/viewer-session';
import { FakeNetwork } from './fake-network';

/** Lets queued microtasks (fake message delivery) run. */
export const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function createHost(options: Partial<HostSessionOptions> = {}) {
  const network = new FakeNetwork();
  let nextId = 0;
  const host = new HostSession({
    hostName: 'Host',
    connector: network,
    createId: () => `id-${String(nextId++).padStart(8, '0')}`,
    now: () => 1_000,
    ...options,
  });
  return { host, network };
}

export async function joinViewer(
  host: HostSession,
  network: FakeNetwork,
  viewerName: string,
  options: Pick<JoinOptions, 'reportIntervalMs'> = {},
) {
  const { code } = await host.createInvitation();
  const { session, replyCode } = await ViewerSession.join(code, {
    viewerName,
    connector: network,
    ...options,
  });
  const participant = await host.acceptReply(replyCode);
  await flush();
  return { viewer: session, participant };
}
