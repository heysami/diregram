function optionalEnv(name: string): string | null {
  const val = (import.meta as any).env?.[name] as string | undefined;
  return val?.trim() ? val.trim() : null;
}

// Build-time defaults (useful in development). Packaged desktop builds should use
// in-app config stored in Keychain instead of relying on env vars.
export const buildEnv = {
  supabaseUrl: optionalEnv('VITE_SUPABASE_URL'),
  supabaseAnonKey: optionalEnv('VITE_SUPABASE_ANON_KEY'),
  nexusmapApiBaseUrl: optionalEnv('VITE_NEXUSMAP_API_BASE_URL') || 'http://localhost:3000',
  nexusmapHostedUrl: optionalEnv('VITE_NEXUSMAP_HOSTED_URL'),
};

