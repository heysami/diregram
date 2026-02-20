type SyncEvent = { ts: string; kind: string; path: string; detail: string };

type Props = {
  events: SyncEvent[];
};

export function EventsList({ events }: Props) {
  if (!events.length) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div className="muted">Recent sync events</div>
      <div style={{ marginTop: 6, maxHeight: 180, overflow: 'auto' }}>
        {events.map((e, idx) => (
          <div key={idx} className="muted" style={{ marginBottom: 8 }}>
            <div className="mono">
              [{e.ts}] {e.kind} — {e.path}
            </div>
            <div style={{ opacity: 0.85 }}>{e.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

