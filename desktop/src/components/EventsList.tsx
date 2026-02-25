type SyncEvent = { ts: string; kind: string; path: string; detail: string };

type Props = {
  events: SyncEvent[];
};

export function EventsList({ events }: Props) {
  if (!events.length) return null;
  return (
    <div className="eventsBlock">
      <div className="muted">Recent sync events</div>
      <div className="eventList">
        {events.map((e, idx) => (
          <div key={idx} className="eventItem muted">
            <div className="mono">
              [{e.ts}] {e.kind} - {e.path}
            </div>
            <div className="eventDetail">{e.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
