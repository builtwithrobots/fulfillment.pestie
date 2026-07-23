/**
 * Supabase database types.
 *
 * These are hand-written to match supabase/migrations/0001_init.sql so the app
 * type-checks today. Once your schema is live, regenerate the real thing with:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/supabase/types.ts
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type AppRole = 'director' | 'supervisor' | 'floor_lead' | 'executive'

export type ShiftKitStatus = 'on_track' | 'at_risk' | 'will_not_complete'

export type FloorShapeKind = 'area' | 'station' | 'label' | 'arrow' | 'figure'
export type FloorShapeGeometry = 'rect' | 'circle'

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
      studies: Table<{
        id: string
        created_by: string
        title: string
        wage_rate: number
        allowance_pct: number
        use_whole_timer: boolean
        is_group_check: boolean
        ai_analysis: {
          summary: string
          recommendations: { title: string; detail: string }[]
          generatedAt?: string
        } | null
        created_at: string
        updated_at: string
      }>
      steps: Table<{
        id: string
        study_id: string
        name: string
        notes: string | null
        timed: boolean
        position: number
        pieces_per_cycle: number
        created_at: string
      }>
      observations: Table<{
        id: string
        step_id: string
        study_id: string
        duration_ms: number
        worker_id: string | null
        recorded_at: string
      }>
      master_runs: Table<{
        id: string
        study_id: string
        duration_ms: number
        worker_id: string | null
        recorded_at: string
      }>
      floor_plans: Table<{
        id: string
        name: string
        image_path: string | null
        image_width: number | null
        image_height: number | null
        is_active: boolean
        created_at: string
        updated_at: string
      }>
      floor_shapes: Table<{
        id: string
        plan_id: string
        kind: FloorShapeKind
        shape: FloorShapeGeometry
        x: number
        y: number
        w: number
        h: number
        rotation: number
        label: string
        color: string
        station_id: string | null
        planned_headcount: number
        sort_order: number
        locked: boolean
        created_at: string
        updated_at: string
      }>
      workers: Table<{
        id: string
        full_name: string
        active: boolean
        created_at: string
      }>
      station_assignments: Table<{
        id: string
        station_id: string
        worker_id: string
        assigned_at: string
      }>
      shift_plans: Table<{
        id: string
        created_at: string
        created_by: string
        shift_date: string
        shift_start_time: string
        available_headcount: number
        fak_qty: number
        rak_qty: number
        uyak_qty: number
        rec_fak_rak_workers: number | null
        rec_uyak_stations: number | null
        rec_tape_scan_workers: number | null
        rec_assembly_workers: number | null
        rec_assembly_lines: number | null
        rec_material_handling: number | null
        rec_replenishment: number | null
        est_fak_completion_min: number | null
        est_rak_completion_min: number | null
        est_uyak_completion_min: number | null
        est_assembly_completion_min: number | null
        flex_recommendations: Json | null
        fak_status: ShiftKitStatus | null
        rak_status: ShiftKitStatus | null
        uyak_status: ShiftKitStatus | null
        actual_headcount: number | null
        actual_fak_completed: number | null
        actual_rak_completed: number | null
        actual_uyak_completed: number | null
        actual_shift_end_time: string | null
        notes: string | null
      }>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      app_role: AppRole
    }
  }
}
