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
      competencies: {
        Row: {
          code: string
          id: string
          name: string
          type: string
        }
        Insert: {
          code: string
          id?: string
          name: string
          type: string
        }
        Update: {
          code?: string
          id?: string
          name?: string
          type?: string
        }
        Relationships: []
      }
      crew_members: {
        Row: {
          active: boolean | null
          capabilities: string[]
          default_supervisor_id: string | null
          email: string | null
          employment_type: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          project_id: string | null
          role: string
          slack_user_id: string | null
        }
        Insert: {
          active?: boolean | null
          capabilities?: string[]
          default_supervisor_id?: string | null
          email?: string | null
          employment_type?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          project_id?: string | null
          role: string
          slack_user_id?: string | null
        }
        Update: {
          active?: boolean | null
          capabilities?: string[]
          default_supervisor_id?: string | null
          email?: string | null
          employment_type?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          project_id?: string | null
          role?: string
          slack_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crew_members_default_supervisor_id_fkey"
            columns: ["default_supervisor_id"]
            isOneToOne: false
            referencedRelation: "supervisors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_allocations: {
        Row: {
          actual_hours: number | null
          allocation_date: string
          classification_id: string | null
          created_at: string
          id: string
          job_id: string
          notes: string | null
          person_id: string
          planned_hours: number | null
          plant_asset_ids: string[] | null
          source: string
          supervisor_id: string | null
          updated_at: string
        }
        Insert: {
          actual_hours?: number | null
          allocation_date: string
          classification_id?: string | null
          created_at?: string
          id?: string
          job_id: string
          notes?: string | null
          person_id: string
          planned_hours?: number | null
          plant_asset_ids?: string[] | null
          source: string
          supervisor_id?: string | null
          updated_at?: string
        }
        Update: {
          actual_hours?: number | null
          allocation_date?: string
          classification_id?: string | null
          created_at?: string
          id?: string
          job_id?: string
          notes?: string | null
          person_id?: string
          planned_hours?: number | null
          plant_asset_ids?: string[] | null
          source?: string
          supervisor_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_allocations_classification_id_fkey"
            columns: ["classification_id"]
            isOneToOne: false
            referencedRelation: "classifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_allocations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_allocations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_allocations_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
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
      dockets: {
        Row: {
          allocation_date: string
          captured_hours_by_person: Json
          created_at: string
          id: string
          job_id: string
          source_daily_report_id: string | null
        }
        Insert: {
          allocation_date: string
          captured_hours_by_person: Json
          created_at?: string
          id?: string
          job_id: string
          source_daily_report_id?: string | null
        }
        Update: {
          allocation_date?: string
          captured_hours_by_person?: Json
          created_at?: string
          id?: string
          job_id?: string
          source_daily_report_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dockets_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dockets_source_daily_report_id_fkey"
            columns: ["source_daily_report_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      eligibility_alert_log: {
        Row: {
          allocation_date: string
          person_id: string
          sent_at: string
          site_id: string
        }
        Insert: {
          allocation_date: string
          person_id: string
          sent_at?: string
          site_id: string
        }
        Update: {
          allocation_date?: string
          person_id?: string
          sent_at?: string
          site_id?: string
        }
        Relationships: []
      }
      equipment_catalogue: {
        Row: {
          active: boolean
          category: string
          created_at: string
          id: string
          item_name: string
          notes: string | null
          rate_basis: string
          typical_specs: string | null
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          id?: string
          item_name: string
          notes?: string | null
          rate_basis?: string
          typical_specs?: string | null
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          id?: string
          item_name?: string
          notes?: string | null
          rate_basis?: string
          typical_specs?: string | null
        }
        Relationships: []
      }
      induction_expiry_notice_log: {
        Row: {
          band: string
          created_at: string
          expires_date: string
          person_induction_id: string
          sent_on: string
        }
        Insert: {
          band: string
          created_at?: string
          expires_date: string
          person_induction_id: string
          sent_on?: string
        }
        Update: {
          band?: string
          created_at?: string
          expires_date?: string
          person_induction_id?: string
          sent_on?: string
        }
        Relationships: []
      }
      person_competencies: {
        Row: {
          competency_id: string
          created_at: string
          evidence_url: string | null
          expiry_date: string | null
          id: string
          issued_date: string | null
          person_id: string
        }
        Insert: {
          competency_id: string
          created_at?: string
          evidence_url?: string | null
          expiry_date?: string | null
          id?: string
          issued_date?: string | null
          person_id: string
        }
        Update: {
          competency_id?: string
          created_at?: string
          evidence_url?: string | null
          expiry_date?: string | null
          id?: string
          issued_date?: string | null
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_competencies_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "competencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_competencies_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
        ]
      }
      person_inductions: {
        Row: {
          booked_for_date: string | null
          completed_date: string | null
          evidence_url: string | null
          expires_date: string | null
          id: string
          person_id: string
          site_id: string
          status: string
          updated_at: string
        }
        Insert: {
          booked_for_date?: string | null
          completed_date?: string | null
          evidence_url?: string | null
          expires_date?: string | null
          id?: string
          person_id: string
          site_id: string
          status: string
          updated_at?: string
        }
        Update: {
          booked_for_date?: string | null
          completed_date?: string | null
          evidence_url?: string | null
          expires_date?: string | null
          id?: string
          person_id?: string
          site_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_inductions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_inductions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
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
      plant_hire_periods: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          off_date: string | null
          on_date: string
          plant_id_code: string
          project_id: string | null
          rate_basis: string
          rate_snapshot: number | null
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          off_date?: string | null
          on_date: string
          plant_id_code: string
          project_id?: string | null
          rate_basis: string
          rate_snapshot?: number | null
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          off_date?: string | null
          on_date?: string
          plant_id_code?: string
          project_id?: string | null
          rate_basis?: string
          rate_snapshot?: number | null
          source?: string
          updated_at?: string
        }
        Relationships: []
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
          daily_rate: number | null
          description: string | null
          id: string
          plant_id_code: string
          project_id: string | null
          rate_basis: string
          tonnage_class: string | null
          weekly_rate: number | null
        }
        Insert: {
          active?: boolean | null
          cost_rate_nt?: number | null
          cost_rate_ot?: number | null
          daily_rate?: number | null
          description?: string | null
          id?: string
          plant_id_code: string
          project_id?: string | null
          rate_basis?: string
          tonnage_class?: string | null
          weekly_rate?: number | null
        }
        Update: {
          active?: boolean | null
          cost_rate_nt?: number | null
          cost_rate_ot?: number | null
          daily_rate?: number | null
          description?: string | null
          id?: string
          plant_id_code?: string
          project_id?: string | null
          rate_basis?: string
          tonnage_class?: string | null
          weekly_rate?: number | null
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
      procure_email_log: {
        Row: {
          created_at: string
          direction: string
          error_message: string | null
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string
          kind: string
          metadata: Json | null
          project_id: string | null
          recipient_email: string | null
          sender_email: string | null
          status: string
          subject: string | null
          supplier_id: string | null
        }
        Insert: {
          created_at?: string
          direction: string
          error_message?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          kind: string
          metadata?: Json | null
          project_id?: string | null
          recipient_email?: string | null
          sender_email?: string | null
          status?: string
          subject?: string | null
          supplier_id?: string | null
        }
        Update: {
          created_at?: string
          direction?: string
          error_message?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          kind?: string
          metadata?: Json | null
          project_id?: string | null
          recipient_email?: string | null
          sender_email?: string | null
          status?: string
          subject?: string | null
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procure_email_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procure_email_log_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      procure_quotes: {
        Row: {
          attachment_filenames: string[] | null
          attachment_paths: string[] | null
          body_snippet: string | null
          body_text: string | null
          created_at: string
          extracted_json: Json | null
          extracted_total: number | null
          extraction_error: string | null
          extraction_status: string
          gmail_message_id: string
          gmail_thread_id: string | null
          id: string
          received_at: string
          sender_email: string | null
          status: string
          subject: string | null
          supplier_id: string
          updated_at: string
        }
        Insert: {
          attachment_filenames?: string[] | null
          attachment_paths?: string[] | null
          body_snippet?: string | null
          body_text?: string | null
          created_at?: string
          extracted_json?: Json | null
          extracted_total?: number | null
          extraction_error?: string | null
          extraction_status?: string
          gmail_message_id: string
          gmail_thread_id?: string | null
          id?: string
          received_at?: string
          sender_email?: string | null
          status?: string
          subject?: string | null
          supplier_id: string
          updated_at?: string
        }
        Update: {
          attachment_filenames?: string[] | null
          attachment_paths?: string[] | null
          body_snippet?: string | null
          body_text?: string | null
          created_at?: string
          extracted_json?: Json | null
          extracted_total?: number | null
          extraction_error?: string | null
          extraction_status?: string
          gmail_message_id?: string
          gmail_thread_id?: string | null
          id?: string
          received_at?: string
          sender_email?: string | null
          status?: string
          subject?: string | null
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procure_quotes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
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
      site_requirements: {
        Row: {
          competency_id: string | null
          id: string
          induction_required: boolean | null
          site_id: string
        }
        Insert: {
          competency_id?: string | null
          id?: string
          induction_required?: boolean | null
          site_id: string
        }
        Update: {
          competency_id?: string | null
          id?: string
          induction_required?: boolean | null
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_requirements_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "competencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_requirements_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          active: boolean | null
          head_contractor: string | null
          head_contractor_contact: string | null
          id: string
          induction_lead_time_days: number | null
          induction_platform: string | null
          induction_url: string | null
          job_id: string | null
          name: string
        }
        Insert: {
          active?: boolean | null
          head_contractor?: string | null
          head_contractor_contact?: string | null
          id?: string
          induction_lead_time_days?: number | null
          induction_platform?: string | null
          induction_url?: string | null
          job_id?: string | null
          name: string
        }
        Update: {
          active?: boolean | null
          head_contractor?: string | null
          head_contractor_contact?: string | null
          id?: string
          induction_lead_time_days?: number | null
          induction_platform?: string | null
          induction_url?: string | null
          job_id?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "sites_job_id_fkey"
            columns: ["job_id"]
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
      suppliers: {
        Row: {
          abn: string | null
          active: boolean
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          credit_terms_days: number | null
          fleet_notes: string | null
          id: string
          name: string
          payment_terms: string | null
          updated_at: string
        }
        Insert: {
          abn?: string | null
          active?: boolean
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          credit_terms_days?: number | null
          fleet_notes?: string | null
          id?: string
          name: string
          payment_terms?: string | null
          updated_at?: string
        }
        Update: {
          abn?: string | null
          active?: boolean
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          credit_terms_days?: number | null
          fleet_notes?: string | null
          id?: string
          name?: string
          payment_terms?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      task_requirements: {
        Row: {
          competency_id: string
          id: string
          task_type: string
        }
        Insert: {
          competency_id: string
          id?: string
          task_type: string
        }
        Update: {
          competency_id?: string
          id?: string
          task_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_requirements_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "competencies"
            referencedColumns: ["id"]
          },
        ]
      }
      timesheets: {
        Row: {
          claimed_hours: number
          created_at: string
          id: string
          job_id: string | null
          person_id: string
          status: string | null
          submitted_via: string | null
          work_date: string
        }
        Insert: {
          claimed_hours: number
          created_at?: string
          id?: string
          job_id?: string | null
          person_id: string
          status?: string | null
          submitted_via?: string | null
          work_date: string
        }
        Update: {
          claimed_hours?: number
          created_at?: string
          id?: string
          job_id?: string | null
          person_id?: string
          status?: string | null
          submitted_via?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "timesheets_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          person_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          person_id?: string | null
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          person_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
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
      check_eligibility: {
        Args: {
          p_on_date: string
          p_person_id: string
          p_site_id: string
          p_task_type: string
        }
        Returns: Json
      }
      current_user_person_id: { Args: never; Returns: string }
      current_user_role: { Args: never; Returns: string }
      find_crew_by_name: {
        Args: { p_name: string }
        Returns: {
          default_supervisor_id: string
          employment_type: string
          id: string
          name: string
          role: string
          similarity: number
        }[]
      }
      get_supervisor_slack_id: {
        Args: { p_supervisor_person_id: string }
        Returns: string
      }
      insert_docket: {
        Args: {
          p_allocation_date: string
          p_captured_hours_by_person: Json
          p_job_id: string
          p_source_daily_report_id: string
        }
        Returns: string
      }
      reconcile_timesheets: {
        Args: { p_work_date: string }
        Returns: {
          claimed: number
          dockets_say: number
          job_id: string
          person_id: string
          variance: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      user_role: "admin" | "supervisor" | "crew"
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
    Enums: {
      user_role: ["admin", "supervisor", "crew"],
    },
  },
} as const
