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
      cost_categories: {
        Row: {
          code: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
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
        ]
      }
      master_floors: {
        Row: {
          code: string
          created_at: string | null
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      master_item_types: {
        Row: {
          allowed_categories: string[] | null
          code: string
          created_at: string | null
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          allowed_categories?: string[] | null
          code: string
          created_at?: string | null
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          allowed_categories?: string[] | null
          code?: string
          created_at?: string | null
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      master_rooms: {
        Row: {
          code: string
          created_at: string | null
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      master_subcategories: {
        Row: {
          code: string
          created_at: string | null
          id: string
          item_type_id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          item_type_id: string
          name: string
          sort_order?: number | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          item_type_id?: string
          name?: string
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
        ]
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
          created_at: string | null
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      project_items: {
        Row: {
          apartment_number: string | null
          approval_status: Database["public"]["Enums"]["approval_status"]
          area: string
          boq_included: boolean
          category: Database["public"]["Enums"]["boq_category"]
          company_product_url: string | null
          created_at: string
          custom_cost: number | null
          delivery_cost: number | null
          delivery_date: string | null
          description: string
          dimensions: string | null
          duty_cost: number | null
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
          is_selected_option: boolean | null
          item_code: string | null
          item_type_id: string | null
          lifecycle_status:
            | Database["public"]["Enums"]["item_lifecycle_status"]
            | null
          margin_percentage: number | null
          notes: string | null
          parent_item_id: string | null
          production_due_date: string | null
          production_time: string | null
          project_id: string
          purchase_order_ref: string | null
          purchased: boolean
          quantity: number | null
          received: boolean
          received_date: string | null
          reference_image_url: string | null
          room_id: string | null
          room_number: string | null
          selling_price: number | null
          sequence_number: number | null
          site_movement_date: string | null
          subcategory_id: string | null
          supplier: string | null
          technical_drawing_url: string | null
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          apartment_number?: string | null
          approval_status?: Database["public"]["Enums"]["approval_status"]
          area: string
          boq_included?: boolean
          category: Database["public"]["Enums"]["boq_category"]
          company_product_url?: string | null
          created_at?: string
          custom_cost?: number | null
          delivery_cost?: number | null
          delivery_date?: string | null
          description: string
          dimensions?: string | null
          duty_cost?: number | null
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
          is_selected_option?: boolean | null
          item_code?: string | null
          item_type_id?: string | null
          lifecycle_status?:
            | Database["public"]["Enums"]["item_lifecycle_status"]
            | null
          margin_percentage?: number | null
          notes?: string | null
          parent_item_id?: string | null
          production_due_date?: string | null
          production_time?: string | null
          project_id: string
          purchase_order_ref?: string | null
          purchased?: boolean
          quantity?: number | null
          received?: boolean
          received_date?: string | null
          reference_image_url?: string | null
          room_id?: string | null
          room_number?: string | null
          selling_price?: number | null
          sequence_number?: number | null
          site_movement_date?: string | null
          subcategory_id?: string | null
          supplier?: string | null
          technical_drawing_url?: string | null
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          apartment_number?: string | null
          approval_status?: Database["public"]["Enums"]["approval_status"]
          area?: string
          boq_included?: boolean
          category?: Database["public"]["Enums"]["boq_category"]
          company_product_url?: string | null
          created_at?: string
          custom_cost?: number | null
          delivery_cost?: number | null
          delivery_date?: string | null
          description?: string
          dimensions?: string | null
          duty_cost?: number | null
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
          is_selected_option?: boolean | null
          item_code?: string | null
          item_type_id?: string | null
          lifecycle_status?:
            | Database["public"]["Enums"]["item_lifecycle_status"]
            | null
          margin_percentage?: number | null
          notes?: string | null
          parent_item_id?: string | null
          production_due_date?: string | null
          production_time?: string | null
          project_id?: string
          purchase_order_ref?: string | null
          purchased?: boolean
          quantity?: number | null
          received?: boolean
          received_date?: string | null
          reference_image_url?: string | null
          room_id?: string | null
          room_number?: string | null
          selling_price?: number | null
          sequence_number?: number | null
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
      projects: {
        Row: {
          boq_master_ref: string | null
          boq_version: string | null
          client: string
          code: string
          created_at: string
          id: string
          last_update_date: string | null
          location: string | null
          name: string
          owner_id: string
          project_manager: string | null
          start_date: string
          target_completion_date: string
          updated_at: string
        }
        Insert: {
          boq_master_ref?: string | null
          boq_version?: string | null
          client: string
          code: string
          created_at?: string
          id?: string
          last_update_date?: string | null
          location?: string | null
          name: string
          owner_id: string
          project_manager?: string | null
          start_date: string
          target_completion_date: string
          updated_at?: string
        }
        Update: {
          boq_master_ref?: string | null
          boq_version?: string | null
          client?: string
          code?: string
          created_at?: string
          id?: string
          last_update_date?: string | null
          location?: string | null
          name?: string
          owner_id?: string
          project_manager?: string | null
          start_date?: string
          target_completion_date?: string
          updated_at?: string
        }
        Relationships: []
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
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_item_project_owner: { Args: { p_item_id: string }; Returns: boolean }
      is_project_owner: { Args: { p_project_id: string }; Returns: boolean }
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
      approval_status: "pending" | "approved" | "rejected" | "revision"
      boq_category:
        | "joinery"
        | "loose-furniture"
        | "lighting"
        | "finishes"
        | "ffe"
        | "accessories"
        | "appliances"
      boq_coverage_status: "present" | "missing" | "to-confirm"
      item_lifecycle_status:
        | "draft"
        | "estimated"
        | "approved"
        | "ordered"
        | "delivered"
        | "installed"
        | "on_hold"
      payment_scheme: "single" | "split_50_50" | "installments_3"
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
      ],
      payment_scheme: ["single", "split_50_50", "installments_3"],
    },
  },
} as const
