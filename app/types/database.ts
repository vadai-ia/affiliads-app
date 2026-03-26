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
