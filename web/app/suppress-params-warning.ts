// Temporary workaround for Next.js 16.1.5 + React 19 issue
// where React DevTools tries to serialize params Promise
// This is a false positive since we don't use dynamic routes
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  // Dev-only: suppress common AbortError noise from App Router / hot reload cancellations.
  // These can surface as unhandled rejections with messages like:
  // - "signal is aborted without reason"
  // - "The operation was aborted"
  // and are typically safe to ignore.
  const isAbortErrorLike = (reason: unknown): boolean => {
    if (!reason) return false;
    if (typeof reason === 'string') {
      return reason.toLowerCase().includes('aborterror') || reason.toLowerCase().includes('signal is aborted');
    }
    if (reason instanceof Error) {
      const name = String((reason as any).name || '');
      const msg = String(reason.message || '');
      return name === 'AbortError' || msg.toLowerCase().includes('signal is aborted') || msg.toLowerCase().includes('aborted');
    }
    try {
      const anyReason = reason as any;
      const name = String(anyReason?.name || '');
      const msg = String(anyReason?.message || '');
      return name === 'AbortError' || msg.toLowerCase().includes('signal is aborted') || msg.toLowerCase().includes('aborted');
    } catch {
      return false;
    }
  };

  window.addEventListener('unhandledrejection', (event) => {
    if (isAbortErrorLike(event.reason)) {
      event.preventDefault();
    }
  });

  // Some abort noise is surfaced via window error events (not unhandledrejection),
  // depending on how the App Router / overlay catches it.
  window.addEventListener('error', (event) => {
    if (isAbortErrorLike((event as any).error) || isAbortErrorLike(event.message)) {
      event.preventDefault();
    }
  });

  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    const message = args[0];
    if (
      typeof message === 'string' &&
      (message.includes('params are being enumerated') ||
       message.includes('params is a Promise') ||
       message.includes('must be unwrapped with React.use()') ||
       message.toLowerCase().includes('signal is aborted without reason'))
    ) {
      // Suppress this specific Next.js/React DevTools warning
      return;
    }
    originalError.apply(console, args as unknown as Parameters<typeof console.error>);
  };
}
