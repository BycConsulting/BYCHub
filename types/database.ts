export type UserRole = 'admin' | 'hr' | 'employee'
export type ClientStatus = 'prospect' | 'active' | 'paused' | 'lost'
export type LeadStage = 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost'
export type ActivityType = 'note' | 'call' | 'email' | 'stage_change'
export type EmploymentType = 'full_time' | 'part_time' | 'contract'
export type Module = 'dashboard' | 'leads' | 'clients' | 'hr' | 'settings' | 'directory'
export type ConfigurableRole = 'hr' | 'employee'
export type LeaveRequestType = 'casual' | 'sick' | 'earned' | 'maternity' | 'paternity' | 'wfh'
export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

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
          manager_id: string | null
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
          manager_id?: string | null
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
          manager_id: string | null
          updated_at: string
        }>
        Relationships: []
      }
      role_module_access: {
        Row: {
          role: ConfigurableRole
          module: Module
          enabled: boolean
        }
        Insert: {
          role: ConfigurableRole
          module: Module
          enabled?: boolean
        }
        Update: Partial<{
          enabled: boolean
        }>
        Relationships: []
      }
      hr_config: {
        Row: {
          id: boolean
          working_monday: boolean
          working_tuesday: boolean
          working_wednesday: boolean
          working_thursday: boolean
          working_friday: boolean
          working_saturday: boolean
          working_sunday: boolean
          office_ip_allowlist: string
          casual_leave_days: number
          sick_leave_days: number
          earned_leave_days: number
          maternity_leave_days: number
          paternity_leave_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          working_monday?: boolean
          working_tuesday?: boolean
          working_wednesday?: boolean
          working_thursday?: boolean
          working_friday?: boolean
          working_saturday?: boolean
          working_sunday?: boolean
          office_ip_allowlist?: string
          casual_leave_days?: number
          sick_leave_days?: number
          earned_leave_days?: number
          maternity_leave_days?: number
          paternity_leave_days?: number
          updated_by?: string | null
        }
        Update: Partial<{
          working_monday: boolean
          working_tuesday: boolean
          working_wednesday: boolean
          working_thursday: boolean
          working_friday: boolean
          working_saturday: boolean
          office_ip_allowlist: string
          casual_leave_days: number
          sick_leave_days: number
          earned_leave_days: number
          maternity_leave_days: number
          paternity_leave_days: number
          updated_at: string
          updated_by: string | null
        }>
        Relationships: []
      }
      leave_requests: {
        Row: {
          id: string
          user_id: string
          type: LeaveRequestType
          start_date: string
          end_date: string
          reason: string
          status: LeaveRequestStatus
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
        }
        Insert: {
          user_id: string
          type: LeaveRequestType
          start_date: string
          end_date: string
          reason: string
        }
        Update: Partial<{
          status: LeaveRequestStatus
          reviewed_by: string | null
          reviewed_at: string | null
        }>
        Relationships: []
      }
      attendance_records: {
        Row: {
          id: string
          user_id: string
          date: string
          checked_in_at: string | null
          checked_in_ip: string | null
          checked_out_at: string | null
          checked_out_ip: string | null
          created_at: string
        }
        Insert: {
          user_id: string
          date: string
          checked_in_at?: string | null
          checked_in_ip?: string | null
        }
        Update: Partial<{
          checked_in_at: string | null
          checked_in_ip: string | null
          checked_out_at: string | null
          checked_out_ip: string | null
        }>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}
