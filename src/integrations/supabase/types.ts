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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          summary: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          summary: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          summary?: string
          user_id?: string | null
        }
        Relationships: []
      }
      boq_coverage: {
        Row: {
          approved_count: number
          category: Database["public"]["Enums"]["boq_category"]
          created_at: string
          id: string
          item_count: number
          project_id: string
          status: Database["public"]["Enums"]["boq_coverage_status"]
          updated_at: string
        }
        Insert: {
          approved_count?: number
          category: Database["public"]["Enums"]["boq_category"]
          created_at?: string
          id?: string
          item_count?: number
          project_id: string
          status?: Database["public"]["Enums"]["boq_coverage_status"]
          updated_at?: string
        }
        Update: {
          approved_count?: number
          category?: Database["public"]["Enums"]["boq_category"]
          created_at?: string
          id?: string
          item_count?: number
          project_id?: string
          status?: Database["public"]["Enums"]["boq_coverage_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "boq_coverage_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_boards: {
        Row: {
          created_at: string
          id: string
          items: Json | null
          name: string
          owner_id: string
          pdf_url: string | null
          project_id: string
          room_filter: string[] | null
          signed_at: string | null
          signed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          items?: Json | null
          name?: string
          owner_id: string
          pdf_url?: string | null
          project_id: string
          room_filter?: string[] | null
          signed_at?: string | null
          signed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          items?: Json | null
          name?: string
          owner_id?: string
          pdf_url?: string | null
          project_id?: string
          room_filter?: string[] | null
          signed_at?: string | null
          signed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_boards_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          company_address: string | null
          company_name: string
          created_at: string
          email: string | null
          id: string
          logo_url: string | null
          organization_id: string
          phone: string | null
          updated_at: string
          vat_number: string | null
          website: string | null
        }
        Insert: {
          company_address?: string | null
          company_name?: string
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          organization_id: string
          phone?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Update: {
          company_address?: string | null
          company_name?: string
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          organization_id?: string
          phone?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_categories: {
        Row: {
          code: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string
          sort_order: number | null
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id?: string
          sort_order?: number | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_messages: {
        Row: {
          attachment_name: string | null
          attachment_url: string | null
          body: string
          created_at: string
          id: string
          item_id: string | null
          project_id: string | null
          read_at: string | null
          recipient_id: string
          sender_id: string
          subject: string | null
        }
        Insert: {
          attachment_name?: string | null
          attachment_url?: string | null
          body: string
          created_at?: string
          id?: string
          item_id?: string | null
          project_id?: string | null
          read_at?: string | null
          recipient_id: string
          sender_id: string
          subject?: string | null
        }
        Update: {
          attachment_name?: string | null
          attachment_url?: string | null
          body?: string
          created_at?: string
          id?: string
          item_id?: string | null
          project_id?: string | null
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "direct_messages_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "project_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_messages_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "project_items_secure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_codes: {
        Row: {
          amount_off: number | null
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          max_redemptions: number | null
          percent_off: number | null
          scope_org_id: string | null
          scope_tier: Database["public"]["Enums"]["subscription_tier"] | null
          total_redemptions: number
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          amount_off?: number | null
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          max_redemptions?: number | null
          percent_off?: number | null
          scope_org_id?: string | null
          scope_tier?: Database["public"]["Enums"]["subscription_tier"] | null
          total_redemptions?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          amount_off?: number | null
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          max_redemptions?: number | null
          percent_off?: number | null
          scope_org_id?: string | null
          scope_tier?: Database["public"]["Enums"]["subscription_tier"] | null
          total_redemptions?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      discount_redemptions: {
        Row: {
          discount_code_id: string
          id: string
          organization_id: string
          redeemed_at: string
          redeemed_by: string | null
        }
        Insert: {
          discount_code_id: string
          id?: string
          organization_id: string
          redeemed_at?: string
          redeemed_by?: string | null
        }
        Update: {
          discount_code_id?: string
          id?: string
          organization_id?: string
          redeemed_at?: string
          redeemed_by?: string | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      item_costs: {
        Row: {
          amount: number | null
          cost_category_id: string
          created_at: string | null
          id: string
          notes: string | null
          project_item_id: string
          updated_at: string | null
        }
        Insert: {
          amount?: number | null
          cost_category_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          project_item_id: string
          updated_at?: string | null
        }
        Update: {
          amount?: number | null
          cost_category_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          project_item_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_costs_cost_category_id_fkey"
            columns: ["cost_category_id"]
            isOneToOne: false
            referencedRelation: "cost_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_costs_project_item_id_fkey"
            columns: ["project_item_id"]
            isOneToOne: false
            referencedRelation: "project_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_costs_project_item_id_fkey"
            columns: ["project_item_id"]
            isOneToOne: false
            referencedRelation: "project_items_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      item_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          project_item_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          project_item_id: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          project_item_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_messages_project_item_id_fkey"
            columns: ["project_item_id"]
            isOneToOne: false
            referencedRelation: "project_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_messages_project_item_id_fkey"
            columns: ["project_item_id"]
            isOneToOne: false
            referencedRelation: "project_items_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      item_quotations: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          lead_time_days: number | null
          notes: string | null
          project_item_id: string
          status: string
          supplier: string
          total_price: number | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          lead_time_days?: number | null
          notes?: string | null
          project_item_id: string
          status?: string
          supplier: string
          total_price?: number | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          lead_time_days?: number | null
          notes?: string | null
          project_item_id?: string
          status?: string
          supplier?: string
          total_price?: number | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_quotations_project_item_id_fkey"
            columns: ["project_item_id"]
            isOneToOne: false
            referencedRelation: "project_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_quotations_project_item_id_fkey"
            columns: ["project_item_id"]
            isOneToOne: false
            referencedRelation: "project_items_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      item_revisions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          reason: string | null
          revision_number: number
          snapshot: Json | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          reason?: string | null
          revision_number?: number
          snapshot?: Json | null
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          reason?: string | null
          revision_number?: number
          snapshot?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_revisions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "project_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_revisions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "project_items_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      lifecycle_transition_roles: {
        Row: {
          from_status: string
          roles: Database["public"]["Enums"]["app_role"][]
          to_status: string
        }
        Insert: {
          from_status: string
          roles: Database["public"]["Enums"]["app_role"][]
          to_status: string
        }
        Update: {
          from_status?: string
          roles?: Database["public"]["Enums"]["app_role"][]
          to_status?: string
        }
        Relationships: []
      }
      master_floors: {
        Row: {
          code: string
          created_at: string | null
          id: string
          name: string
          organization_id: string
          sort_order: number | null
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          name: string
          organization_id?: string
          sort_order?: number | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          name?: string
          organization_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "master_floors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      master_item_types: {
        Row: {
          allowed_categories: string[] | null
          code: string
          created_at: string | null
          id: string
          name: string
          organization_id: string
          sort_order: number | null
        }
        Insert: {
          allowed_categories?: string[] | null
          code: string
          created_at?: string | null
          id?: string
          name: string
          organization_id?: string
          sort_order?: number | null
        }
        Update: {
          allowed_categories?: string[] | null
          code?: string
          created_at?: string | null
          id?: string
          name?: string
          organization_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "master_item_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      master_rooms: {
        Row: {
          code: string
          created_at: string | null
          id: string
          name: string
          organization_id: string
          sort_order: number | null
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          name: string
          organization_id?: string
          sort_order?: number | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          name?: string
          organization_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "master_rooms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      master_subcategories: {
        Row: {
          code: string
          created_at: string | null
          id: string
          item_type_id: string | null
          name: string
          organization_id: string
          sort_order: number | null
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          item_type_id?: string | null
          name: string
          organization_id?: string
          sort_order?: number | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          item_type_id?: string | null
          name?: string
          organization_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "master_subcategories_item_type_id_fkey"
            columns: ["item_type_id"]
            isOneToOne: false
            referencedRelation: "master_item_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_subcategories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          item_id: string | null
          project_id: string | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          project_id?: string | null
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          project_id?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      organization_domain_audit: {
        Row: {
          created_at: string
          email: string
          foreign_domain: string
          id: string
          organization_id: string
          primary_domain: string | null
          source: string
        }
        Insert: {
          created_at?: string
          email: string
          foreign_domain: string
          id?: string
          organization_id: string
          primary_domain?: string | null
          source?: string
        }
        Update: {
          created_at?: string
          email?: string
          foreign_domain?: string
          id?: string
          organization_id?: string
          primary_domain?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_domain_audit_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_domains: {
        Row: {
          created_at: string
          domain: string
          id: string
          last_checked_at: string | null
          last_error: string | null
          organization_id: string
          status: string
          updated_at: string
          verification_token: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          organization_id: string
          status?: string
          updated_at?: string
          verification_token: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          organization_id?: string
          status?: string
          updated_at?: string
          verification_token?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_domains_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          base_role: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          is_owner: boolean
          organization_id: string
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          base_role?: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          is_owner?: boolean
          organization_id: string
          status?: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          base_role?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          is_owner?: boolean
          organization_id?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          id: string
          is_owner: boolean
          joined_at: string
          organization_id: string
          user_id: string
        }
        Insert: {
          id?: string
          is_owner?: boolean
          joined_at?: string
          organization_id: string
          user_id: string
        }
        Update: {
          id?: string
          is_owner?: boolean
          joined_at?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_role_labels: {
        Row: {
          base_role: string
          created_at: string
          custom_label: string
          id: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          base_role: string
          created_at?: string
          custom_label: string
          id?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          base_role?: string
          created_at?: string
          custom_label?: string
          id?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_role_labels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_subscriptions: {
        Row: {
          created_at: string
          current_period_end: string
          grace_until: string | null
          id: string
          notes: string | null
          organization_id: string
          purge_at: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          suspend_at: string | null
          tier: Database["public"]["Enums"]["subscription_tier"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end: string
          grace_until?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          purge_at?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          suspend_at?: string | null
          tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string
          grace_until?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          purge_at?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          suspend_at?: string | null
          tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          branding: Json
          contact_email: string | null
          contact_name: string | null
          created_at: string
          custom_domain: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          branding?: Json
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          custom_domain?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          branding?: Json
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          custom_domain?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          created_by: string | null
          grade: Database["public"]["Enums"]["platform_admin_grade"]
          id: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          grade?: Database["public"]["Enums"]["platform_admin_grade"]
          id?: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          grade?: Database["public"]["Enums"]["platform_admin_grade"]
          id?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_impersonation_log: {
        Row: {
          actor_grade: Database["public"]["Enums"]["platform_admin_grade"]
          actor_user_id: string
          ended_at: string | null
          id: string
          reason: string | null
          started_at: string
          target_organization_id: string
          target_user_id: string | null
        }
        Insert: {
          actor_grade: Database["public"]["Enums"]["platform_admin_grade"]
          actor_user_id: string
          ended_at?: string | null
          id?: string
          reason?: string | null
          started_at?: string
          target_organization_id: string
          target_user_id?: string | null
        }
        Update: {
          actor_grade?: Database["public"]["Enums"]["platform_admin_grade"]
          actor_user_id?: string
          ended_at?: string | null
          id?: string
          reason?: string | null
          started_at?: string
          target_organization_id?: string
          target_user_id?: string | null
        }
        Relationships: []
      }
      presentations: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          pages_data: Json
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          owner_id: string
          pages_data?: Json
          project_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          pages_data?: Json
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "presentations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      project_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          function_role: Database["public"]["Enums"]["app_role"]
          id: string
          notes: string | null
          project_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          function_role: Database["public"]["Enums"]["app_role"]
          id?: string
          notes?: string | null
          project_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          function_role?: Database["public"]["Enums"]["app_role"]
          id?: string
          notes?: string | null
          project_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_items: {
        Row: {
          apartment_number: string | null
          approval_checklist: Json | null
          approval_status: Database["public"]["Enums"]["approval_status"]
          area: string
          boq_included: boolean
          boxing_cost: number | null
          budget_estimate: number | null
          budget_unit_cost: number | null
          category: Database["public"]["Enums"]["boq_category"]
          company_product_url: string | null
          created_at: string
          created_by: string | null
          custom_cost: number | null
          delivery_cost: number | null
          delivery_date: string | null
          description: string
          dimensions: string | null
          duty_cost: number | null
          dynamic_finishes: Json | null
          extra_safe_cost: number | null
          finish_color: string | null
          finish_material: string | null
          finish_notes: string | null
          floor_id: string | null
          id: string
          image_3d_ref: string | null
          installation_cost: number | null
          installation_start_date: string | null
          installed: boolean
          installed_date: string | null
          insurance_cost: number | null
          is_active: boolean | null
          is_selected_option: boolean | null
          item_code: string | null
          item_type_id: string | null
          lifecycle_status:
            | Database["public"]["Enums"]["item_lifecycle_status"]
            | null
          locked_fields: string[] | null
          margin_percentage: number | null
          notes: string | null
          parent_item_id: string | null
          po_number: string | null
          production_due_date: string | null
          production_time: string | null
          proforma_url: string | null
          project_id: string
          purchase_order_ref: string | null
          purchased: boolean
          quantity: number | null
          quotation_ref: string | null
          received: boolean
          received_date: string | null
          reference_image_url: string | null
          revision_number: number | null
          room_id: string | null
          room_number: string | null
          selling_price: number | null
          sequence_number: number | null
          shifting_cost: number | null
          site_movement_date: string | null
          subcategory_id: string | null
          supplier: string | null
          technical_drawing_url: string | null
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          apartment_number?: string | null
          approval_checklist?: Json | null
          approval_status?: Database["public"]["Enums"]["approval_status"]
          area: string
          boq_included?: boolean
          boxing_cost?: number | null
          budget_estimate?: number | null
          budget_unit_cost?: number | null
          category: Database["public"]["Enums"]["boq_category"]
          company_product_url?: string | null
          created_at?: string
          created_by?: string | null
          custom_cost?: number | null
          delivery_cost?: number | null
          delivery_date?: string | null
          description: string
          dimensions?: string | null
          duty_cost?: number | null
          dynamic_finishes?: Json | null
          extra_safe_cost?: number | null
          finish_color?: string | null
          finish_material?: string | null
          finish_notes?: string | null
          floor_id?: string | null
          id?: string
          image_3d_ref?: string | null
          installation_cost?: number | null
          installation_start_date?: string | null
          installed?: boolean
          installed_date?: string | null
          insurance_cost?: number | null
          is_active?: boolean | null
          is_selected_option?: boolean | null
          item_code?: string | null
          item_type_id?: string | null
          lifecycle_status?:
            | Database["public"]["Enums"]["item_lifecycle_status"]
            | null
          locked_fields?: string[] | null
          margin_percentage?: number | null
          notes?: string | null
          parent_item_id?: string | null
          po_number?: string | null
          production_due_date?: string | null
          production_time?: string | null
          proforma_url?: string | null
          project_id: string
          purchase_order_ref?: string | null
          purchased?: boolean
          quantity?: number | null
          quotation_ref?: string | null
          received?: boolean
          received_date?: string | null
          reference_image_url?: string | null
          revision_number?: number | null
          room_id?: string | null
          room_number?: string | null
          selling_price?: number | null
          sequence_number?: number | null
          shifting_cost?: number | null
          site_movement_date?: string | null
          subcategory_id?: string | null
          supplier?: string | null
          technical_drawing_url?: string | null
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          apartment_number?: string | null
          approval_checklist?: Json | null
          approval_status?: Database["public"]["Enums"]["approval_status"]
          area?: string
          boq_included?: boolean
          boxing_cost?: number | null
          budget_estimate?: number | null
          budget_unit_cost?: number | null
          category?: Database["public"]["Enums"]["boq_category"]
          company_product_url?: string | null
          created_at?: string
          created_by?: string | null
          custom_cost?: number | null
          delivery_cost?: number | null
          delivery_date?: string | null
          description?: string
          dimensions?: string | null
          duty_cost?: number | null
          dynamic_finishes?: Json | null
          extra_safe_cost?: number | null
          finish_color?: string | null
          finish_material?: string | null
          finish_notes?: string | null
          floor_id?: string | null
          id?: string
          image_3d_ref?: string | null
          installation_cost?: number | null
          installation_start_date?: string | null
          installed?: boolean
          installed_date?: string | null
          insurance_cost?: number | null
          is_active?: boolean | null
          is_selected_option?: boolean | null
          item_code?: string | null
          item_type_id?: string | null
          lifecycle_status?:
            | Database["public"]["Enums"]["item_lifecycle_status"]
            | null
          locked_fields?: string[] | null
          margin_percentage?: number | null
          notes?: string | null
          parent_item_id?: string | null
          po_number?: string | null
          production_due_date?: string | null
          production_time?: string | null
          proforma_url?: string | null
          project_id?: string
          purchase_order_ref?: string | null
          purchased?: boolean
          quantity?: number | null
          quotation_ref?: string | null
          received?: boolean
          received_date?: string | null
          reference_image_url?: string | null
          revision_number?: number | null
          room_id?: string | null
          room_number?: string | null
          selling_price?: number | null
          sequence_number?: number | null
          shifting_cost?: number | null
          site_movement_date?: string | null
          subcategory_id?: string | null
          supplier?: string | null
          technical_drawing_url?: string | null
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_items_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "master_floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_item_type_id_fkey"
            columns: ["item_type_id"]
            isOneToOne: false
            referencedRelation: "master_item_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "project_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "project_items_secure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "master_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "master_subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string | null
          id: string
          project_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          project_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          project_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_milestones: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string
          macro_area: string | null
          project_id: string
          required_status: string
          target_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          macro_area?: string | null
          project_id: string
          required_status: string
          target_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          macro_area?: string | null
          project_id?: string
          required_status?: string
          target_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_reopen_log: {
        Row: {
          id: string
          organization_id: string
          project_id: string
          reopened_at: string
          reopened_by: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          project_id: string
          reopened_at?: string
          reopened_by?: string | null
        }
        Update: {
          id?: string
          organization_id?: string
          project_id?: string
          reopened_at?: string
          reopened_by?: string | null
        }
        Relationships: []
      }
      project_tasks: {
        Row: {
          assignee_id: string | null
          completion_fields: string[] | null
          created_at: string
          depends_on: string | null
          description: string | null
          end_date: string | null
          id: string
          linked_item_id: string | null
          macro_area: Database["public"]["Enums"]["task_macro_area"]
          project_id: string
          sort_order: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          completion_fields?: string[] | null
          created_at?: string
          depends_on?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          linked_item_id?: string | null
          macro_area?: Database["public"]["Enums"]["task_macro_area"]
          project_id: string
          sort_order?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          completion_fields?: string[] | null
          created_at?: string
          depends_on?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          linked_item_id?: string | null
          macro_area?: Database["public"]["Enums"]["task_macro_area"]
          project_id?: string
          sort_order?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_depends_on_fkey"
            columns: ["depends_on"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_linked_item_id_fkey"
            columns: ["linked_item_id"]
            isOneToOne: false
            referencedRelation: "project_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_linked_item_id_fkey"
            columns: ["linked_item_id"]
            isOneToOne: false
            referencedRelation: "project_items_secure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          boq_master_ref: string | null
          boq_version: string | null
          client: string
          code: string
          created_at: string
          id: string
          last_update_date: string | null
          location: string | null
          name: string
          organization_id: string | null
          owner_id: string
          project_manager: string | null
          start_date: string
          target_completion_date: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          boq_master_ref?: string | null
          boq_version?: string | null
          client: string
          code: string
          created_at?: string
          id?: string
          last_update_date?: string | null
          location?: string | null
          name: string
          organization_id?: string | null
          owner_id: string
          project_manager?: string | null
          start_date: string
          target_completion_date: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          boq_master_ref?: string | null
          boq_version?: string | null
          client?: string
          code?: string
          created_at?: string
          id?: string
          last_update_date?: string | null
          location?: string | null
          name?: string
          organization_id?: string | null
          owner_id?: string
          project_manager?: string | null
          start_date?: string
          target_completion_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          organization_id: string
          total_redemptions: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id: string
          total_redemptions?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          total_redemptions?: number
          updated_at?: string
        }
        Relationships: []
      }
      referral_redemptions: {
        Row: {
          id: string
          redeemed_at: string
          redeemed_by: string | null
          referral_code_id: string
          referred_org_id: string
        }
        Insert: {
          id?: string
          redeemed_at?: string
          redeemed_by?: string | null
          referral_code_id: string
          referred_org_id: string
        }
        Update: {
          id?: string
          redeemed_at?: string
          redeemed_by?: string | null
          referral_code_id?: string
          referred_org_id?: string
        }
        Relationships: []
      }
      security_flags: {
        Row: {
          created_at: string
          details: Json
          flag_type: string
          id: string
          organization_id: string | null
          review_needed: boolean
          reviewed_at: string | null
          reviewed_by: string | null
          triggers: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json
          flag_type: string
          id?: string
          organization_id?: string | null
          review_needed?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          triggers?: string[]
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json
          flag_type?: string
          id?: string
          organization_id?: string | null
          review_needed?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          triggers?: string[]
          user_id?: string
        }
        Relationships: []
      }
      sso_redeem_failures: {
        Row: {
          created_at: string
          id: string
          ip: string | null
          reason: string
          token_hash: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip?: string | null
          reason: string
          token_hash?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip?: string | null
          reason?: string
          token_hash?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      sso_tickets: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          organization_id: string
          token_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          organization_id: string
          token_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          organization_id?: string
          token_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      supplier_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          supplier_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          supplier_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_comments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payments: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          is_paid: boolean | null
          notes: string | null
          paid_date: string | null
          payment_date: string | null
          payment_number: number | null
          payment_scheme: Database["public"]["Enums"]["payment_scheme"] | null
          project_item_id: string
          supplier: string
          total_payments: number | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          is_paid?: boolean | null
          notes?: string | null
          paid_date?: string | null
          payment_date?: string | null
          payment_number?: number | null
          payment_scheme?: Database["public"]["Enums"]["payment_scheme"] | null
          project_item_id: string
          supplier: string
          total_payments?: number | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          is_paid?: boolean | null
          notes?: string | null
          paid_date?: string | null
          payment_date?: string | null
          payment_number?: number | null
          payment_scheme?: Database["public"]["Enums"]["payment_scheme"] | null
          project_item_id?: string
          supplier?: string
          total_payments?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_project_item_id_fkey"
            columns: ["project_item_id"]
            isOneToOne: false
            referencedRelation: "project_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_project_item_id_fkey"
            columns: ["project_item_id"]
            isOneToOne: false
            referencedRelation: "project_items_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          categories: string[]
          city: string | null
          contact_person: string | null
          country: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          rating: number
          updated_at: string
        }
        Insert: {
          categories?: string[]
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          rating?: number
          updated_at?: string
        }
        Update: {
          categories?: string[]
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          rating?: number
          updated_at?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tier_limits: {
        Row: {
          max_active_projects: number | null
          max_addons: number | null
          max_boq_items_per_project: number | null
          max_seats: number | null
          max_storage_bytes: number | null
          max_users_per_role: number | null
          tier: Database["public"]["Enums"]["subscription_tier"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          max_active_projects?: number | null
          max_addons?: number | null
          max_boq_items_per_project?: number | null
          max_seats?: number | null
          max_storage_bytes?: number | null
          max_users_per_role?: number | null
          tier: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          max_active_projects?: number | null
          max_addons?: number | null
          max_boq_items_per_project?: number | null
          max_seats?: number | null
          max_storage_bytes?: number | null
          max_users_per_role?: number | null
          tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      user_login_sessions: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          id: string
          ip: string | null
          last_seen_at: string
          revoke_reason: string | null
          revoked_at: string | null
          session_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          last_seen_at?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          last_seen_at?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      project_items_secure: {
        Row: {
          apartment_number: string | null
          approval_checklist: Json | null
          approval_status: Database["public"]["Enums"]["approval_status"] | null
          area: string | null
          boq_included: boolean | null
          boxing_cost: number | null
          budget_estimate: number | null
          budget_unit_cost: number | null
          category: Database["public"]["Enums"]["boq_category"] | null
          company_product_url: string | null
          created_at: string | null
          created_by: string | null
          custom_cost: number | null
          delivery_cost: number | null
          delivery_date: string | null
          description: string | null
          dimensions: string | null
          duty_cost: number | null
          dynamic_finishes: Json | null
          extra_safe_cost: number | null
          finish_color: string | null
          finish_material: string | null
          finish_notes: string | null
          floor_id: string | null
          id: string | null
          image_3d_ref: string | null
          installation_cost: number | null
          installation_start_date: string | null
          installed: boolean | null
          installed_date: string | null
          insurance_cost: number | null
          is_active: boolean | null
          is_selected_option: boolean | null
          item_code: string | null
          item_type_id: string | null
          lifecycle_status:
            | Database["public"]["Enums"]["item_lifecycle_status"]
            | null
          locked_fields: string[] | null
          margin_percentage: number | null
          notes: string | null
          parent_item_id: string | null
          po_number: string | null
          production_due_date: string | null
          production_time: string | null
          proforma_url: string | null
          project_id: string | null
          purchase_order_ref: string | null
          purchased: boolean | null
          quantity: number | null
          quotation_ref: string | null
          received: boolean | null
          received_date: string | null
          reference_image_url: string | null
          revision_number: number | null
          room_id: string | null
          room_number: string | null
          selling_price: number | null
          sequence_number: number | null
          shifting_cost: number | null
          site_movement_date: string | null
          subcategory_id: string | null
          supplier: string | null
          technical_drawing_url: string | null
          unit_cost: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_items_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "master_floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_item_type_id_fkey"
            columns: ["item_type_id"]
            isOneToOne: false
            referencedRelation: "master_item_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "project_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "project_items_secure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "master_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "master_subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_org_invite: { Args: { p_token: string }; Returns: Json }
      admin_get_org: {
        Args: { p_org: string }
        Returns: {
          id: string
          name: string
          slug: string
          status: string
          tier: string
        }[]
      }
      admin_global_metrics: { Args: never; Returns: Json }
      admin_list_all_orgs: {
        Args: never
        Returns: {
          active_projects: number
          created_at: string
          current_period_end: string
          name: string
          organization_id: string
          owner_email: string
          owner_user_id: string
          project_limit: number
          slug: string
          status: string
          tier: string
        }[]
      }
      admin_set_org_status: {
        Args: { p_org: string; p_status: string }
        Returns: undefined
      }
      admin_set_org_tier: {
        Args: { p_org: string; p_tier: string }
        Returns: undefined
      }
      apply_referral: {
        Args: { p_code: string; p_org: string }
        Returns: boolean
      }
      can_access_project_file: { Args: { p_name: string }; Returns: boolean }
      can_see_costs: { Args: never; Returns: boolean }
      close_login_sessions: { Args: { p_reason?: string }; Returns: undefined }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      directory_profiles: {
        Args: { p_ids?: string[] }
        Returns: {
          avatar_url: string
          display_name: string
          email: string
          id: string
        }[]
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      gen_referral_slug: { Args: never; Returns: string }
      get_my_org_subscription_summary: {
        Args: never
        Returns: {
          current_period_end: string
          organization_id: string
          organization_name: string
          project_limit: number
          projects_used: number
          status: Database["public"]["Enums"]["subscription_status"]
          storage_limit_bytes: number
          tier: Database["public"]["Enums"]["subscription_tier"]
        }[]
      }
      get_my_organizations: {
        Args: never
        Returns: {
          is_owner: boolean
          name: string
          organization_id: string
          slug: string
          status: string
          tier: string
        }[]
      }
      get_org_active_project_count: {
        Args: { _org_id: string }
        Returns: number
      }
      get_org_effective_tier: {
        Args: { _org_id: string }
        Returns: Database["public"]["Enums"]["subscription_tier"]
      }
      get_org_role_labels: {
        Args: { p_org: string }
        Returns: {
          base_role: string
          label: string
        }[]
      }
      get_org_subscription_status: {
        Args: { p_org: string }
        Returns: Database["public"]["Enums"]["subscription_status"]
      }
      get_role_label: {
        Args: { p_org: string; p_role: Database["public"]["Enums"]["app_role"] }
        Returns: string
      }
      get_tier_limits: {
        Args: { p_org: string }
        Returns: {
          max_active_projects: number | null
          max_addons: number | null
          max_boq_items_per_project: number | null
          max_seats: number | null
          max_storage_bytes: number | null
          max_users_per_role: number | null
          tier: Database["public"]["Enums"]["subscription_tier"]
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tier_limits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_user_org: { Args: never; Returns: string }
      has_org_role: {
        Args: {
          _org: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_project_function_role: {
        Args: {
          p_project: string
          p_roles: Database["public"]["Enums"]["app_role"][]
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      impersonating_org: { Args: never; Returns: string }
      is_admin_in_shared_org: { Args: { _target: string }; Returns: boolean }
      is_item_project_owner: { Args: { p_item_id: string }; Returns: boolean }
      is_org_admin: { Args: { p_org: string }; Returns: boolean }
      is_org_member: { Args: { p_org: string }; Returns: boolean }
      is_org_owner: { Args: { p_org: string }; Returns: boolean }
      is_platform_admin: { Args: { _user_id?: string }; Returns: boolean }
      is_platform_owner: { Args: { _user_id?: string }; Returns: boolean }
      is_project_in_my_org: { Args: { p_project_id: string }; Returns: boolean }
      is_project_member: { Args: { p_project_id: string }; Returns: boolean }
      is_project_org_admin: { Args: { p_project: string }; Returns: boolean }
      is_project_org_owner: { Args: { p_project_id: string }; Returns: boolean }
      is_project_owner: { Args: { p_project_id: string }; Returns: boolean }
      is_user_project_member: {
        Args: { p_project: string; p_user: string }
        Returns: boolean
      }
      item_cost_values: { Args: { p_item_id: string }; Returns: Json }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      my_org_limits_usage: {
        Args: { p_org?: string }
        Returns: {
          max_active_projects: number
          max_addons: number
          max_boq_items_per_project: number
          max_seats: number
          max_storage_bytes: number
          max_users_per_role: number
          organization_id: string
          projects_used: number
          seats_used: number
          storage_used_bytes: number
          tier: Database["public"]["Enums"]["subscription_tier"]
        }[]
      }
      org_active_project_count: { Args: { p_org: string }; Returns: number }
      org_can_activate_project: { Args: { p_org: string }; Returns: boolean }
      org_primary_email_domain: { Args: { p_org: string }; Returns: string }
      org_reopen_count_this_month: { Args: { p_org: string }; Returns: number }
      org_role_user_count: {
        Args: { p_org: string; p_role: Database["public"]["Enums"]["app_role"] }
        Returns: number
      }
      org_seat_count: {
        Args: { p_include_invites?: boolean; p_org: string }
        Returns: number
      }
      org_storage_bytes: { Args: { p_org: string }; Returns: number }
      peek_org_invite: {
        Args: { p_token: string }
        Returns: {
          base_role: string
          email: string
          expires_at: string
          organization_name: string
          status: string
        }[]
      }
      platform_admin_list: {
        Args: never
        Returns: {
          created_at: string
          display_name: string
          email: string
          grade: string
          notes: string
          user_id: string
        }[]
      }
      platform_admin_revoke: { Args: { p_email: string }; Returns: Json }
      platform_admin_set_grade: {
        Args: { p_email: string; p_grade: string }
        Returns: Json
      }
      platform_impersonation_end: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      platform_impersonation_end_all: { Args: never; Returns: undefined }
      platform_impersonation_log_list: {
        Args: { p_limit?: number }
        Returns: {
          actor_email: string
          actor_grade: string
          actor_user_id: string
          ended_at: string
          id: string
          organization_name: string
          reason: string
          started_at: string
          target_email: string
          target_organization_id: string
          target_user_id: string
        }[]
      }
      platform_impersonation_start: {
        Args: {
          p_organization_id: string
          p_reason?: string
          p_target_user_id?: string
        }
        Returns: string
      }
      project_boq_item_count: { Args: { p_project: string }; Returns: number }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      record_invite_domain: {
        Args: { p_email: string; p_org: string }
        Returns: Json
      }
      redeem_discount: {
        Args: { p_code: string; p_org: string }
        Returns: boolean
      }
      register_login: {
        Args: {
          p_city?: string
          p_country?: string
          p_ip?: string
          p_session_id: string
          p_user_agent?: string
        }
        Returns: Json
      }
      seed_master_data_for_org: { Args: { p_org: string }; Returns: undefined }
      set_org_custom_domain: {
        Args: { p_domain: string; p_org: string }
        Returns: string
      }
      shares_org_with: { Args: { _target: string }; Returns: boolean }
      storage_upload_within_limit: {
        Args: { p_bucket: string; p_name: string }
        Returns: boolean
      }
      tick_subscription_lifecycle: {
        Args: never
        Returns: {
          new_status: Database["public"]["Enums"]["subscription_status"]
          old_status: Database["public"]["Enums"]["subscription_status"]
          org_id: string
        }[]
      }
      tier_project_limit: {
        Args: { t: Database["public"]["Enums"]["subscription_tier"] }
        Returns: number
      }
      tier_storage_limit_bytes: {
        Args: { t: Database["public"]["Enums"]["subscription_tier"] }
        Returns: number
      }
      tier_storage_limit_gb: {
        Args: { t: Database["public"]["Enums"]["subscription_tier"] }
        Returns: number
      }
      touch_login_session: { Args: { p_session_id: string }; Returns: boolean }
      validate_discount: {
        Args: {
          p_code: string
          p_org: string
          p_tier: Database["public"]["Enums"]["subscription_tier"]
        }
        Returns: {
          amount_off: number
          percent_off: number
          reason: string
          valid: boolean
        }[]
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "designer"
        | "accountant"
        | "qs"
        | "head_of_payments"
        | "client"
        | "ceo"
        | "site_engineer"
        | "project_manager"
        | "procurement_manager"
        | "mep_engineer"
        | "coo"
        | "head_of_design"
        | "architectural_dept"
      approval_status: "pending" | "approved" | "rejected" | "revision"
      boq_category:
        | "joinery"
        | "loose-furniture"
        | "lighting"
        | "finishes"
        | "ffe"
        | "accessories"
        | "appliances"
        | "hvac"
        | "electrical"
        | "plumbing"
        | "fire-protection"
        | "low-voltage"
        | "sanitary"
      boq_coverage_status: "present" | "missing" | "to-confirm"
      item_lifecycle_status:
        | "draft"
        | "estimated"
        | "approved"
        | "ordered"
        | "delivered"
        | "installed"
        | "on_hold"
        | "concept"
        | "in_design"
        | "design_ready"
        | "finishes_proposed"
        | "finishes_approved_designer"
        | "finishes_approved_hod"
        | "client_board_ready"
        | "client_board_waiting_signature"
        | "client_board_signed"
        | "quotation_preparation"
        | "quotation_inserted"
        | "quotation_approved_ops"
        | "quotation_approved_high"
        | "po_issued"
        | "proforma_received"
        | "payment_approval"
        | "payment_executed"
        | "in_production"
        | "ready_to_ship"
        | "in_delivery"
        | "delivered_to_site"
        | "installation_planned"
        | "snagging"
        | "closed"
        | "cancelled"
      payment_scheme: "single" | "split_50_50" | "installments_3"
      platform_admin_grade: "staff" | "owner"
      subscription_status:
        | "active"
        | "grace"
        | "suspended"
        | "purge_pending"
        | "purged"
      subscription_tier: "basic" | "advanced" | "pro"
      task_macro_area:
        | "planning"
        | "design_validation"
        | "procurement"
        | "production"
        | "delivery"
        | "installation"
        | "closing"
        | "custom"
      task_status: "todo" | "in_progress" | "done" | "blocked"
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
      app_role: [
        "admin",
        "designer",
        "accountant",
        "qs",
        "head_of_payments",
        "client",
        "ceo",
        "site_engineer",
        "project_manager",
        "procurement_manager",
        "mep_engineer",
        "coo",
        "head_of_design",
        "architectural_dept",
      ],
      approval_status: ["pending", "approved", "rejected", "revision"],
      boq_category: [
        "joinery",
        "loose-furniture",
        "lighting",
        "finishes",
        "ffe",
        "accessories",
        "appliances",
        "hvac",
        "electrical",
        "plumbing",
        "fire-protection",
        "low-voltage",
        "sanitary",
      ],
      boq_coverage_status: ["present", "missing", "to-confirm"],
      item_lifecycle_status: [
        "draft",
        "estimated",
        "approved",
        "ordered",
        "delivered",
        "installed",
        "on_hold",
        "concept",
        "in_design",
        "design_ready",
        "finishes_proposed",
        "finishes_approved_designer",
        "finishes_approved_hod",
        "client_board_ready",
        "client_board_waiting_signature",
        "client_board_signed",
        "quotation_preparation",
        "quotation_inserted",
        "quotation_approved_ops",
        "quotation_approved_high",
        "po_issued",
        "proforma_received",
        "payment_approval",
        "payment_executed",
        "in_production",
        "ready_to_ship",
        "in_delivery",
        "delivered_to_site",
        "installation_planned",
        "snagging",
        "closed",
        "cancelled",
      ],
      payment_scheme: ["single", "split_50_50", "installments_3"],
      platform_admin_grade: ["staff", "owner"],
      subscription_status: [
        "active",
        "grace",
        "suspended",
        "purge_pending",
        "purged",
      ],
      subscription_tier: ["basic", "advanced", "pro"],
      task_macro_area: [
        "planning",
        "design_validation",
        "procurement",
        "production",
        "delivery",
        "installation",
        "closing",
        "custom",
      ],
      task_status: ["todo", "in_progress", "done", "blocked"],
    },
  },
} as const
