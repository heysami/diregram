let counter = 0;

export function isFxVisibilityOverrideActive(): boolean {
  return counter > 0;
}

export async function withFxVisibilityOverride<T>(fn: () => Promise<T>): Promise<T> {
  counter++;
  try {
    return await fn();
  } finally {
    counter = Math.max(0, counter - 1);
  }
}

