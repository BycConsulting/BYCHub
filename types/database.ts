export type UserRole = 'admin' | 'employee'
export type ClientStatus = 'prospect' | 'active' | 'paused' | 'lost'
export type LeadStage = 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost'
export type ActivityType = 'note' | 'call' | 'email' | 'stage_change'
export type ChatProvider = 'claude' | 'chatgpt'
export type ChatMessageRole = 'user' | 'assistant'

export interface Database {
  public: {
    Tables: {
      users: {
        Row: { id: string; email: string; name: string; role: UserRole; created_at: string }
        Insert: { id: string; email: string; name: string; role?: UserRole }
        Update: { name?: string; role?: UserRole }
        Relationships: []
      }
      clients: {
        Row: { id: string; name: string; status: ClientStatus; owner_user_id: string | null; created_at: string }
        Insert: { name: string; status?: ClientStatus; owner_user_id?: string | null }
        Update: { name?: string; status?: ClientStatus; owner_user_id?: string | null }
        Relationships: []
      }
      leads: {
        Row: {
          id: string
          client_id: string | null
          source: string | null
          contact_name: string
          contact_email: string | null
          contact_company: string | null
          stage: LeadStage
          fit_score: number | null
          assigned_user_id: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          source?: string | null
          contact_name: string
          contact_email?: string | null
          contact_company?: string | null
          stage?: LeadStage
          fit_score?: number | null
          assigned_user_id?: string | null
          notes?: string | null
        }
        Update: Partial<{
          client_id: string | null
          stage: LeadStage
          fit_score: number | null
          assigned_user_id: string | null
          notes: string | null
          updated_at: string
        }>
        Relationships: []
      }
      activities: {
        Row: {
          id: string
          lead_id: string | null
          client_id: string | null
          user_id: string
          type: ActivityType
          body: string | null
          created_at: string
        }
        Insert: {
          lead_id?: string | null
          client_id?: string | null
          user_id: string
          type: ActivityType
          body?: string | null
        }
        Update: never
        Relationships: []
      }
      chat_conversations: {
        Row: {
          id: string
          user_id: string
          title: string
          provider: ChatProvider
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          title?: string
          provider: ChatProvider
        }
        Update: {
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          id: string
          conversation_id: string
          user_id: string
          role: ChatMessageRole
          content: string
          created_at: string
        }
        Insert: {
          conversation_id: string
          user_id: string
          role: ChatMessageRole
          content: string
        }
        Update: never
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}
