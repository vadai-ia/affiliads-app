export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "leader" | "affiliate";

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          base_domain: string;
          currency: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          base_domain: string;
          currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["organizations"]["Insert"]>;
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          org_id: string;
          role: UserRole;
          full_name: string | null;
          email: string;
          subdomain: string | null;
          is_active: boolean | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          org_id: string;
          role: UserRole;
          full_name?: string | null;
          email: string;
          subdomain?: string | null;
          is_active?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
        Relationships: [];
      };
      invitation_tokens: {
        Row: {
          id: string;
          org_id: string;
          email: string;
          subdomain: string;
          token: string;
          invited_by: string;
          used_at: string | null;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          email: string;
          subdomain: string;
          token: string;
          invited_by: string;
          used_at?: string | null;
          expires_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["invitation_tokens"]["Insert"]>;
        Relationships: [];
      };
      bank_details: {
        Row: {
          id: string;
          org_id: string;
          bank_name: string;
          account_holder: string;
          account_number: string;
          clabe: string | null;
          instructions: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          bank_name: string;
          account_holder: string;
          account_number: string;
          clabe?: string | null;
          instructions?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["bank_details"]["Insert"]>;
        Relationships: [];
      };
      meta_connections: {
        Row: {
          id: string;
          org_id: string;
          access_token_encrypted: string;
          ad_account_id: string;
          page_id: string;
          ig_account_id: string | null;
          business_id: string | null;
          token_type: string | null;
          token_expires_at: string | null;
          encryption_key_version: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          access_token_encrypted: string;
          ad_account_id: string;
          page_id: string;
          ig_account_id?: string | null;
          business_id?: string | null;
          token_type?: string | null;
          token_expires_at?: string | null;
          encryption_key_version?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["meta_connections"]["Insert"]>;
        Relationships: [];
      };
      campaign_templates: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          campaign_objective: string;
          copy_base: string;
          min_budget: string;
          max_budget: string;
          status: "draft" | "active" | "paused" | "archived";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          campaign_objective?: string;
          copy_base: string;
          min_budget: string;
          max_budget: string;
          status?: "draft" | "active" | "paused" | "archived";
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["campaign_templates"]["Insert"]>;
        Relationships: [];
      };
      assets: {
        Row: {
          id: string;
          template_id: string;
          file_url: string;
          file_type: "image" | "video";
          original_name: string | null;
          sort_order: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          template_id: string;
          file_url: string;
          file_type: "image" | "video";
          original_name?: string | null;
          sort_order?: number | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["assets"]["Insert"]>;
        Relationships: [];
      };
      allowed_geos: {
        Row: {
          id: string;
          template_id: string;
          label: string;
          country_code: string;
          region: string | null;
          city: string | null;
          radius_km: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          template_id: string;
          label: string;
          country_code?: string;
          region?: string | null;
          city?: string | null;
          radius_km?: number | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["allowed_geos"]["Insert"]>;
        Relationships: [];
      };
      campaign_activations: {
        Row: {
          id: string;
          org_id: string;
          template_id: string;
          affiliate_id: string;
          budget: string;
          selected_geo_id: string;
          landing_url: string;
          meta_campaign_id: string | null;
          meta_adset_id: string | null;
          meta_ad_id: string | null;
          status:
            | "pending_payment"
            | "pending_approval"
            | "rejected"
            | "activating"
            | "active"
            | "paused"
            | "completed"
            | "failed";
          rejection_reason: string | null;
          meta_error: Json | null;
          activated_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          template_id: string;
          affiliate_id: string;
          budget: string;
          selected_geo_id: string;
          landing_url: string;
          meta_campaign_id?: string | null;
          meta_adset_id?: string | null;
          meta_ad_id?: string | null;
          status?:
            | "pending_payment"
            | "pending_approval"
            | "rejected"
            | "activating"
            | "active"
            | "paused"
            | "completed"
            | "failed";
          rejection_reason?: string | null;
          meta_error?: Json | null;
          activated_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["campaign_activations"]["Insert"]
        >;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          activation_id: string;
          proof_url: string;
          amount: string;
          status: "pending" | "approved" | "rejected";
          rejection_reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          activation_id: string;
          proof_url: string;
          amount: string;
          status?: "pending" | "approved" | "rejected";
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
        Relationships: [];
      };
      activity_log: {
        Row: {
          id: string;
          org_id: string;
          user_id: string | null;
          entity_type: string;
          entity_id: string;
          action: string;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          user_id?: string | null;
          entity_type: string;
          entity_id: string;
          action: string;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["activity_log"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      user_org_id: { Args: Record<string, never>; Returns: string | null };
      user_role: { Args: Record<string, never>; Returns: string | null };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
