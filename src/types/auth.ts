export interface LoginFormData {
  email: string
  password: string
}

export interface SignupFormData extends LoginFormData {
  confirmPassword: string
}

export interface Profile {
  id: string
  user_id: string
  display_name: string | null
  role: string
  organization: string
  created_at?: string
  updated_at?: string
}

export interface AuthError {
  message: string
  status?: number
}

export type AuthMode = 'login' | 'signup'
