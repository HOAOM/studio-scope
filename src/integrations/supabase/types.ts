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
      project_items: {
        Row: {
          approval_status: Database["public"]["Enums"]["approval_status"]
          area: string
          boq_included: boolean
          category: Database["public"]["Enums"]["boq_category"]
          created_at: string
          delivery_date: string | null
          description: string
          id: string
          image_3d_ref: string | null
          installed: boolean
          installed_date: string | null
          item_code: string | null
          notes: string | null
          production_due_date: string | null
          project_id: string
          purchase_order_ref: string | null
          purchased: boolean
          quantity: number | null
          received: boolean
          received_date: string | null
          supplier: string | null
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          approval_status?: Database["public"]["Enums"]["approval_status"]
          area: string
          boq_included?: boolean
          category: Database["public"]["Enums"]["boq_category"]
          created_at?: string
          delivery_date?: string | null
          description: string
          id?: string
          image_3d_ref?: string | null
          installed?: boolean
          installed_date?: string | null
          item_code?: string | null
          notes?: string | null
          production_due_date?: string | null
          project_id: string
          purchase_order_ref?: string | null
          purchased?: boolean
          quantity?: number | null
          received?: boolean
          received_date?: string | null
          supplier?: string | null
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          approval_status?: Database["public"]["Enums"]["approval_status"]
          area?: string
          boq_included?: boolean
          category?: Database["public"]["Enums"]["boq_category"]
          created_at?: string
          delivery_date?: string | null
          description?: string
          id?: string
          image_3d_ref?: string | null
          installed?: boolean
          installed_date?: string | null
          item_code?: string | null
          notes?: string | null
          production_due_date?: string | null
          project_id?: string
          purchase_order_ref?: string | null
          purchased?: boolean
          quantity?: number | null
          received?: boolean
          received_date?: string | null
          supplier?: string | null
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
    },
  },
} as const
