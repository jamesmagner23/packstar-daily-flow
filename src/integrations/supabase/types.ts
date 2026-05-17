export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      boq_lines: {
        Row: {
          category: string
          depth_band_m: number | null
          description: string
          diameter_mm: number | null
          id: string
          material: string | null
          pit_dimensions_mm: string | null
          pit_type: string | null
          project_id: string | null
          rate: number
          ref: string
          unit: string
        }
        Insert: {
          category: string
          depth_band_m?: number | null
          description: string
          diameter_mm?: number | null
          id?: string
          material?: string | null
          pit_dimensions_mm?: string | null
          pit_type?: string | null
          project_id?: string | null
          rate: number
          ref: string
          unit: string
        }
        Update: {
          category?: string
          depth_band_m?: number | null
          description?: string
          diameter_mm?: number | null
          id?: string
          material?: string | null
          pit_dimensions_mm?: string | null
          pit_type?: string | null
          project_id?: string | null
          rate?: number
          ref?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "boq_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      classifications: {
        Row: {
          classification: string
          created_at: string
          description: string | null
          eba_source: string | null
          employment_type: string
          id: string
          nt_cost_per_hr: number
          ot_cost_per_hr: number
        }
        Insert: {
          classification: string
          created_at?: string
          description?: string | null
          eba_source?: string | null
          employment_type: string
          id?: string
          nt_cost_per_hr: number
          ot_cost_per_hr: number
        }
        Update: {
          classification?: string
          created_at?: string
          description?: string | null
          eba_source?: string | null
          employment_type?: string
          id?: string
          nt_cost_per_hr?: number
          ot_cost_per_hr?: number
        }
        Relationships: []
      }
      crew_members: {
        Row: {
          active: boolean | null
          capabilities: string[]
          employment_type: string | null
          id: string
          name: string
          project_id: string | null
          role: string
        }
        Insert: {
          active?: boolean | null
          capabilities?: string[]
          employment_type?: string | null
          id?: string
          name: string
          project_id?: string | null
          role: string
        }
        Update: {
          active?: boolean | null
          capabilities?: string[]
          employment_type?: string | null
          id?: string
          name?: string
          project_id?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_prompts_sent: {
        Row: {
          id: string
          opener_used: string
          sent_at: string
          sent_for_date: string
          slack_channel: string | null
          slack_ts: string | null
          supervisor_id: string
        }
        Insert: {
          id?: string
          opener_used: string
          sent_at?: string
          sent_for_date: string
          slack_channel?: string | null
          slack_ts?: string | null
          supervisor_id: string
        }
        Update: {
          id?: string
          opener_used?: string
          sent_at?: string
          sent_for_date?: string
          slack_channel?: string | null
          slack_ts?: string | null
          supervisor_id?: string
        }
        Relationships: []
      }
      daily_reports: {
        Row: {
          complete: boolean | null
          cost_aud: number | null
          created_at: string | null
          crew_hours: Json | null
          edits: Json
          email_sent_at: string | null
          id: string
          margin_aud: number | null
          message_history: Json
          plant_hours: Json | null
          productivity_note: string | null
          productivity_pct: number | null
          project_id: string | null
          raw_transcript: string | null
          report_date: string
          revenue_aud: number | null
          structured: Json | null
          supervisor_id: string | null
          updated_at: string | null
          works_completed: Json | null
        }
        Insert: {
          complete?: boolean | null
          cost_aud?: number | null
          created_at?: string | null
          crew_hours?: Json | null
          edits?: Json
          email_sent_at?: string | null
          id?: string
          margin_aud?: number | null
          message_history?: Json
          plant_hours?: Json | null
          productivity_note?: string | null
          productivity_pct?: number | null
          project_id?: string | null
          raw_transcript?: string | null
          report_date: string
          revenue_aud?: number | null
          structured?: Json | null
          supervisor_id?: string | null
          updated_at?: string | null
          works_completed?: Json | null
        }
        Update: {
          complete?: boolean | null
          cost_aud?: number | null
          created_at?: string | null
          crew_hours?: Json | null
          edits?: Json
          email_sent_at?: string | null
          id?: string
          margin_aud?: number | null
          message_history?: Json
          plant_hours?: Json | null
          productivity_note?: string | null
          productivity_pct?: number | null
          project_id?: string | null
          raw_transcript?: string | null
          report_date?: string
          revenue_aud?: number | null
          structured?: Json | null
          supervisor_id?: string | null
          updated_at?: string | null
          works_completed?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_reports_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "supervisors"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          created_at: string | null
          id: string
          slack_file_id: string | null
          storage_path: string
          variation_flag_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          slack_file_id?: string | null
          storage_path: string
          variation_flag_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          slack_file_id?: string | null
          storage_path?: string
          variation_flag_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "photos_variation_flag_id_fkey"
            columns: ["variation_flag_id"]
            isOneToOne: false
            referencedRelation: "variation_flags"
            referencedColumns: ["id"]
          },
        ]
      }
      pits: {
        Row: {
          id: string
          pit_id: string
          project_id: string | null
          separable_portion_code: string | null
          status: string | null
        }
        Insert: {
          id?: string
          pit_id: string
          project_id?: string | null
          separable_portion_code?: string | null
          status?: string | null
        }
        Update: {
          id?: string
          pit_id?: string
          project_id?: string | null
          separable_portion_code?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      plant_hire_rate_card: {
        Row: {
          active: boolean
          created_at: string
          dry_hire_daily: number | null
          dry_hire_weekly: number | null
          id: string
          notes: string | null
          size_class: string
          type: string
          wet_hire_night_hr: number | null
          wet_hire_nt_hr: number | null
          wet_hire_ot_hr: number | null
          wet_hire_ph_hr: number | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          dry_hire_daily?: number | null
          dry_hire_weekly?: number | null
          id?: string
          notes?: string | null
          size_class: string
          type: string
          wet_hire_night_hr?: number | null
          wet_hire_nt_hr?: number | null
          wet_hire_ot_hr?: number | null
          wet_hire_ph_hr?: number | null
        }
        Update: {
          active?: boolean
          created_at?: string
          dry_hire_daily?: number | null
          dry_hire_weekly?: number | null
          id?: string
          notes?: string | null
          size_class?: string
          type?: string
          wet_hire_night_hr?: number | null
          wet_hire_nt_hr?: number | null
          wet_hire_ot_hr?: number | null
          wet_hire_ph_hr?: number | null
        }
        Relationships: []
      }
      plant_items: {
        Row: {
          active: boolean | null
          cost_rate_nt: number | null
          cost_rate_ot: number | null
          description: string | null
          id: string
          plant_id_code: string
          project_id: string | null
          tonnage_class: string | null
        }
        Insert: {
          active?: boolean | null
          cost_rate_nt?: number | null
          cost_rate_ot?: number | null
          description?: string | null
          id?: string
          plant_id_code: string
          project_id?: string | null
          tonnage_class?: string | null
        }
        Update: {
          active?: boolean | null
          cost_rate_nt?: number | null
          cost_rate_ot?: number | null
          description?: string | null
          id?: string
          plant_id_code?: string
          project_id?: string | null
          tonnage_class?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plant_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          active: boolean | null
          additional_qualifying_causes_of_delay: string[] | null
          code: string
          contract_date: string | null
          contract_type: string | null
          created_at: string | null
          defects_liability_period_months: number | null
          expected_daily_revenue_aud: number | null
          head_contractor: string
          head_contractor_rep: Json | null
          id: string
          liquidated_damages_cap_pct_of_contract: number | null
          max_daily_delay_costs_aud: number | null
          max_total_delay_costs_pct_of_contract: number | null
          name: string
          pacc_rep: Json | null
          package: string | null
          payment_claim_dates: string | null
          payment_claim_method: string | null
          principal: string | null
          raw_contract_json: Json | null
          site_address: string | null
          working_days: string | null
          working_hours_end: string | null
          working_hours_start: string | null
        }
        Insert: {
          active?: boolean | null
          additional_qualifying_causes_of_delay?: string[] | null
          code: string
          contract_date?: string | null
          contract_type?: string | null
          created_at?: string | null
          defects_liability_period_months?: number | null
          expected_daily_revenue_aud?: number | null
          head_contractor: string
          head_contractor_rep?: Json | null
          id?: string
          liquidated_damages_cap_pct_of_contract?: number | null
          max_daily_delay_costs_aud?: number | null
          max_total_delay_costs_pct_of_contract?: number | null
          name: string
          pacc_rep?: Json | null
          package?: string | null
          payment_claim_dates?: string | null
          payment_claim_method?: string | null
          principal?: string | null
          raw_contract_json?: Json | null
          site_address?: string | null
          working_days?: string | null
          working_hours_end?: string | null
          working_hours_start?: string | null
        }
        Update: {
          active?: boolean | null
          additional_qualifying_causes_of_delay?: string[] | null
          code?: string
          contract_date?: string | null
          contract_type?: string | null
          created_at?: string | null
          defects_liability_period_months?: number | null
          expected_daily_revenue_aud?: number | null
          head_contractor?: string
          head_contractor_rep?: Json | null
          id?: string
          liquidated_damages_cap_pct_of_contract?: number | null
          max_daily_delay_costs_aud?: number | null
          max_total_delay_costs_pct_of_contract?: number | null
          name?: string
          pacc_rep?: Json | null
          package?: string | null
          payment_claim_dates?: string | null
          payment_claim_method?: string | null
          principal?: string | null
          raw_contract_json?: Json | null
          site_address?: string | null
          working_days?: string | null
          working_hours_end?: string | null
          working_hours_start?: string | null
        }
        Relationships: []
      }
      rate_card_variations: {
        Row: {
          created_at: string
          id: string
          project_id: string | null
          rate: number
          resource: string
          time_band: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id?: string | null
          rate: number
          resource: string
          time_band: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string | null
          rate?: number
          resource?: string
          time_band?: string
        }
        Relationships: []
      }
      separable_portions: {
        Row: {
          code: string
          commencement: string | null
          completion: string | null
          id: string
          ld_per_day_aud: number | null
          name: string
          project_id: string | null
        }
        Insert: {
          code: string
          commencement?: string | null
          completion?: string | null
          id?: string
          ld_per_day_aud?: number | null
          name: string
          project_id?: string | null
        }
        Update: {
          code?: string
          commencement?: string | null
          completion?: string | null
          id?: string
          ld_per_day_aud?: number | null
          name?: string
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "separable_portions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      supervisors: {
        Row: {
          active: boolean | null
          email: string | null
          id: string
          name: string
          project_id: string | null
          slack_user_id: string
        }
        Insert: {
          active?: boolean | null
          email?: string | null
          id?: string
          name: string
          project_id?: string | null
          slack_user_id: string
        }
        Update: {
          active?: boolean | null
          email?: string | null
          id?: string
          name?: string
          project_id?: string | null
          slack_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supervisors_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      variation_clauses: {
        Row: {
          claim_type: string
          clause_ref: string
          condition_precedent: boolean | null
          early_warning_deadline_bd: number | null
          full_report_deadline_bd: number | null
          id: string
          notes: string | null
          notice_before_complying: boolean | null
          notice_deadline_bd: number | null
          particulars_deadline_bd: number | null
          project_id: string | null
        }
        Insert: {
          claim_type: string
          clause_ref: string
          condition_precedent?: boolean | null
          early_warning_deadline_bd?: number | null
          full_report_deadline_bd?: number | null
          id?: string
          notes?: string | null
          notice_before_complying?: boolean | null
          notice_deadline_bd?: number | null
          particulars_deadline_bd?: number | null
          project_id?: string | null
        }
        Update: {
          claim_type?: string
          clause_ref?: string
          condition_precedent?: boolean | null
          early_warning_deadline_bd?: number | null
          full_report_deadline_bd?: number | null
          id?: string
          notes?: string | null
          notice_before_complying?: boolean | null
          notice_deadline_bd?: number | null
          particulars_deadline_bd?: number | null
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "variation_clauses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      variation_flags: {
        Row: {
          claim_type: string
          clause_ref: string
          created_at: string | null
          daily_report_id: string | null
          deadline_at: string | null
          description: string | null
          duration_impact_hours: number | null
          id: string
          notice_deadline_bd: number | null
          notice_sent_at: string | null
          photo_urls: string[] | null
          project_id: string | null
          status: string | null
          symal_rep_saw: boolean | null
          trigger_phrase: string | null
        }
        Insert: {
          claim_type: string
          clause_ref: string
          created_at?: string | null
          daily_report_id?: string | null
          deadline_at?: string | null
          description?: string | null
          duration_impact_hours?: number | null
          id?: string
          notice_deadline_bd?: number | null
          notice_sent_at?: string | null
          photo_urls?: string[] | null
          project_id?: string | null
          status?: string | null
          symal_rep_saw?: boolean | null
          trigger_phrase?: string | null
        }
        Update: {
          claim_type?: string
          clause_ref?: string
          created_at?: string | null
          daily_report_id?: string | null
          deadline_at?: string | null
          description?: string | null
          duration_impact_hours?: number | null
          id?: string
          notice_deadline_bd?: number | null
          notice_sent_at?: string | null
          photo_urls?: string[] | null
          project_id?: string | null
          status?: string | null
          symal_rep_saw?: boolean | null
          trigger_phrase?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "variation_flags_daily_report_id_fkey"
            columns: ["daily_report_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variation_flags_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      variation_triggers: {
        Row: {
          claim_type: string
          clause_ref: string
          id: string
          keywords: string[]
          project_id: string | null
        }
        Insert: {
          claim_type: string
          clause_ref: string
          id?: string
          keywords: string[]
          project_id?: string | null
        }
        Update: {
          claim_type?: string
          clause_ref?: string
          id?: string
          keywords?: string[]
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "variation_triggers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
