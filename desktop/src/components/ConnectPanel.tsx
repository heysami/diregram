type Props = {
  hostedUrl: string;
  onHostedUrlChange: (next: string) => void;
  onConnect: () => void;
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  supabaseUrl: string;
  anonKey: string;
  apiBaseUrl: string;
  onSupabaseUrlChange: (next: string) => void;
  onAnonKeyChange: (next: string) => void;
  onApiBaseUrlChange: (next: string) => void;
};

export function ConnectPanel({
  hostedUrl,
  onHostedUrlChange,
  onConnect,
  showAdvanced,
  onToggleAdvanced,
  supabaseUrl,
  anonKey,
  apiBaseUrl,
  onSupabaseUrlChange,
  onAnonKeyChange,
  onApiBaseUrlChange,
}: Props) {
  return (
    <div className="stack-md">
      <div className="row">
        <input className="fieldWide" value={hostedUrl} onChange={(e) => onHostedUrlChange(e.target.value)} placeholder="Connect URL" />
      </div>
      <div className="row">
        <button className="btn btnPrimary" onClick={onConnect} type="button">
          Connect
        </button>
        <button className="btn" onClick={onToggleAdvanced} type="button">
          {showAdvanced ? 'Hide advanced' : 'Advanced'}
        </button>
      </div>

      {showAdvanced ? (
        <div className="subPanel stack-sm">
          <div className="muted">Advanced (self-host / development)</div>
          <div className="row">
            <input className="fieldWide" value={supabaseUrl} onChange={(e) => onSupabaseUrlChange(e.target.value)} placeholder="Supabase URL" />
          </div>
          <div className="row">
            <input className="fieldWide" value={anonKey} onChange={(e) => onAnonKeyChange(e.target.value)} placeholder="Supabase anon key" />
          </div>
          <div className="row">
            <input className="fieldWide" value={apiBaseUrl} onChange={(e) => onApiBaseUrlChange(e.target.value)} placeholder="Diregram API base URL" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
