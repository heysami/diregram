import type { ExpandedConnectorStub } from '@/lib/expanded-connector-anchors';

export function ExpandedConnectorStubOverlay({ stubs }: { stubs: ExpandedConnectorStub[] }) {
  if (!stubs.length) return null;
  return (
    <svg className="absolute top-0 left-0 w-[5000px] h-[5000px] overflow-visible pointer-events-none z-[60]">
      {stubs.map((s) => (
        <line
          key={s.key}
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          stroke="#000000"
          strokeWidth={s.highlight ? 2 : 1.5}
        />
      ))}
    </svg>
  );
}

