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
      student_observations: {
        Row: {
          confidence_level: number | null
          context: string | null
          created_at: string
          emotional_state: string | null
          id: string
          observation_data: Json
          observation_type: string
          student_id: string
          video_id: string | null
        }
        Insert: {
          confidence_level?: number | null
          context?: string | null
          created_at?: string
          emotional_state?: string | null
          id?: string
          observation_data: Json
          observation_type: string
          student_id: string
          video_id?: string | null
        }
        Update: {
          confidence_level?: number | null
          context?: string | null
          created_at?: string
          emotional_state?: string | null
          id?: string
          observation_data?: Json
          observation_type?: string
          student_id?: string
          video_id?: string | null
        }
        Relationships: []
      }
      student_profiles: {
        Row: {
          areas_to_improve: string[] | null
          created_at: string
          emotional_patterns: Json | null
          id: string
          interaction_count: number | null
          last_seen_at: string | null
          learning_style: string | null
          name: string | null
          personality_notes: string | null
          preferences: Json | null
          strengths: string[] | null
          student_id: string
          total_study_time_minutes: number | null
          updated_at: string
        }
        Insert: {
          areas_to_improve?: string[] | null
          created_at?: string
          emotional_patterns?: Json | null
          id?: string
          interaction_count?: number | null
          last_seen_at?: string | null
          learning_style?: string | null
          name?: string | null
          personality_notes?: string | null
          preferences?: Json | null
          strengths?: string[] | null
          student_id: string
          total_study_time_minutes?: number | null
          updated_at?: string
        }
        Update: {
          areas_to_improve?: string[] | null
          created_at?: string
          emotional_patterns?: Json | null
          id?: string
          interaction_count?: number | null
          last_seen_at?: string | null
          learning_style?: string | null
          name?: string | null
          personality_notes?: string | null
          preferences?: Json | null
          strengths?: string[] | null
          student_id?: string
          total_study_time_minutes?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      videos: {
        Row: {
          analysis: string | null
          created_at: string
          description: string | null
          duration_minutes: number | null
          id: string
          is_configured: boolean | null
          lesson_order: number | null
          teaching_moments: Json | null
          thumbnail_url: string | null
          title: string
          transcript: string | null
          updated_at: string
          youtube_id: string
        }
        Insert: {
          analysis?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_configured?: boolean | null
          lesson_order?: number | null
          teaching_moments?: Json | null
          thumbnail_url?: string | null
          title: string
          transcript?: string | null
          updated_at?: string
          youtube_id: string
        }
        Update: {
          analysis?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_configured?: boolean | null
          lesson_order?: number | null
          teaching_moments?: Json | null
          thumbnail_url?: string | null
          title?: string
          transcript?: string | null
          updated_at?: string
          youtube_id?: string
        }
        Relationships: []
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
