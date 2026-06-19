import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string
if (!url || !key) throw new Error('Missing Supabase env vars')

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})

export const DOCS_BUCKET = 'documents'
export const publicUrl = (path: string) =>
  `${url}/storage/v1/object/public/${DOCS_BUCKET}/${path}`
