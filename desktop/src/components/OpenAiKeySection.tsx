type Props = {
  value: string;
  onChange: (next: string) => void;
  hasSavedKey: boolean;
  onSave: () => void;
  onClear: () => void;
};

export function OpenAiKeySection({ value, onChange, hasSavedKey, onSave, onClear }: Props) {
  return (
    <div className="stack-sm">
      <div className="muted">OpenAI API key (for RAG reindex)</div>
      <div className="row">
        <input className="fieldWide" value={value} onChange={(e) => onChange(e.target.value)} placeholder="sk-..." type="password" />
        <button className="btn btnPrimary" onClick={onSave} type="button" disabled={!value.trim()}>
          Save
        </button>
        <button className="btn" onClick={onClear} type="button" disabled={!hasSavedKey}>
          Clear
        </button>
      </div>
      <div className="muted helpText">
        Stored locally in Keychain. Never sent to Diregram except as a request header to generate embeddings.
      </div>
    </div>
  );
}
