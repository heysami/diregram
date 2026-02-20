type Props = {
  value: string;
  onChange: (next: string) => void;
  hasSavedKey: boolean;
  onSave: () => void;
  onClear: () => void;
};

export function OpenAiKeySection({ value, onChange, hasSavedKey, onSave, onClear }: Props) {
  return (
    <div style={{ marginTop: 14 }}>
      <div className="muted">OpenAI API key (for RAG reindex)</div>
      <div className="row" style={{ marginTop: 8 }}>
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="sk-…" type="password" />
        <button className="btn btnPrimary" onClick={onSave} type="button" disabled={!value.trim()}>
          Save
        </button>
        <button className="btn" onClick={onClear} type="button" disabled={!hasSavedKey}>
          Clear
        </button>
      </div>
      <div className="muted" style={{ marginTop: 6 }}>
        Stored locally in Keychain. Never sent to NexusMap except as a request header to generate embeddings.
      </div>
    </div>
  );
}

