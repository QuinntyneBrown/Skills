export interface Skill {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  body: string;
  visibility: 'private' | 'shared' | 'public';
  tags: string[];
  version: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  created_by: string;
}

export interface SkillVersion {
  id: string;
  skill_id: string;
  version_number: number;
  name: string;
  description: string | null;
  body: string;
  tags: string[];
  config: Record<string, any>;
  changed_by: string;
  created_at: Date;
}

export interface SkillConfig {
  id: string;
  skill_id: string;
  key: string;
  value: string;
  created_at: Date;
  updated_at: Date;
}

export interface SkillShare {
  id: string;
  skill_id: string;
  shared_with_user_id: string;
  permission: 'read' | 'write';
  created_at: Date;
}
