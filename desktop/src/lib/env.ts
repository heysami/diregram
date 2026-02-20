function requiredEnv(name: string): string {
  const val = (import.meta as any).env?.[name] as string | undefined;
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export const env = {
  supabaseUrl: requiredEnv('VITE_SUPABASE_URL'),
  supabaseAnonKey: requiredEnv('VITE_SUPABASE_ANON_KEY'),
  nexusmapApiBaseUrl: ((import.meta as any).env?.VITE_NEXUSMAP_API_BASE_URL as string | undefined) || 'http://localhost:3000',
};

