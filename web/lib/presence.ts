import type { ClientIdentity } from '@/lib/client-identity';

export type PresenceView = 'main' | 'dataObjects' | 'flows' | 'systemFlow' | 'testing';

export type PresenceCursor = {
  /** Cursor in the local coordinate system of the active view. For NexusCanvas this is world-space. */
  x: number;
  y: number;
};

export type PresenceState = {
  user: Pick<ClientIdentity, 'id' | 'name' | 'badgeClass'>;
  view: PresenceView;
  cursor?: PresenceCursor | null;
  /** Last update (ms since epoch). Useful for pruning stale cursors if needed. */
  ts?: number;
};

export type PresencePeer = {
  clientId: number;
  state: PresenceState;
};

export type PresenceController = {
  self: ClientIdentity;
  peers: PresencePeer[];
  setView: (view: PresenceView) => void;
  setCursor: (cursor: PresenceCursor | null) => void;
};

