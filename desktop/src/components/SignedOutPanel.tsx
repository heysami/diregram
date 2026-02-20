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
    <>
      <div className="row" style={{ marginTop: 12 }}>
        <input value={loginEmail} onChange={(e) => onLoginEmailChange(e.target.value)} placeholder="Email" />
        <button className="btn btnPrimary" onClick={onSendCode} type="button">
          Send code
        </button>
        <button className="btn" onClick={onResetConfig} type="button">
          Reset config
        </button>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <input value={loginOtp} onChange={(e) => onLoginOtpChange(e.target.value)} placeholder="Code" />
        <button className="btn btnPrimary" onClick={onVerify} type="button">
          Verify
        </button>
      </div>
    </>
  );
}

