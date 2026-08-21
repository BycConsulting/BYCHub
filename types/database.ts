export type UserRole = 'admin' | 'employee'
export type ClientStatus = 'prospect' | 'active' | 'paused' | 'lost'
export type LeadStage = 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost'
export type ActivityType = 'note' | 'call' | 'email' | 'stage_change'
export type EmploymentType = 'full_time' | 'part_time' | 'contract'
export type EmployeeProfileField =
  | 'phone'
  | 'address'
  | 'emergency_contact_name'
  | 'emergency_contact_phone'
  | 'date_of_birth'
export type ProfileRequestStatus = 'pending' | 'approved' | 'rejected'

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          name: string
          role: UserRole
          is_active: boolean
          created_at: string
        }
        Insert: { id: string; email: string; name: string; role?: UserRole; is_active?: boolean }
        Update: { name?: string; role?: UserRole; is_active?: boolean }
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
      employee_profiles: {
        Row: {
          user_id: string
          phone: string | null
          address: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          date_of_birth: string | null
          designation: string | null
          department: string | null
          employment_start_date: string | null
          employment_type: EmploymentType | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          phone?: string | null
          address?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          date_of_birth?: string | null
          designation?: string | null
          department?: string | null
          employment_start_date?: string | null
          employment_type?: EmploymentType | null
        }
        Update: Partial<{
          phone: string | null
          address: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          date_of_birth: string | null
          designation: string | null
          department: string | null
          employment_start_date: string | null
          employment_type: EmploymentType | null
          updated_at: string
        }>
        Relationships: []
      }
      employee_profile_requests: {
        Row: {
          id: string
          user_id: string
          field: EmployeeProfileField
          proposed_value: string
          status: ProfileRequestStatus
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
        }
        Insert: {
          user_id: string
          field: EmployeeProfileField
          proposed_value: string
        }
        Update: Partial<{
          status: ProfileRequestStatus
          reviewed_by: string | null
          reviewed_at: string | null
        }>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}
