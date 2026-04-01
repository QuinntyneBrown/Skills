import { useState } from 'react';
import styles from './ShareDialog.module.css';

interface SharedUser {
  email: string;
  permission: 'read' | 'write';
}

interface ShareDialogProps {
  skillName: string;
  visibility: string;
  onVisibilityChange: (v: string) => void;
  onClose: () => void;
  onSave: (visibility: string, sharedUsers: SharedUser[]) => void;
}

export default function ShareDialog({ skillName, visibility, onVisibilityChange, onClose, onSave }: ShareDialogProps) {
  const [localVisibility, setLocalVisibility] = useState(visibility);
  const [sharedUsers, setSharedUsers] = useState<SharedUser[]>([]);
  const [emailInput, setEmailInput] = useState('');

  const handleVisibilityChange = (v: string) => {
    setLocalVisibility(v);
    onVisibilityChange(v);
  };

  const handleAddUser = () => {
    const email = emailInput.trim();
    if (!email || sharedUsers.some((u) => u.email === email)) return;
    setSharedUsers((prev) => [...prev, { email, permission: 'read' }]);
    setEmailInput('');
  };

  const handlePermissionChange = (email: string, permission: 'read' | 'write') => {
    setSharedUsers((prev) => prev.map((u) => (u.email === email ? { ...u, permission } : u)));
  };

  const handleRemoveUser = (email: string) => {
    setSharedUsers((prev) => prev.filter((u) => u.email !== email));
  };

  const handleSave = () => {
    onSave(localVisibility, sharedUsers);
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
        <div className={styles.header}>
          <h3 className={styles.title}>Share &apos;{skillName}&apos;</h3>
          <p className={styles.subtitle}>Control who can view and edit this skill</p>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Visibility</div>
          <div className={styles.radioGroup}>
            <label className={styles.radioOption}>
              <input
                type="radio"
                name="visibility"
                value="public"
                checked={localVisibility === 'public'}
                onChange={() => handleVisibilityChange('public')}
              />
              <div>
                <div className={styles.radioLabel}>Public</div>
                <div className={styles.radioDesc}>Anyone can view this skill</div>
              </div>
            </label>
            <label className={styles.radioOption}>
              <input
                type="radio"
                name="visibility"
                value="shared"
                checked={localVisibility === 'shared'}
                onChange={() => handleVisibilityChange('shared')}
              />
              <div>
                <div className={styles.radioLabel}>Shared</div>
                <div className={styles.radioDesc}>Only people you share with can view</div>
              </div>
            </label>
            <label className={styles.radioOption}>
              <input
                type="radio"
                name="visibility"
                value="private"
                checked={localVisibility === 'private'}
                onChange={() => handleVisibilityChange('private')}
              />
              <div>
                <div className={styles.radioLabel}>Private</div>
                <div className={styles.radioDesc}>Only you can view and edit</div>
              </div>
            </label>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Share with people</div>
          <div className={styles.shareInput}>
            <input
              type="email"
              className={styles.emailInput}
              placeholder="Enter email address..."
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddUser(); } }}
            />
            <button className={styles.addBtn} onClick={handleAddUser}>Add</button>
          </div>
          {sharedUsers.length > 0 && (
            <div className={styles.userList}>
              {sharedUsers.map((user) => (
                <div key={user.email} className={styles.userRow}>
                  <span className={styles.userEmail}>{user.email}</span>
                  <div className={styles.userActions}>
                    <select
                      className={styles.permSelect}
                      value={user.permission}
                      onChange={(e) => handlePermissionChange(user.email, e.target.value as 'read' | 'write')}
                    >
                      <option value="read">Read</option>
                      <option value="write">Write</option>
                    </select>
                    <button className={styles.removeBtn} onClick={() => handleRemoveUser(user.email)} aria-label="Remove">&times;</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}
