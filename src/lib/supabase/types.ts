/**
 * Supabase database types.
 *
 * These are hand-written to match supabase/migrations/0001_init.sql so the app
 * type-checks today. Once your schema is live, regenerate the real thing with:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/supabase/types.ts
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type AppRole = 'director' | 'supervisor' | 'floor_lead' | 'executive'

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      app_users: Table<{
        clerk_user_id: string
        full_name: string
        role: AppRole
        created_at: string
      }>
      lines: Table<{
        id: string
        name: string
        active: boolean
        sort_order: number
      }>
      stations: Table<{
        id: string
        line_id: string | null
        name: string
        token_version: number
        created_at: string
      }>
      line_status: Table<{
        station_id: string
        headcount: number
        actual: number
        updated_at: string
      }>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      app_role: AppRole
    }
  }
}
