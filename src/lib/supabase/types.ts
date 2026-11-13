export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      allowed_emails: {
        Row: {
          added_at: string
          email: string
          note: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          added_at?: string
          email: string
          note?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          added_at?: string
          email?: string
          note?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      app_sections: {
        Row: {
          group_label: string
          key: string
          label: string
          sort_order: number
        }
        Insert: {
          group_label: string
          key: string
          label: string
          sort_order?: number
        }
        Update: {
          group_label?: string
          key?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      app_state: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          actor_email: string | null
          at: string
          changes: Json
          id: number
          op: string
          row_key: string | null
          table_name: string
        }
        Insert: {
          actor_email?: string | null
          at?: string
          changes: Json
          id?: never
          op: string
          row_key?: string | null
          table_name: string
        }
        Update: {
          actor_email?: string | null
          at?: string
          changes?: Json
          id?: never
          op?: string
          row_key?: string | null
          table_name?: string
        }
        Relationships: []
      }
      business_card_events: {
        Row: {
          card_id: string
          device: string
          event: string
          id: number
          occurred_at: string
          source: string
          target: string | null
        }
        Insert: {
          card_id: string
          device?: string
          event: string
          id?: never
          occurred_at?: string
          source?: string
          target?: string | null
        }
        Update: {
          card_id?: string
          device?: string
          event?: string
          id?: never
          occurred_at?: string
          source?: string
          target?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_card_events_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "business_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      business_cards: {
        Row: {
          bio: string
          company_blurb: string
          created_at: string
          created_by_email: string
          cta_label: string
          cta_url: string
          email: string
          facebook_url: string
          full_name: string
          id: string
          instagram_url: string
          job_title: string
          linkedin_url: string
          owner_email: string
          phone: string
          phone_on_viber: boolean
          photo_url: string
          show_phone: boolean
          status: string
          token: string
          updated_at: string
          website_url: string
        }
        Insert: {
          bio?: string
          company_blurb?: string
          created_at?: string
          created_by_email?: string
          cta_label?: string
          cta_url?: string
          email?: string
          facebook_url?: string
          full_name: string
          id?: string
          instagram_url?: string
          job_title?: string
          linkedin_url?: string
          owner_email?: string
          phone?: string
          phone_on_viber?: boolean
          photo_url?: string
          show_phone?: boolean
          status?: string
          token?: string
          updated_at?: string
          website_url?: string
        }
        Update: {
          bio?: string
          company_blurb?: string
          created_at?: string
          created_by_email?: string
          cta_label?: string
          cta_url?: string
          email?: string
          facebook_url?: string
          full_name?: string
          id?: string
          instagram_url?: string
          job_title?: string
          linkedin_url?: string
          owner_email?: string
          phone?: string
          phone_on_viber?: boolean
          photo_url?: string
          show_phone?: boolean
          status?: string
          token?: string
          updated_at?: string
          website_url?: string
        }
        Relationships: []
      }
      crm_accounts: {
        Row: {
          created_at: string
          hotel_room_count_band: string | null
          hotel_star_rating: string | null
          id: string
          industry: string | null
          kind: string
          name: string
          name_key: string | null
          segment: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          hotel_room_count_band?: string | null
          hotel_star_rating?: string | null
          id?: string
          industry?: string | null
          kind?: string
          name: string
          name_key?: string | null
          segment?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          hotel_room_count_band?: string | null
          hotel_star_rating?: string | null
          id?: string
          industry?: string | null
          kind?: string
          name?: string
          name_key?: string | null
          segment?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      crm_contacts: {
        Row: {
          account_id: string | null
          created_at: string
          email: string
          email_key: string | null
          full_name: string | null
          id: string
          job_title: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          email: string
          email_key?: string | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          email?: string
          email_key?: string | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_ingest_rate: {
        Row: {
          n: number
          name: string
          window_start: string
        }
        Insert: {
          n?: number
          name: string
          window_start: string
        }
        Update: {
          n?: number
          name?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_ingest_rate_name_fkey"
            columns: ["name"]
            isOneToOne: false
            referencedRelation: "crm_ingest_secrets"
            referencedColumns: ["name"]
          },
        ]
      }
      crm_ingest_secrets: {
        Row: {
          created_at: string
          max_per_minute: number
          name: string
          secret_hash: string
        }
        Insert: {
          created_at?: string
          max_per_minute?: number
          name: string
          secret_hash: string
        }
        Update: {
          created_at?: string
          max_per_minute?: number
          name?: string
          secret_hash?: string
        }
        Relationships: []
      }
      crm_lead_activities: {
        Row: {
          author_email: string
          body: string
          created_at: string
          from_status: string | null
          id: string
          kind: string
          lead_id: string
          to_status: string | null
        }
        Insert: {
          author_email?: string
          body?: string
          created_at?: string
          from_status?: string | null
          id?: string
          kind?: string
          lead_id: string
          to_status?: string | null
        }
        Update: {
          author_email?: string
          body?: string
          created_at?: string
          from_status?: string | null
          id?: string
          kind?: string
          lead_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_leads: {
        Row: {
          account_id: string | null
          attribution: Json | null
          contact_id: string | null
          created_at: string
          deal_value: number | null
          description: string | null
          engagement: Json | null
          engagement_tier: string | null
          estimated_volume: string | null
          expected_close_on: string | null
          ga_client_id: string | null
          geo: Json | null
          id: string
          lead_type: string
          lost_reason: string | null
          next_action: string | null
          next_action_due_on: string | null
          origin_form: string
          owner_email: string | null
          pipeline_account_id: string | null
          position: number
          product_interests: string[]
          product_of_interest: string | null
          raw: Json | null
          sample_feedback_on: string | null
          sample_sent_on: string | null
          source: string | null
          status: string
          submitted_at: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          attribution?: Json | null
          contact_id?: string | null
          created_at?: string
          deal_value?: number | null
          description?: string | null
          engagement?: Json | null
          engagement_tier?: string | null
          estimated_volume?: string | null
          expected_close_on?: string | null
          ga_client_id?: string | null
          geo?: Json | null
          id?: string
          lead_type?: string
          lost_reason?: string | null
          next_action?: string | null
          next_action_due_on?: string | null
          origin_form: string
          owner_email?: string | null
          pipeline_account_id?: string | null
          position?: number
          product_interests?: string[]
          product_of_interest?: string | null
          raw?: Json | null
          sample_feedback_on?: string | null
          sample_sent_on?: string | null
          source?: string | null
          status?: string
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          attribution?: Json | null
          contact_id?: string | null
          created_at?: string
          deal_value?: number | null
          description?: string | null
          engagement?: Json | null
          engagement_tier?: string | null
          estimated_volume?: string | null
          expected_close_on?: string | null
          ga_client_id?: string | null
          geo?: Json | null
          id?: string
          lead_type?: string
          lost_reason?: string | null
          next_action?: string | null
          next_action_due_on?: string | null
          origin_form?: string
          owner_email?: string | null
          pipeline_account_id?: string | null
          position?: number
          product_interests?: string[]
          product_of_interest?: string | null
          raw?: Json | null
          sample_feedback_on?: string | null
          sample_sent_on?: string | null
          source?: string | null
          status?: string
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_owner_email_fkey"
            columns: ["owner_email"]
            isOneToOne: false
            referencedRelation: "allowed_emails"
            referencedColumns: ["email"]
          },
          {
            foreignKeyName: "crm_leads_pipeline_account_id_fkey"
            columns: ["pipeline_account_id"]
            isOneToOne: false
            referencedRelation: "pipeline_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_budgets: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          created_by_email: string
          id: string
          month_start: string
          updated_at: string
        }
        Insert: {
          amount: number
          category_id: string
          created_at?: string
          created_by_email?: string
          id?: string
          month_start: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          created_by_email?: string
          id?: string
          month_start?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "fin_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_cash_balances: {
        Row: {
          amount: number
          as_of: string
          created_at: string
          created_by_email: string
          id: string
          note: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          as_of: string
          created_at?: string
          created_by_email?: string
          id?: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          as_of?: string
          created_at?: string
          created_by_email?: string
          id?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fin_categories: {
        Row: {
          created_at: string
          created_by_email: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_email?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_email?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      fin_expenses: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          created_by_email: string
          description: string
          id: string
          reference: string | null
          spent_on: string
          updated_at: string
          vendor: string | null
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          amount: number
          category_id: string
          created_at?: string
          created_by_email?: string
          description: string
          id?: string
          reference?: string | null
          spent_on: string
          updated_at?: string
          vendor?: string | null
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          created_by_email?: string
          description?: string
          id?: string
          reference?: string | null
          spent_on?: string
          updated_at?: string
          vendor?: string | null
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "fin_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      mini_project_contributors: {
        Row: {
          added_by_email: string | null
          created_at: string
          mini_project_id: string
          user_email: string
        }
        Insert: {
          added_by_email?: string | null
          created_at?: string
          mini_project_id: string
          user_email: string
        }
        Update: {
          added_by_email?: string | null
          created_at?: string
          mini_project_id?: string
          user_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "mini_project_contributors_mini_project_id_fkey"
            columns: ["mini_project_id"]
            isOneToOne: false
            referencedRelation: "mini_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mini_projects: {
        Row: {
          created_at: string
          created_by_email: string | null
          description: string
          id: string
          name: string
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_email?: string | null
          description?: string
          id?: string
          name: string
          project_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_email?: string | null
          description?: string
          id?: string
          name?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mini_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      people_daily_logs: {
        Row: {
          created_at: string
          created_by_email: string
          hours: number
          id: string
          intern_email: string
          summary: string
          task_ids: string[]
          updated_at: string
          work_date: string
        }
        Insert: {
          created_at?: string
          created_by_email?: string
          hours: number
          id?: string
          intern_email: string
          summary: string
          task_ids?: string[]
          updated_at?: string
          work_date: string
        }
        Update: {
          created_at?: string
          created_by_email?: string
          hours?: number
          id?: string
          intern_email?: string
          summary?: string
          task_ids?: string[]
          updated_at?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_daily_logs_intern_email_fkey"
            columns: ["intern_email"]
            isOneToOne: false
            referencedRelation: "allowed_emails"
            referencedColumns: ["email"]
          },
        ]
      }
      people_interns: {
        Row: {
          created_at: string
          created_by_email: string
          discipline: string
          email: string
          ends_on: string | null
          full_name: string | null
          id: string
          is_active: boolean
          program: string | null
          required_hours: number
          school: string | null
          starts_on: string | null
          supervisor_email: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_email?: string
          discipline: string
          email: string
          ends_on?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          program?: string | null
          required_hours?: number
          school?: string | null
          starts_on?: string | null
          supervisor_email?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_email?: string
          discipline?: string
          email?: string
          ends_on?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          program?: string | null
          required_hours?: number
          school?: string | null
          starts_on?: string | null
          supervisor_email?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_interns_email_fkey"
            columns: ["email"]
            isOneToOne: false
            referencedRelation: "allowed_emails"
            referencedColumns: ["email"]
          },
          {
            foreignKeyName: "people_interns_supervisor_email_fkey"
            columns: ["supervisor_email"]
            isOneToOne: false
            referencedRelation: "allowed_emails"
            referencedColumns: ["email"]
          },
        ]
      }
      people_weekly_reports: {
        Row: {
          accomplishments: string | null
          blockers: string | null
          created_at: string
          created_by_email: string
          id: string
          intern_email: string
          learnings: string | null
          next_week_plan: string | null
          review_comment: string | null
          reviewed_at: string | null
          reviewed_by_email: string | null
          status: string
          submitted_at: string | null
          total_hours: number
          updated_at: string
          week_start: string
        }
        Insert: {
          accomplishments?: string | null
          blockers?: string | null
          created_at?: string
          created_by_email?: string
          id?: string
          intern_email: string
          learnings?: string | null
          next_week_plan?: string | null
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by_email?: string | null
          status?: string
          submitted_at?: string | null
          total_hours?: number
          updated_at?: string
          week_start: string
        }
        Update: {
          accomplishments?: string | null
          blockers?: string | null
          created_at?: string
          created_by_email?: string
          id?: string
          intern_email?: string
          learnings?: string | null
          next_week_plan?: string | null
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by_email?: string | null
          status?: string
          submitted_at?: string | null
          total_hours?: number
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_weekly_reports_intern_email_fkey"
            columns: ["intern_email"]
            isOneToOne: false
            referencedRelation: "allowed_emails"
            referencedColumns: ["email"]
          },
        ]
      }
      pipeline_accounts: {
        Row: {
          contact: string
          created_at: string
          crm_account_id: string | null
          generated_referral: boolean
          id: string
          name: string
          notes: string
          property: string
          reason: string
          referred_by: string
          segment: string
          stage: string
          updated_at: string
        }
        Insert: {
          contact?: string
          created_at?: string
          crm_account_id?: string | null
          generated_referral?: boolean
          id?: string
          name: string
          notes?: string
          property?: string
          reason?: string
          referred_by?: string
          segment?: string
          stage?: string
          updated_at?: string
        }
        Update: {
          contact?: string
          created_at?: string
          crm_account_id?: string | null
          generated_referral?: boolean
          id?: string
          name?: string
          notes?: string
          property?: string
          reason?: string
          referred_by?: string
          segment?: string
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_accounts_crm_account_id_fkey"
            columns: ["crm_account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      project_contributors: {
        Row: {
          added_by_email: string | null
          created_at: string
          project_id: string
          user_email: string
        }
        Insert: {
          added_by_email?: string | null
          created_at?: string
          project_id: string
          user_email: string
        }
        Update: {
          added_by_email?: string | null
          created_at?: string
          project_id?: string
          user_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_contributors_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          created_by_email: string | null
          description: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_email?: string | null
          description?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_email?: string | null
          description?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      role_section_defaults: {
        Row: {
          allowed: boolean
          role: Database["public"]["Enums"]["app_role"]
          section: string
        }
        Insert: {
          allowed: boolean
          role: Database["public"]["Enums"]["app_role"]
          section: string
        }
        Update: {
          allowed?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          section?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_section_defaults_section_fkey"
            columns: ["section"]
            isOneToOne: false
            referencedRelation: "app_sections"
            referencedColumns: ["key"]
          },
        ]
      }
      sales_counters: {
        Row: {
          kind: string
          last_no: number
          year: number
        }
        Insert: {
          kind: string
          last_no?: number
          year: number
        }
        Update: {
          kind?: string
          last_no?: number
          year?: number
        }
        Relationships: []
      }
      sales_order_lines: {
        Row: {
          created_at: string
          id: string
          line_total: number
          order_id: string
          position: number
          product_id: string
          product_name_snapshot: string
          qty: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total?: number
          order_id: string
          position?: number
          product_id: string
          product_name_snapshot?: string
          qty: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          order_id?: string
          position?: number
          product_id?: string
          product_name_snapshot?: string
          qty?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "sales_products"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          account_id: string
          account_name_snapshot: string
          amount_paid: number
          created_at: string
          created_by_email: string
          customer_po_no: string | null
          delivered_on: string | null
          delivery_due_on: string | null
          discount_amount: number
          id: string
          notes: string | null
          number: string
          official_invoice_date: string | null
          official_invoice_no: string | null
          oversell_override_reason: string | null
          paid_on: string | null
          quotation_id: string | null
          status: string
          subtotal: number
          tax_note: string | null
          total: number
          updated_at: string
        }
        Insert: {
          account_id: string
          account_name_snapshot?: string
          amount_paid?: number
          created_at?: string
          created_by_email?: string
          customer_po_no?: string | null
          delivered_on?: string | null
          delivery_due_on?: string | null
          discount_amount?: number
          id?: string
          notes?: string | null
          number: string
          official_invoice_date?: string | null
          official_invoice_no?: string | null
          oversell_override_reason?: string | null
          paid_on?: string | null
          quotation_id?: string | null
          status?: string
          subtotal?: number
          tax_note?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          account_name_snapshot?: string
          amount_paid?: number
          created_at?: string
          created_by_email?: string
          customer_po_no?: string | null
          delivered_on?: string | null
          delivery_due_on?: string | null
          discount_amount?: number
          id?: string
          notes?: string | null
          number?: string
          official_invoice_date?: string | null
          official_invoice_no?: string | null
          oversell_override_reason?: string | null
          paid_on?: string | null
          quotation_id?: string | null
          status?: string
          subtotal?: number
          tax_note?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "sales_quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_price_tiers: {
        Row: {
          created_at: string
          created_by_email: string
          id: string
          min_qty: number
          product_id: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_email?: string
          id?: string
          min_qty: number
          product_id: string
          unit_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_email?: string
          id?: string
          min_qty?: number
          product_id?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_price_tiers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "sales_products"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_products: {
        Row: {
          created_at: string
          created_by_email: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sku: string
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_email?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sku: string
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_email?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sku?: string
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      sales_quotation_lines: {
        Row: {
          created_at: string
          id: string
          line_total: number
          position: number
          product_id: string
          product_name_snapshot: string
          qty: number
          quotation_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total?: number
          position?: number
          product_id: string
          product_name_snapshot?: string
          qty: number
          quotation_id: string
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          position?: number
          product_id?: string
          product_name_snapshot?: string
          qty?: number
          quotation_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_quotation_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "sales_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quotation_lines_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "sales_quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_quotations: {
        Row: {
          account_id: string
          account_name_snapshot: string
          contact_name: string | null
          created_at: string
          created_by_email: string
          decided_at: string | null
          delivery_terms: string | null
          discount_amount: number
          id: string
          lead_id: string | null
          lead_time_days: number | null
          notes: string | null
          number: string
          payment_terms: string | null
          sent_at: string | null
          status: string
          subtotal: number
          supersedes_id: string | null
          tax_note: string | null
          total: number
          updated_at: string
          valid_until: string | null
          version: number
        }
        Insert: {
          account_id: string
          account_name_snapshot?: string
          contact_name?: string | null
          created_at?: string
          created_by_email?: string
          decided_at?: string | null
          delivery_terms?: string | null
          discount_amount?: number
          id?: string
          lead_id?: string | null
          lead_time_days?: number | null
          notes?: string | null
          number: string
          payment_terms?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          supersedes_id?: string | null
          tax_note?: string | null
          total?: number
          updated_at?: string
          valid_until?: string | null
          version?: number
        }
        Update: {
          account_id?: string
          account_name_snapshot?: string
          contact_name?: string | null
          created_at?: string
          created_by_email?: string
          decided_at?: string | null
          delivery_terms?: string | null
          discount_amount?: number
          id?: string
          lead_id?: string | null
          lead_time_days?: number | null
          notes?: string | null
          number?: string
          payment_terms?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          supersedes_id?: string | null
          tax_note?: string | null
          total?: number
          updated_at?: string
          valid_until?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_quotations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quotations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quotations_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "sales_quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_calculations: {
        Row: {
          calculator_id: string
          created_at: string
          created_by: string | null
          created_by_email: string | null
          id: string
          inputs: Json
          label: string
          outputs: Json
        }
        Insert: {
          calculator_id: string
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          id?: string
          inputs: Json
          label?: string
          outputs: Json
        }
        Update: {
          calculator_id?: string
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          id?: string
          inputs?: Json
          label?: string
          outputs?: Json
        }
        Relationships: []
      }
      stock_adjustments: {
        Row: {
          created_at: string
          created_by_email: string
          delta: number
          id: string
          note: string | null
          product_id: string
          reason: string
          sales_order_id: string | null
        }
        Insert: {
          created_at?: string
          created_by_email?: string
          delta: number
          id?: string
          note?: string | null
          product_id: string
          reason: string
          sales_order_id?: string | null
        }
        Update: {
          created_at?: string
          created_by_email?: string
          delta?: number
          id?: string
          note?: string | null
          product_id?: string
          reason?: string
          sales_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "sales_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_levels: {
        Row: {
          on_hand: number
          product_id: string
          reserved: number
          updated_at: string
        }
        Insert: {
          on_hand?: number
          product_id: string
          reserved?: number
          updated_at?: string
        }
        Update: {
          on_hand?: number
          product_id?: string
          reserved?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_levels_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "sales_products"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_worksheets: {
        Row: {
          created_at: string
          created_by_email: string
          data: Json
          id: string
          kind: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_email?: string
          data?: Json
          id?: string
          kind: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_email?: string
          data?: Json
          id?: string
          kind?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      task_comments: {
        Row: {
          author_email: string
          body: string
          created_at: string
          id: string
          task_id: string
        }
        Insert: {
          author_email?: string
          body: string
          created_at?: string
          id?: string
          task_id: string
        }
        Update: {
          author_email?: string
          body?: string
          created_at?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_email: string | null
          created_at: string
          created_by_email: string
          description: string
          due_date: string | null
          id: string
          mini_project_id: string
          position: number
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_email?: string | null
          created_at?: string
          created_by_email?: string
          description?: string
          due_date?: string | null
          id?: string
          mini_project_id: string
          position?: number
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_email?: string | null
          created_at?: string
          created_by_email?: string
          description?: string
          due_date?: string | null
          id?: string
          mini_project_id?: string
          position?: number
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_mini_project_id_fkey"
            columns: ["mini_project_id"]
            isOneToOne: false
            referencedRelation: "mini_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_section_overrides: {
        Row: {
          allowed: boolean
          email: string
          section: string
          updated_at: string
          updated_by_email: string | null
        }
        Insert: {
          allowed: boolean
          email: string
          section: string
          updated_at?: string
          updated_by_email?: string | null
        }
        Update: {
          allowed?: boolean
          email?: string
          section?: string
          updated_at?: string
          updated_by_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_section_overrides_email_fkey"
            columns: ["email"]
            isOneToOne: false
            referencedRelation: "allowed_emails"
            referencedColumns: ["email"]
          },
          {
            foreignKeyName: "user_section_overrides_section_fkey"
            columns: ["section"]
            isOneToOne: false
            referencedRelation: "app_sections"
            referencedColumns: ["key"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_add_allowed_email: {
        Args: {
          p_email: string
          p_note?: string
          p_role?: Database["public"]["Enums"]["app_role"]
        }
        Returns: undefined
      }
      admin_card_event_rollup: { Args: { p_days?: number }; Returns: Json }
      admin_delete_lead: { Args: { p_lead_id: string }; Returns: Json }
      admin_get_section_access: { Args: never; Returns: Json }
      admin_list_allowed_emails: {
        Args: never
        Returns: {
          added_at: string
          email: string
          note: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      admin_remove_allowed_email: {
        Args: { p_email: string }
        Returns: undefined
      }
      admin_rotate_card_token: { Args: { p_card_id: string }; Returns: string }
      admin_set_allowed_role: {
        Args: {
          p_email: string
          p_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: undefined
      }
      admin_set_role_section_default: {
        Args: {
          p_allowed: boolean
          p_role: Database["public"]["Enums"]["app_role"]
          p_section: string
        }
        Returns: undefined
      }
      admin_set_user_section: {
        Args: { p_allowed: boolean; p_email: string; p_section: string }
        Returns: undefined
      }
      app_state_section: { Args: { p_key: string }; Returns: string }
      ct_equal: { Args: { a: string; b: string }; Returns: boolean }
      current_user_access: { Args: never; Returns: Json }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      generate_card_token: { Args: never; Returns: string }
      get_public_card: {
        Args: { p_token: string }
        Returns: {
          bio: string
          company_blurb: string
          cta_label: string
          cta_url: string
          email: string
          facebook_url: string
          full_name: string
          instagram_url: string
          job_title: string
          linkedin_url: string
          phone: string
          phone_on_viber: boolean
          photo_url: string
          token: string
          website_url: string
        }[]
      }
      has_app_state_access: { Args: { p_key: string }; Returns: boolean }
      has_mini_project_access: {
        Args: { p_mini_project_id: string }
        Returns: boolean
      }
      has_project_access: { Args: { p_project_id: string }; Returns: boolean }
      has_section: { Args: { p_section: string }; Returns: boolean }
      ingest_form_submission: {
        Args: { p_payload: Json; p_secret: string }
        Returns: Json
      }
      list_team_directory: {
        Args: never
        Returns: {
          email: string
          note: string
        }[]
      }
      people_can_see_intern: { Args: { p_email: string }; Returns: boolean }
      people_week_hours: {
        Args: { p_email: string; p_week: string }
        Returns: number
      }
      people_week_start: { Args: { p_day: string }; Returns: string }
      record_card_event: {
        Args: {
          p_device?: string
          p_event: string
          p_source?: string
          p_target?: string
          p_token: string
        }
        Returns: undefined
      }
      sales_create_order: {
        Args: {
          p_customer_po_no?: string
          p_delivery_due_on?: string
          p_override_reason?: string
          p_quotation_id: string
        }
        Returns: string
      }
      sales_next_number: { Args: { p_kind: string }; Returns: string }
      sales_revise_quotation: { Args: { p_id: string }; Returns: string }
      stock_adjust: {
        Args: {
          p_delta: number
          p_note?: string
          p_product_id: string
          p_reason: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "super_admin" | "member" | "contractor"
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
      app_role: ["super_admin", "member", "contractor"],
    },
  },
} as const

