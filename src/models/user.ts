export interface User {
  id: string;
  email: string;
  password_hash: string | null;
  email_verified: boolean;
  email_verification_token: string | null;
  email_verification_expires_at: Date | null;
  locked_until: Date | null;
  failed_login_attempts: number;
  created_at: Date;
  updated_at: Date;
}

export interface UserWithRoles extends User {
  roles: string[];
}

export interface OAuthAccount {
  id: string;
  user_id: string;
  provider: string;
  provider_user_id: string;
  access_token: string | null;
  created_at: Date;
}

export interface RefreshToken {
  id: string;
  user_id: string;
  token_hash: string;
  family_id: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}
