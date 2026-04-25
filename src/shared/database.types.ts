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
      coach_messages: {
        Row: {
          created_at: string
          id: string
          role: string
          text: string
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: string
          text: string
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          text?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "entitlements"
            referencedColumns: ["user_id"]
          },
        ]
      }
      coach_plan_cache: {
        Row: {
          aggregation_snapshot: Json
          drills: Json
          expires_at: string
          generated_at: string
          grammar_concept_deep_links: Json
          id: string
          model_version: string
          plan_markdown: string
          prompt_version: string
          user_id: string
        }
        Insert: {
          aggregation_snapshot: Json
          drills?: Json
          expires_at?: string
          generated_at?: string
          grammar_concept_deep_links?: Json
          id?: string
          model_version: string
          plan_markdown: string
          prompt_version: string
          user_id: string
        }
        Update: {
          aggregation_snapshot?: Json
          drills?: Json
          expires_at?: string
          generated_at?: string
          grammar_concept_deep_links?: Json
          id?: string
          model_version?: string
          plan_markdown?: string
          prompt_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_plan_cache_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "entitlements"
            referencedColumns: ["user_id"]
          },
        ]
      }
      grading_jobs: {
        Row: {
          attempt_count: number
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          last_heartbeat_at: string | null
          started_at: string | null
          status: string
          submission_id: string
          submission_kind: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          last_heartbeat_at?: string | null
          started_at?: string | null
          status?: string
          submission_id: string
          submission_kind?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          last_heartbeat_at?: string | null
          started_at?: string | null
          status?: string
          submission_id?: string
          submission_kind?: string
        }
        Relationships: []
      }
      grammar_concept_content: {
        Row: {
          concept_code: string
          drill_items: Json
          examples: Json
          rule_card_md_de: string
          rule_card_md_fr: string
          updated_at: string
        }
        Insert: {
          concept_code: string
          drill_items?: Json
          examples?: Json
          rule_card_md_de?: string
          rule_card_md_fr?: string
          updated_at?: string
        }
        Update: {
          concept_code?: string
          drill_items?: Json
          examples?: Json
          rule_card_md_de?: string
          rule_card_md_fr?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grammar_concept_content_concept_code_fkey"
            columns: ["concept_code"]
            isOneToOne: true
            referencedRelation: "grammar_concepts"
            referencedColumns: ["code"]
          },
        ]
      }
      grammar_concepts: {
        Row: {
          cefr_level: string
          code: string
          created_at: string
          name_de: string
          name_fr: string
          wortliste_source: string
        }
        Insert: {
          cefr_level: string
          code: string
          created_at?: string
          name_de: string
          name_fr: string
          wortliste_source?: string
        }
        Update: {
          cefr_level?: string
          code?: string
          created_at?: string
          name_de?: string
          name_fr?: string
          wortliste_source?: string
        }
        Relationships: []
      }
      hoeren_attempt_items: {
        Row: {
          answer_key: string | null
          answered_at: string
          attempt_id: string
          is_correct: boolean
          item_id: string
        }
        Insert: {
          answer_key?: string | null
          answered_at?: string
          attempt_id: string
          is_correct?: boolean
          item_id: string
        }
        Update: {
          answer_key?: string | null
          answered_at?: string
          attempt_id?: string
          is_correct?: boolean
          item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hoeren_attempt_items_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "hoeren_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hoeren_attempt_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "qb_modelltest_flat"
            referencedColumns: ["question_id"]
          },
          {
            foreignKeyName: "hoeren_attempt_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "qb_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      hoeren_attempts: {
        Row: {
          exam_slug: string
          id: string
          modelltest_id: string
          raw_score: number | null
          scaled_score: number | null
          started_at: string
          status: string
          submitted_at: string | null
          user_id: string
        }
        Insert: {
          exam_slug: string
          id?: string
          modelltest_id: string
          raw_score?: number | null
          scaled_score?: number | null
          started_at?: string
          status?: string
          submitted_at?: string | null
          user_id: string
        }
        Update: {
          exam_slug?: string
          id?: string
          modelltest_id?: string
          raw_score?: number | null
          scaled_score?: number | null
          started_at?: string
          status?: string
          submitted_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hoeren_attempts_modelltest_id_fkey"
            columns: ["modelltest_id"]
            isOneToOne: false
            referencedRelation: "qb_modelltest_flat"
            referencedColumns: ["modelltest_id"]
          },
          {
            foreignKeyName: "hoeren_attempts_modelltest_id_fkey"
            columns: ["modelltest_id"]
            isOneToOne: false
            referencedRelation: "qb_modelltests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hoeren_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "entitlements"
            referencedColumns: ["user_id"]
          },
        ]
      }
      idempotency_key: {
        Row: {
          completed_at: string | null
          created_at: string
          endpoint: string
          expires_at: string
          key: string
          response_body: Json | null
          response_status: number | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          endpoint: string
          expires_at?: string
          key: string
          response_body?: Json | null
          response_status?: number | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          endpoint?: string
          expires_at?: string
          key?: string
          response_body?: Json | null
          response_status?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_key_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "entitlements"
            referencedColumns: ["user_id"]
          },
        ]
      }
      landeskunde_articles: {
        Row: {
          audio_asset_id: string | null
          body_md_de: string
          body_md_fr: string
          created_at: string
          id: string
          published: boolean
          slug: string
          title_de: string
          title_fr: string
          updated_at: string
        }
        Insert: {
          audio_asset_id?: string | null
          body_md_de: string
          body_md_fr: string
          created_at?: string
          id?: string
          published?: boolean
          slug: string
          title_de: string
          title_fr: string
          updated_at?: string
        }
        Update: {
          audio_asset_id?: string | null
          body_md_de?: string
          body_md_fr?: string
          created_at?: string
          id?: string
          published?: boolean
          slug?: string
          title_de?: string
          title_fr?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "landeskunde_articles_audio_asset_id_fkey"
            columns: ["audio_asset_id"]
            isOneToOne: false
            referencedRelation: "qb_media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      missing_structure_log: {
        Row: {
          grammar_concept_code: string
          logged_at: string
          submission_id: string
          user_id: string
        }
        Insert: {
          grammar_concept_code: string
          logged_at?: string
          submission_id: string
          user_id: string
        }
        Update: {
          grammar_concept_code?: string
          logged_at?: string
          submission_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "missing_structure_log_grammar_concept_code_fkey"
            columns: ["grammar_concept_code"]
            isOneToOne: false
            referencedRelation: "grammar_concepts"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "missing_structure_log_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "writing_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missing_structure_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "entitlements"
            referencedColumns: ["user_id"]
          },
        ]
      }
      mock_exam_attempts: {
        Row: {
          created_at: string
          exam_slug: string
          finalized_at: string | null
          hoeren_attempt_id: string | null
          id: string
          lesen_attempt_id: string | null
          modelltest_id: string
          per_competence_report: Json | null
          schreiben_submission_id: string | null
          sprechen_submission_id: string | null
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exam_slug: string
          finalized_at?: string | null
          hoeren_attempt_id?: string | null
          id?: string
          lesen_attempt_id?: string | null
          modelltest_id: string
          per_competence_report?: Json | null
          schreiben_submission_id?: string | null
          sprechen_submission_id?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          exam_slug?: string
          finalized_at?: string | null
          hoeren_attempt_id?: string | null
          id?: string
          lesen_attempt_id?: string | null
          modelltest_id?: string
          per_competence_report?: Json | null
          schreiben_submission_id?: string | null
          sprechen_submission_id?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mea_sprechen_submission_fk"
            columns: ["sprechen_submission_id"]
            isOneToOne: false
            referencedRelation: "sprechen_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mock_exam_attempts_hoeren_attempt_id_fkey"
            columns: ["hoeren_attempt_id"]
            isOneToOne: false
            referencedRelation: "hoeren_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mock_exam_attempts_lesen_attempt_id_fkey"
            columns: ["lesen_attempt_id"]
            isOneToOne: false
            referencedRelation: "reading_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mock_exam_attempts_modelltest_id_fkey"
            columns: ["modelltest_id"]
            isOneToOne: false
            referencedRelation: "qb_modelltest_flat"
            referencedColumns: ["modelltest_id"]
          },
          {
            foreignKeyName: "mock_exam_attempts_modelltest_id_fkey"
            columns: ["modelltest_id"]
            isOneToOne: false
            referencedRelation: "qb_modelltests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mock_exam_attempts_schreiben_submission_id_fkey"
            columns: ["schreiben_submission_id"]
            isOneToOne: false
            referencedRelation: "writing_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mock_exam_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "entitlements"
            referencedColumns: ["user_id"]
          },
        ]
      }
      plans: {
        Row: {
          code: string
          created_at: string
          duration_days: number
          id: string
          is_active: boolean
          kind: string
          name: string
          name_fr: string
          price_xaf: number
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          duration_days: number
          id?: string
          is_active?: boolean
          kind: string
          name: string
          name_fr: string
          price_xaf: number
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          duration_days?: number
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          name_fr?: string
          price_xaf?: number
          sort_order?: number
        }
        Relationships: []
      }
      purchases: {
        Row: {
          created_at: string
          entitlement_id: string
          expires_at: string | null
          id: string
          is_sandbox: boolean
          product_id: string
          purchased_at: string
          rc_event_id: string | null
          rc_event_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entitlement_id?: string
          expires_at?: string | null
          id?: string
          is_sandbox?: boolean
          product_id: string
          purchased_at: string
          rc_event_id?: string | null
          rc_event_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          entitlement_id?: string
          expires_at?: string | null
          id?: string
          is_sandbox?: boolean
          product_id?: string
          purchased_at?: string
          rc_event_id?: string | null
          rc_event_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "entitlements"
            referencedColumns: ["user_id"]
          },
        ]
      }
      qb_audio_tracks: {
        Row: {
          content_source:
            | Database["public"]["Enums"]["qb_content_source"]
            | null
          duration_sec: number | null
          exam_part_id: string | null
          file_path: string | null
          id: string
          media_id: string | null
          notes: string | null
          quality_label: string | null
          slug: string | null
          source_id: string | null
          speakers: string | null
          title: string | null
          track_kind: string | null
          transcript_md: string | null
        }
        Insert: {
          content_source?:
            | Database["public"]["Enums"]["qb_content_source"]
            | null
          duration_sec?: number | null
          exam_part_id?: string | null
          file_path?: string | null
          id?: string
          media_id?: string | null
          notes?: string | null
          quality_label?: string | null
          slug?: string | null
          source_id?: string | null
          speakers?: string | null
          title?: string | null
          track_kind?: string | null
          transcript_md?: string | null
        }
        Update: {
          content_source?:
            | Database["public"]["Enums"]["qb_content_source"]
            | null
          duration_sec?: number | null
          exam_part_id?: string | null
          file_path?: string | null
          id?: string
          media_id?: string | null
          notes?: string | null
          quality_label?: string | null
          slug?: string | null
          source_id?: string | null
          speakers?: string | null
          title?: string | null
          track_kind?: string | null
          transcript_md?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qb_audio_tracks_exam_part_id_fkey"
            columns: ["exam_part_id"]
            isOneToOne: false
            referencedRelation: "qb_exam_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_audio_tracks_exam_part_id_fkey"
            columns: ["exam_part_id"]
            isOneToOne: false
            referencedRelation: "qb_modelltest_flat"
            referencedColumns: ["exam_part_id"]
          },
          {
            foreignKeyName: "qb_audio_tracks_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "qb_media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_audio_tracks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "qb_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      qb_certifications: {
        Row: {
          body: string | null
          code: string
          label: string
        }
        Insert: {
          body?: string | null
          code: string
          label: string
        }
        Update: {
          body?: string | null
          code?: string
          label?: string
        }
        Relationships: []
      }
      qb_exam_parts: {
        Row: {
          duration_minutes: number | null
          id: string
          instructions_de: string | null
          instructions_en: string | null
          item_range_end: number | null
          item_range_start: number | null
          modelltest_module_id: string
          notes: string | null
          part_kind: string | null
          teil_label: string | null
          teil_number: number
        }
        Insert: {
          duration_minutes?: number | null
          id?: string
          instructions_de?: string | null
          instructions_en?: string | null
          item_range_end?: number | null
          item_range_start?: number | null
          modelltest_module_id: string
          notes?: string | null
          part_kind?: string | null
          teil_label?: string | null
          teil_number: number
        }
        Update: {
          duration_minutes?: number | null
          id?: string
          instructions_de?: string | null
          instructions_en?: string | null
          item_range_end?: number | null
          item_range_start?: number | null
          modelltest_module_id?: string
          notes?: string | null
          part_kind?: string | null
          teil_label?: string | null
          teil_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "qb_exam_parts_modelltest_module_id_fkey"
            columns: ["modelltest_module_id"]
            isOneToOne: false
            referencedRelation: "qb_modelltest_flat"
            referencedColumns: ["modelltest_module_id"]
          },
          {
            foreignKeyName: "qb_exam_parts_modelltest_module_id_fkey"
            columns: ["modelltest_module_id"]
            isOneToOne: false
            referencedRelation: "qb_modelltest_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_exam_parts_part_kind_fkey"
            columns: ["part_kind"]
            isOneToOne: false
            referencedRelation: "qb_part_kinds"
            referencedColumns: ["code"]
          },
        ]
      }
      qb_ingest_state: {
        Row: {
          content_sha: string
          content_version: string
          exam_slug: string
          ingested_at: string
          is_published: boolean
          module_status: Json
        }
        Insert: {
          content_sha: string
          content_version: string
          exam_slug: string
          ingested_at?: string
          is_published?: boolean
          module_status?: Json
        }
        Update: {
          content_sha?: string
          content_version?: string
          exam_slug?: string
          ingested_at?: string
          is_published?: boolean
          module_status?: Json
        }
        Relationships: []
      }
      qb_levels: {
        Row: {
          cefr_order: number
          code: string
        }
        Insert: {
          cefr_order: number
          code: string
        }
        Update: {
          cefr_order?: number
          code?: string
        }
        Relationships: []
      }
      qb_media_assets: {
        Row: {
          alt_de: string | null
          alt_en: string | null
          bytes: number | null
          created_at: string
          duration_sec: number | null
          height_px: number | null
          id: string
          kind: string
          media_key: string
          mime_type: string | null
          notes: string | null
          origin_path: string | null
          sha256: string | null
          slug: string
          source_id: string | null
          source_ref: string | null
          width_px: number | null
        }
        Insert: {
          alt_de?: string | null
          alt_en?: string | null
          bytes?: number | null
          created_at?: string
          duration_sec?: number | null
          height_px?: number | null
          id?: string
          kind: string
          media_key: string
          mime_type?: string | null
          notes?: string | null
          origin_path?: string | null
          sha256?: string | null
          slug: string
          source_id?: string | null
          source_ref?: string | null
          width_px?: number | null
        }
        Update: {
          alt_de?: string | null
          alt_en?: string | null
          bytes?: number | null
          created_at?: string
          duration_sec?: number | null
          height_px?: number | null
          id?: string
          kind?: string
          media_key?: string
          mime_type?: string | null
          notes?: string | null
          origin_path?: string | null
          sha256?: string | null
          slug?: string
          source_id?: string | null
          source_ref?: string | null
          width_px?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "qb_media_assets_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "qb_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      qb_media_links: {
        Row: {
          caption_de: string | null
          display_order: number
          id: string
          media_id: string
          role: string | null
          target_id: string
          target_table: string
        }
        Insert: {
          caption_de?: string | null
          display_order?: number
          id?: string
          media_id: string
          role?: string | null
          target_id: string
          target_table: string
        }
        Update: {
          caption_de?: string | null
          display_order?: number
          id?: string
          media_id?: string
          role?: string | null
          target_id?: string
          target_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "qb_media_links_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "qb_media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      qb_modelltest_modules: {
        Row: {
          duration_minutes: number | null
          id: string
          instructions_de: string | null
          is_published: boolean
          item_count: number | null
          modelltest_id: string
          module_code: string
          notes: string | null
        }
        Insert: {
          duration_minutes?: number | null
          id?: string
          instructions_de?: string | null
          is_published?: boolean
          item_count?: number | null
          modelltest_id: string
          module_code: string
          notes?: string | null
        }
        Update: {
          duration_minutes?: number | null
          id?: string
          instructions_de?: string | null
          is_published?: boolean
          item_count?: number | null
          modelltest_id?: string
          module_code?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qb_modelltest_modules_modelltest_id_fkey"
            columns: ["modelltest_id"]
            isOneToOne: false
            referencedRelation: "qb_modelltest_flat"
            referencedColumns: ["modelltest_id"]
          },
          {
            foreignKeyName: "qb_modelltest_modules_modelltest_id_fkey"
            columns: ["modelltest_id"]
            isOneToOne: false
            referencedRelation: "qb_modelltests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_modelltest_modules_module_code_fkey"
            columns: ["module_code"]
            isOneToOne: false
            referencedRelation: "qb_modules"
            referencedColumns: ["code"]
          },
        ]
      }
      qb_modelltests: {
        Row: {
          cert_code: string
          content_source:
            | Database["public"]["Enums"]["qb_content_source"]
            | null
          created_at: string | null
          duration_minutes: number | null
          id: string
          is_published: boolean
          level_code: string
          notes: string | null
          sequence_num: number | null
          short_label: string | null
          slug: string
          source_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          cert_code: string
          content_source?:
            | Database["public"]["Enums"]["qb_content_source"]
            | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          is_published?: boolean
          level_code: string
          notes?: string | null
          sequence_num?: number | null
          short_label?: string | null
          slug: string
          source_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          cert_code?: string
          content_source?:
            | Database["public"]["Enums"]["qb_content_source"]
            | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          is_published?: boolean
          level_code?: string
          notes?: string | null
          sequence_num?: number | null
          short_label?: string | null
          slug?: string
          source_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qb_modelltests_cert_code_fkey"
            columns: ["cert_code"]
            isOneToOne: false
            referencedRelation: "qb_certifications"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "qb_modelltests_level_code_fkey"
            columns: ["level_code"]
            isOneToOne: false
            referencedRelation: "qb_levels"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "qb_modelltests_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "qb_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      qb_modules: {
        Row: {
          code: string
          label_de: string
          label_en: string
        }
        Insert: {
          code: string
          label_de: string
          label_en: string
        }
        Update: {
          code?: string
          label_de?: string
          label_en?: string
        }
        Relationships: []
      }
      qb_part_kinds: {
        Row: {
          code: string
          description: string | null
          label: string
          module_code: string
        }
        Insert: {
          code: string
          description?: string | null
          label: string
          module_code: string
        }
        Update: {
          code?: string
          description?: string | null
          label?: string
          module_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "qb_part_kinds_module_code_fkey"
            columns: ["module_code"]
            isOneToOne: false
            referencedRelation: "qb_modules"
            referencedColumns: ["code"]
          },
        ]
      }
      qb_question_formats: {
        Row: {
          code: string
          description: string | null
          label: string
        }
        Insert: {
          code: string
          description?: string | null
          label: string
        }
        Update: {
          code?: string
          description?: string | null
          label?: string
        }
        Relationships: []
      }
      qb_questions: {
        Row: {
          audio_segment_end: number | null
          audio_segment_start: number | null
          audio_track_id: string | null
          content_source:
            | Database["public"]["Enums"]["qb_content_source"]
            | null
          context_md: string | null
          correct_answer: Json
          created_at: string | null
          exam_part_id: string
          explanation_de: string | null
          explanation_en: string | null
          id: string
          item_number: number
          media_id: string | null
          options: Json | null
          points: number | null
          question_format: string
          reading_text_id: string | null
          source_id: string | null
          source_ref: string | null
          stem_de: string | null
          stem_en: string | null
          stimulus_kind: string | null
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          audio_segment_end?: number | null
          audio_segment_start?: number | null
          audio_track_id?: string | null
          content_source?:
            | Database["public"]["Enums"]["qb_content_source"]
            | null
          context_md?: string | null
          correct_answer: Json
          created_at?: string | null
          exam_part_id: string
          explanation_de?: string | null
          explanation_en?: string | null
          id?: string
          item_number: number
          media_id?: string | null
          options?: Json | null
          points?: number | null
          question_format: string
          reading_text_id?: string | null
          source_id?: string | null
          source_ref?: string | null
          stem_de?: string | null
          stem_en?: string | null
          stimulus_kind?: string | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          audio_segment_end?: number | null
          audio_segment_start?: number | null
          audio_track_id?: string | null
          content_source?:
            | Database["public"]["Enums"]["qb_content_source"]
            | null
          context_md?: string | null
          correct_answer?: Json
          created_at?: string | null
          exam_part_id?: string
          explanation_de?: string | null
          explanation_en?: string | null
          id?: string
          item_number?: number
          media_id?: string | null
          options?: Json | null
          points?: number | null
          question_format?: string
          reading_text_id?: string | null
          source_id?: string | null
          source_ref?: string | null
          stem_de?: string | null
          stem_en?: string | null
          stimulus_kind?: string | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qb_questions_audio_track_id_fkey"
            columns: ["audio_track_id"]
            isOneToOne: false
            referencedRelation: "qb_audio_tracks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_questions_exam_part_id_fkey"
            columns: ["exam_part_id"]
            isOneToOne: false
            referencedRelation: "qb_exam_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_questions_exam_part_id_fkey"
            columns: ["exam_part_id"]
            isOneToOne: false
            referencedRelation: "qb_modelltest_flat"
            referencedColumns: ["exam_part_id"]
          },
          {
            foreignKeyName: "qb_questions_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "qb_media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_questions_question_format_fkey"
            columns: ["question_format"]
            isOneToOne: false
            referencedRelation: "qb_question_formats"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "qb_questions_reading_text_id_fkey"
            columns: ["reading_text_id"]
            isOneToOne: false
            referencedRelation: "qb_reading_texts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_questions_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "qb_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      qb_reading_texts: {
        Row: {
          body_md: string | null
          content_source:
            | Database["public"]["Enums"]["qb_content_source"]
            | null
          exam_part_id: string
          id: string
          media_id: string | null
          slug: string | null
          source_attribution: string | null
          title: string | null
          word_count: number | null
        }
        Insert: {
          body_md?: string | null
          content_source?:
            | Database["public"]["Enums"]["qb_content_source"]
            | null
          exam_part_id: string
          id?: string
          media_id?: string | null
          slug?: string | null
          source_attribution?: string | null
          title?: string | null
          word_count?: number | null
        }
        Update: {
          body_md?: string | null
          content_source?:
            | Database["public"]["Enums"]["qb_content_source"]
            | null
          exam_part_id?: string
          id?: string
          media_id?: string | null
          slug?: string | null
          source_attribution?: string | null
          title?: string | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "qb_reading_texts_exam_part_id_fkey"
            columns: ["exam_part_id"]
            isOneToOne: false
            referencedRelation: "qb_exam_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_reading_texts_exam_part_id_fkey"
            columns: ["exam_part_id"]
            isOneToOne: false
            referencedRelation: "qb_modelltest_flat"
            referencedColumns: ["exam_part_id"]
          },
          {
            foreignKeyName: "qb_reading_texts_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "qb_media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      qb_sl_grading_prompts: {
        Row: {
          cert_code: string
          created_at: string
          id: string
          is_active: boolean
          level_code: string
          prompt_md: string
          rubric: Json | null
          source_ref: string | null
          title: string | null
          version: string
        }
        Insert: {
          cert_code: string
          created_at?: string
          id?: string
          is_active?: boolean
          level_code: string
          prompt_md: string
          rubric?: Json | null
          source_ref?: string | null
          title?: string | null
          version: string
        }
        Update: {
          cert_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          level_code?: string
          prompt_md?: string
          rubric?: Json | null
          source_ref?: string | null
          title?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "qb_sl_grading_prompts_cert_code_fkey"
            columns: ["cert_code"]
            isOneToOne: false
            referencedRelation: "qb_certifications"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "qb_sl_grading_prompts_level_code_fkey"
            columns: ["level_code"]
            isOneToOne: false
            referencedRelation: "qb_levels"
            referencedColumns: ["code"]
          },
        ]
      }
      qb_sl_phrases: {
        Row: {
          category: string | null
          cert_code: string
          created_at: string
          display_order: number | null
          id: string
          key: string
          level_code: string
          notes: string | null
          part_code: string
          phrase_de: string
          phrase_en: string | null
          phrase_fr: string | null
        }
        Insert: {
          category?: string | null
          cert_code: string
          created_at?: string
          display_order?: number | null
          id?: string
          key: string
          level_code: string
          notes?: string | null
          part_code: string
          phrase_de: string
          phrase_en?: string | null
          phrase_fr?: string | null
        }
        Update: {
          category?: string | null
          cert_code?: string
          created_at?: string
          display_order?: number | null
          id?: string
          key?: string
          level_code?: string
          notes?: string | null
          part_code?: string
          phrase_de?: string
          phrase_en?: string | null
          phrase_fr?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qb_sl_phrases_cert_code_fkey"
            columns: ["cert_code"]
            isOneToOne: false
            referencedRelation: "qb_certifications"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "qb_sl_phrases_level_code_fkey"
            columns: ["level_code"]
            isOneToOne: false
            referencedRelation: "qb_levels"
            referencedColumns: ["code"]
          },
        ]
      }
      qb_sl_sections: {
        Row: {
          id: string
          model_answer_de: string | null
          notes: string | null
          prompt_de: string
          prompt_en: string | null
          prompt_fr: string | null
          section_key: string
          section_order: number
          topic_id: string
        }
        Insert: {
          id?: string
          model_answer_de?: string | null
          notes?: string | null
          prompt_de: string
          prompt_en?: string | null
          prompt_fr?: string | null
          section_key: string
          section_order: number
          topic_id: string
        }
        Update: {
          id?: string
          model_answer_de?: string | null
          notes?: string | null
          prompt_de?: string
          prompt_en?: string | null
          prompt_fr?: string | null
          section_key?: string
          section_order?: number
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qb_sl_sections_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "qb_sl_topic_flat"
            referencedColumns: ["topic_id"]
          },
          {
            foreignKeyName: "qb_sl_sections_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "qb_sl_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      qb_sl_stichpunkte: {
        Row: {
          id: string
          stichpunkt_de: string
          stichpunkt_order: number
          topic_id: string
        }
        Insert: {
          id?: string
          stichpunkt_de: string
          stichpunkt_order: number
          topic_id: string
        }
        Update: {
          id?: string
          stichpunkt_de?: string
          stichpunkt_order?: number
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qb_sl_stichpunkte_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "qb_sl_topic_flat"
            referencedColumns: ["topic_id"]
          },
          {
            foreignKeyName: "qb_sl_stichpunkte_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "qb_sl_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      qb_sl_topics: {
        Row: {
          cert_code: string
          created_at: string
          decision_question_de: string | null
          id: string
          level_code: string
          module_code: string
          notes: string | null
          ordinal: number | null
          part_code: string
          part_kind: string | null
          situation_de: string | null
          slug: string
          source_id: string | null
          source_ref: string | null
          subtitle_de: string | null
          tags: string[] | null
          title_de: string
          updated_at: string
        }
        Insert: {
          cert_code: string
          created_at?: string
          decision_question_de?: string | null
          id?: string
          level_code: string
          module_code: string
          notes?: string | null
          ordinal?: number | null
          part_code: string
          part_kind?: string | null
          situation_de?: string | null
          slug: string
          source_id?: string | null
          source_ref?: string | null
          subtitle_de?: string | null
          tags?: string[] | null
          title_de: string
          updated_at?: string
        }
        Update: {
          cert_code?: string
          created_at?: string
          decision_question_de?: string | null
          id?: string
          level_code?: string
          module_code?: string
          notes?: string | null
          ordinal?: number | null
          part_code?: string
          part_kind?: string | null
          situation_de?: string | null
          slug?: string
          source_id?: string | null
          source_ref?: string | null
          subtitle_de?: string | null
          tags?: string[] | null
          title_de?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qb_sl_topics_cert_code_fkey"
            columns: ["cert_code"]
            isOneToOne: false
            referencedRelation: "qb_certifications"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "qb_sl_topics_level_code_fkey"
            columns: ["level_code"]
            isOneToOne: false
            referencedRelation: "qb_levels"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "qb_sl_topics_module_code_fkey"
            columns: ["module_code"]
            isOneToOne: false
            referencedRelation: "qb_modules"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "qb_sl_topics_part_kind_fkey"
            columns: ["part_kind"]
            isOneToOne: false
            referencedRelation: "qb_part_kinds"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "qb_sl_topics_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "qb_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      qb_sources: {
        Row: {
          created_at: string | null
          id: string
          isbn: string | null
          language: string | null
          library_path: string | null
          license_note: string | null
          publisher: string | null
          slug: string
          title: string
          year: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          isbn?: string | null
          language?: string | null
          library_path?: string | null
          license_note?: string | null
          publisher?: string | null
          slug: string
          title: string
          year?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          isbn?: string | null
          language?: string | null
          library_path?: string | null
          license_note?: string | null
          publisher?: string | null
          slug?: string
          title?: string
          year?: number | null
        }
        Relationships: []
      }
      qb_speaking_prompts: {
        Row: {
          bullet_points_de: Json | null
          duration_minutes: number | null
          exam_part_id: string
          id: string
          interaction_kind: string | null
          media_id: string | null
          prompt_de: string
          role: string | null
          rubric: Json | null
          source_id: string | null
          teil_number: number
        }
        Insert: {
          bullet_points_de?: Json | null
          duration_minutes?: number | null
          exam_part_id: string
          id?: string
          interaction_kind?: string | null
          media_id?: string | null
          prompt_de: string
          role?: string | null
          rubric?: Json | null
          source_id?: string | null
          teil_number: number
        }
        Update: {
          bullet_points_de?: Json | null
          duration_minutes?: number | null
          exam_part_id?: string
          id?: string
          interaction_kind?: string | null
          media_id?: string | null
          prompt_de?: string
          role?: string | null
          rubric?: Json | null
          source_id?: string | null
          teil_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "qb_speaking_prompts_exam_part_id_fkey"
            columns: ["exam_part_id"]
            isOneToOne: false
            referencedRelation: "qb_exam_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_speaking_prompts_exam_part_id_fkey"
            columns: ["exam_part_id"]
            isOneToOne: false
            referencedRelation: "qb_modelltest_flat"
            referencedColumns: ["exam_part_id"]
          },
          {
            foreignKeyName: "qb_speaking_prompts_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "qb_media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_speaking_prompts_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "qb_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      qb_writing_tasks: {
        Row: {
          aufgabe_number: number
          bullet_points_de: Json | null
          exam_part_id: string
          id: string
          model_answer_de: string | null
          register: string | null
          rubric: Json | null
          scenario_de: string
          source_id: string | null
          target_words: number | null
          text_type: string | null
          title: string | null
        }
        Insert: {
          aufgabe_number: number
          bullet_points_de?: Json | null
          exam_part_id: string
          id?: string
          model_answer_de?: string | null
          register?: string | null
          rubric?: Json | null
          scenario_de: string
          source_id?: string | null
          target_words?: number | null
          text_type?: string | null
          title?: string | null
        }
        Update: {
          aufgabe_number?: number
          bullet_points_de?: Json | null
          exam_part_id?: string
          id?: string
          model_answer_de?: string | null
          register?: string | null
          rubric?: Json | null
          scenario_de?: string
          source_id?: string | null
          target_words?: number | null
          text_type?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qb_writing_tasks_exam_part_id_fkey"
            columns: ["exam_part_id"]
            isOneToOne: false
            referencedRelation: "qb_exam_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_writing_tasks_exam_part_id_fkey"
            columns: ["exam_part_id"]
            isOneToOne: false
            referencedRelation: "qb_modelltest_flat"
            referencedColumns: ["exam_part_id"]
          },
          {
            foreignKeyName: "qb_writing_tasks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "qb_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_attempt_items: {
        Row: {
          answer_key: string | null
          answered_at: string
          attempt_id: string
          is_correct: boolean
          item_id: string
        }
        Insert: {
          answer_key?: string | null
          answered_at?: string
          attempt_id: string
          is_correct?: boolean
          item_id: string
        }
        Update: {
          answer_key?: string | null
          answered_at?: string
          attempt_id?: string
          is_correct?: boolean
          item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_attempt_items_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "reading_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_attempt_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "qb_modelltest_flat"
            referencedColumns: ["question_id"]
          },
          {
            foreignKeyName: "reading_attempt_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "qb_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_attempts: {
        Row: {
          exam_slug: string
          id: string
          modelltest_id: string
          raw_score: number | null
          scaled_score: number | null
          started_at: string
          status: string
          submitted_at: string | null
          user_id: string
        }
        Insert: {
          exam_slug: string
          id?: string
          modelltest_id: string
          raw_score?: number | null
          scaled_score?: number | null
          started_at?: string
          status?: string
          submitted_at?: string | null
          user_id: string
        }
        Update: {
          exam_slug?: string
          id?: string
          modelltest_id?: string
          raw_score?: number | null
          scaled_score?: number | null
          started_at?: string
          status?: string
          submitted_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_attempts_modelltest_id_fkey"
            columns: ["modelltest_id"]
            isOneToOne: false
            referencedRelation: "qb_modelltest_flat"
            referencedColumns: ["modelltest_id"]
          },
          {
            foreignKeyName: "reading_attempts_modelltest_id_fkey"
            columns: ["modelltest_id"]
            isOneToOne: false
            referencedRelation: "qb_modelltests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "entitlements"
            referencedColumns: ["user_id"]
          },
        ]
      }
      sprechen_dialogue_sessions: {
        Row: {
          cert: string
          created_at: string
          elapsed_ms: number
          ended_at: string | null
          grading_job_id: string | null
          id: string
          level: string
          started_at: string
          status: string
          teil: number
          topic_slug: string | null
          turn_count: number
          user_id: string
        }
        Insert: {
          cert?: string
          created_at?: string
          elapsed_ms?: number
          ended_at?: string | null
          grading_job_id?: string | null
          id?: string
          level: string
          started_at?: string
          status?: string
          teil: number
          topic_slug?: string | null
          turn_count?: number
          user_id: string
        }
        Update: {
          cert?: string
          created_at?: string
          elapsed_ms?: number
          ended_at?: string | null
          grading_job_id?: string | null
          id?: string
          level?: string
          started_at?: string
          status?: string
          teil?: number
          topic_slug?: string | null
          turn_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sprechen_dialogue_sessions_grading_job_id_fkey"
            columns: ["grading_job_id"]
            isOneToOne: false
            referencedRelation: "grading_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sprechen_dialogue_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "entitlements"
            referencedColumns: ["user_id"]
          },
        ]
      }
      sprechen_dialogue_turns: {
        Row: {
          audio_storage_path: string | null
          created_at: string
          id: string
          session_id: string
          speaker: string
          transcript: string
          turn_index: number
        }
        Insert: {
          audio_storage_path?: string | null
          created_at?: string
          id?: string
          session_id: string
          speaker: string
          transcript: string
          turn_index: number
        }
        Update: {
          audio_storage_path?: string | null
          created_at?: string
          id?: string
          session_id?: string
          speaker?: string
          transcript?: string
          turn_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "sprechen_dialogue_turns_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sprechen_dialogue_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sprechen_submissions: {
        Row: {
          audio_duration_ms: number | null
          audio_storage_path: string | null
          cert: string
          client_submission_id: string
          created_at: string
          error_code: string | null
          error_message: string | null
          exam_slug: string
          feedback_json: Json | null
          graded_at: string | null
          id: string
          score: number | null
          status: string
          teil: number
          transcript_de: string | null
          uploaded_at: string | null
          user_id: string
        }
        Insert: {
          audio_duration_ms?: number | null
          audio_storage_path?: string | null
          cert?: string
          client_submission_id: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          exam_slug: string
          feedback_json?: Json | null
          graded_at?: string | null
          id?: string
          score?: number | null
          status?: string
          teil: number
          transcript_de?: string | null
          uploaded_at?: string | null
          user_id: string
        }
        Update: {
          audio_duration_ms?: number | null
          audio_storage_path?: string | null
          cert?: string
          client_submission_id?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          exam_slug?: string
          feedback_json?: Json | null
          graded_at?: string | null
          id?: string
          score?: number | null
          status?: string
          teil?: number
          transcript_de?: string | null
          uploaded_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sprechen_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "entitlements"
            referencedColumns: ["user_id"]
          },
        ]
      }
      subscription_audit: {
        Row: {
          action: string
          actor_id: string
          after: Json
          before: Json | null
          created_at: string
          id: string
          reason: string | null
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          actor_id: string
          after: Json
          before?: Json | null
          created_at?: string
          id?: string
          reason?: string | null
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          after?: Json
          before?: Json | null
          created_at?: string
          id?: string
          reason?: string | null
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "entitlements"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "subscription_audit_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount_xaf: number
          assigned_by: string
          created_at: string
          id: string
          note: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_ref: string | null
          plan_id: string
          status: string
          user_id: string
          valid_from: string
          valid_until: string
        }
        Insert: {
          amount_xaf: number
          assigned_by: string
          created_at?: string
          id?: string
          note?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_ref?: string | null
          plan_id: string
          status?: string
          user_id: string
          valid_from: string
          valid_until: string
        }
        Update: {
          amount_xaf?: number
          assigned_by?: string
          created_at?: string
          id?: string
          note?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_ref?: string | null
          plan_id?: string
          status?: string
          user_id?: string
          valid_from?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "entitlements"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "entitlements"
            referencedColumns: ["user_id"]
          },
        ]
      }
      trial_usage: {
        Row: {
          count: number
          kind: Database["public"]["Enums"]["trial_kind"]
          user_id: string
        }
        Insert: {
          count?: number
          kind: Database["public"]["Enums"]["trial_kind"]
          user_id: string
        }
        Update: {
          count?: number
          kind?: Database["public"]["Enums"]["trial_kind"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trial_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "entitlements"
            referencedColumns: ["user_id"]
          },
        ]
      }
      unrecognized_structure_qa: {
        Row: {
          first_seen_at: string
          id: string
          last_seen_at: string
          occurrences: number
          raw_code: string
          submission_id: string
        }
        Insert: {
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          occurrences?: number
          raw_code: string
          submission_id: string
        }
        Update: {
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          occurrences?: number
          raw_code?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unrecognized_structure_qa_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "writing_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_diagnostic_answers: {
        Row: {
          answers: Json
          estimated_level: string
          submitted_at: string
          updated_at: string
          user_id: string
          weakness_tags: string[]
        }
        Insert: {
          answers: Json
          estimated_level: string
          submitted_at?: string
          updated_at?: string
          user_id: string
          weakness_tags?: string[]
        }
        Update: {
          answers?: Json
          estimated_level?: string
          submitted_at?: string
          updated_at?: string
          user_id?: string
          weakness_tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "user_diagnostic_answers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "entitlements"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          exam_board: string
          exam_board_locked_until: string | null
          exam_date: string | null
          exam_level: string
          is_operator: boolean
          preferred_language: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exam_board?: string
          exam_board_locked_until?: string | null
          exam_date?: string | null
          exam_level?: string
          is_operator?: boolean
          preferred_language?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          exam_board?: string
          exam_board_locked_until?: string | null
          exam_date?: string | null
          exam_level?: string
          is_operator?: boolean
          preferred_language?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "entitlements"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_stats: {
        Row: {
          badges: number
          created_at: string
          data_saver_on: boolean
          level: number
          offline_lessons_count: number
          offline_size_mb: number
          reminder_time: string | null
          streak_days: number
          updated_at: string
          user_id: string
          xp: number
        }
        Insert: {
          badges?: number
          created_at?: string
          data_saver_on?: boolean
          level?: number
          offline_lessons_count?: number
          offline_size_mb?: number
          reminder_time?: string | null
          streak_days?: number
          updated_at?: string
          user_id: string
          xp?: number
        }
        Update: {
          badges?: number
          created_at?: string
          data_saver_on?: boolean
          level?: number
          offline_lessons_count?: number
          offline_size_mb?: number
          reminder_time?: string | null
          streak_days?: number
          updated_at?: string
          user_id?: string
          xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "entitlements"
            referencedColumns: ["user_id"]
          },
        ]
      }
      writing_grader_events: {
        Row: {
          created_at: string
          event: string
          id: string
          payload: Json | null
          submission_id: string | null
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          payload?: Json | null
          submission_id?: string | null
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          payload?: Json | null
          submission_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "writing_grader_events_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "writing_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      writing_prompts: {
        Row: {
          bullet_points: Json
          created_at: string
          exam_board: string
          id: string
          max_words: number
          min_words: number
          rubric_version: string | null
          situation_de: string
          slug: string
          source_ref: string
          teil: number
          title_de: string
        }
        Insert: {
          bullet_points: Json
          created_at?: string
          exam_board: string
          id?: string
          max_words?: number
          min_words?: number
          rubric_version?: string | null
          situation_de: string
          slug: string
          source_ref: string
          teil: number
          title_de: string
        }
        Update: {
          bullet_points?: Json
          created_at?: string
          exam_board?: string
          id?: string
          max_words?: number
          min_words?: number
          rubric_version?: string | null
          situation_de?: string
          slug?: string
          source_ref?: string
          teil?: number
          title_de?: string
        }
        Relationships: []
      }
      writing_submissions: {
        Row: {
          blackout_reason: string | null
          body_de: string
          created_at: string
          error_message: string | null
          feedback_json: Json | null
          grade_erfuellung: string | null
          grade_kohaerenz: string | null
          grade_strukturen: string | null
          grade_wortschatz: string | null
          graded_at: string | null
          grader_version: string | null
          id: string
          image_path: string | null
          model_name: string | null
          prompt_id: string
          pts_total: number | null
          rubric_version: string | null
          score_inhalt: number | null
          score_kommunikation: number | null
          score_wortschatz_gram: number | null
          source: string
          status: string
          user_id: string
          word_count: number
        }
        Insert: {
          blackout_reason?: string | null
          body_de: string
          created_at?: string
          error_message?: string | null
          feedback_json?: Json | null
          grade_erfuellung?: string | null
          grade_kohaerenz?: string | null
          grade_strukturen?: string | null
          grade_wortschatz?: string | null
          graded_at?: string | null
          grader_version?: string | null
          id?: string
          image_path?: string | null
          model_name?: string | null
          prompt_id: string
          pts_total?: number | null
          rubric_version?: string | null
          score_inhalt?: number | null
          score_kommunikation?: number | null
          score_wortschatz_gram?: number | null
          source?: string
          status?: string
          user_id: string
          word_count: number
        }
        Update: {
          blackout_reason?: string | null
          body_de?: string
          created_at?: string
          error_message?: string | null
          feedback_json?: Json | null
          grade_erfuellung?: string | null
          grade_kohaerenz?: string | null
          grade_strukturen?: string | null
          grade_wortschatz?: string | null
          graded_at?: string | null
          grader_version?: string | null
          id?: string
          image_path?: string | null
          model_name?: string | null
          prompt_id?: string
          pts_total?: number | null
          rubric_version?: string | null
          score_inhalt?: number | null
          score_kommunikation?: number | null
          score_wortschatz_gram?: number | null
          source?: string
          status?: string
          user_id?: string
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "writing_submissions_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "writing_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writing_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "entitlements"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      entitlements: {
        Row: {
          tier: string | null
          user_id: string | null
          valid_until: string | null
        }
        Insert: {
          tier?: never
          user_id?: string | null
          valid_until?: never
        }
        Update: {
          tier?: never
          user_id?: string | null
          valid_until?: never
        }
        Relationships: []
      }
      qb_modelltest_flat: {
        Row: {
          audio_duration_sec: number | null
          audio_media_key: string | null
          audio_segment_end: number | null
          audio_segment_start: number | null
          audio_track_id: string | null
          cert_code: string | null
          context_md: string | null
          correct_answer: Json | null
          exam_part_id: string | null
          item_number: number | null
          level_code: string | null
          modelltest_id: string | null
          modelltest_module_id: string | null
          modelltest_slug: string | null
          modelltest_title: string | null
          module_code: string | null
          options: Json | null
          part_kind: string | null
          question_format: string | null
          question_id: string | null
          question_media_id: string | null
          question_media_key: string | null
          reading_text_id: string | null
          reading_title: string | null
          reading_word_count: number | null
          source_id: string | null
          source_slug: string | null
          stem_de: string | null
          stem_en: string | null
          stimulus_kind: string | null
          tags: string[] | null
          teil_label: string | null
          teil_number: number | null
        }
        Relationships: [
          {
            foreignKeyName: "qb_exam_parts_part_kind_fkey"
            columns: ["part_kind"]
            isOneToOne: false
            referencedRelation: "qb_part_kinds"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "qb_modelltest_modules_module_code_fkey"
            columns: ["module_code"]
            isOneToOne: false
            referencedRelation: "qb_modules"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "qb_modelltests_cert_code_fkey"
            columns: ["cert_code"]
            isOneToOne: false
            referencedRelation: "qb_certifications"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "qb_modelltests_level_code_fkey"
            columns: ["level_code"]
            isOneToOne: false
            referencedRelation: "qb_levels"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "qb_questions_audio_track_id_fkey"
            columns: ["audio_track_id"]
            isOneToOne: false
            referencedRelation: "qb_audio_tracks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_questions_media_id_fkey"
            columns: ["question_media_id"]
            isOneToOne: false
            referencedRelation: "qb_media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_questions_question_format_fkey"
            columns: ["question_format"]
            isOneToOne: false
            referencedRelation: "qb_question_formats"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "qb_questions_reading_text_id_fkey"
            columns: ["reading_text_id"]
            isOneToOne: false
            referencedRelation: "qb_reading_texts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_questions_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "qb_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      qb_sl_topic_flat: {
        Row: {
          cert_code: string | null
          decision_question_de: string | null
          level_code: string | null
          ordinal: number | null
          part_code: string | null
          part_kind: string | null
          sections: Json | null
          situation_de: string | null
          slug: string | null
          source_ref: string | null
          stichpunkte: Json | null
          subtitle_de: string | null
          title_de: string | null
          topic_id: string | null
        }
        Insert: {
          cert_code?: string | null
          decision_question_de?: string | null
          level_code?: string | null
          ordinal?: number | null
          part_code?: string | null
          part_kind?: string | null
          sections?: never
          situation_de?: string | null
          slug?: string | null
          source_ref?: string | null
          stichpunkte?: never
          subtitle_de?: string | null
          title_de?: string | null
          topic_id?: string | null
        }
        Update: {
          cert_code?: string | null
          decision_question_de?: string | null
          level_code?: string | null
          ordinal?: number | null
          part_code?: string | null
          part_kind?: string | null
          sections?: never
          situation_de?: string | null
          slug?: string | null
          source_ref?: string | null
          stichpunkte?: never
          subtitle_de?: string | null
          title_de?: string | null
          topic_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qb_sl_topics_cert_code_fkey"
            columns: ["cert_code"]
            isOneToOne: false
            referencedRelation: "qb_certifications"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "qb_sl_topics_level_code_fkey"
            columns: ["level_code"]
            isOneToOne: false
            referencedRelation: "qb_levels"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "qb_sl_topics_part_kind_fkey"
            columns: ["part_kind"]
            isOneToOne: false
            referencedRelation: "qb_part_kinds"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Functions: {
      aggregate_missing_structures: {
        Args: { p_days?: number; p_user: string }
        Returns: {
          concept_code: string
          concept_title_de: string
          latest_at: string
          occurrences: number
        }[]
      }
      can_send_coach_message: { Args: { p_user: string }; Returns: boolean }
      can_submit_hoeren: { Args: { p_user: string }; Returns: boolean }
      can_submit_reading: { Args: { p_user: string }; Returns: boolean }
      can_submit_writing: { Args: { p_user: string }; Returns: boolean }
      grading_jobs_reap: { Args: never; Returns: number }
      idempotency_key_reap: { Args: never; Returns: number }
      increment_trial_usage: {
        Args: {
          p_kind: Database["public"]["Enums"]["trial_kind"]
          p_user: string
        }
        Returns: number
      }
      split_missing_structures: {
        Args: { p_structures: Json; p_submission_id: string; p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      payment_method:
        | "cash"
        | "momo"
        | "orange_money"
        | "bank_transfer"
        | "wise"
        | "paypal"
        | "comp"
      qb_content_source: "official" | "licensed" | "synthetic"
      trial_kind:
        | "schreiben_grade"
        | "sprechen_grade"
        | "lesen_set"
        | "hoeren_set"
        | "coach_message"
        | "mock_exam"
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
      payment_method: [
        "cash",
        "momo",
        "orange_money",
        "bank_transfer",
        "wise",
        "paypal",
        "comp",
      ],
      qb_content_source: ["official", "licensed", "synthetic"],
      trial_kind: [
        "schreiben_grade",
        "sprechen_grade",
        "lesen_set",
        "hoeren_set",
        "coach_message",
        "mock_exam",
      ],
    },
  },
} as const
