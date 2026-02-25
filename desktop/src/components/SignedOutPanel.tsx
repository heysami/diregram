type Props = {
  loginEmail: string;
  loginOtp: string;
  onLoginEmailChange: (next: string) => void;
  onLoginOtpChange: (next: string) => void;
  onSendCode: () => void;
  onVerify: () => void;
  onResetConfig: () => void;
};

export function SignedOutPanel({
  loginEmail,
  loginOtp,
  onLoginEmailChange,
  onLoginOtpChange,
  onSendCode,
  onVerify,
  onResetConfig,
}: Props) {
  return (
    <div className="stack-md">
      <div className="row">
        <input className="fieldWide" value={loginEmail} onChange={(e) => onLoginEmailChange(e.target.value)} placeholder="Email" />
        <button className="btn btnPrimary" onClick={onSendCode} type="button">
          Send code
        </button>
        <button className="btn" onClick={onResetConfig} type="button">
          Reset config
        </button>
      </div>
      <div className="row">
        <input className="fieldWide" value={loginOtp} onChange={(e) => onLoginOtpChange(e.target.value)} placeholder="Code" />
        <button className="btn btnPrimary" onClick={onVerify} type="button">
          Verify
        </button>
      </div>
    </div>
  );
}
