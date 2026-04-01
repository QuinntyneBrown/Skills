import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import styles from './Sidebar.module.css';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

const navItems = [
  { to: '/dashboard', icon: 'layout-dashboard', label: 'Dashboard' },
  { to: '/dashboard?view=my', icon: 'file-text', label: 'My Skills' },
  { to: '/dashboard?view=shared', icon: 'users', label: 'Shared with me' },
  { to: '/dashboard?view=versions', icon: 'git-branch', label: 'Versions' },
  { to: '/dashboard?view=search', icon: 'search', label: 'Search' },
];

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <>
      {isOpen && <div className={styles.overlay} onClick={onClose} />}
      <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
        <div className={styles.brand}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
          </svg>
          <span className={styles.brandName}>SkillForge</span>
        </div>

        <nav className={styles.nav}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
              onClick={onClose}
            >
              <span className={styles.navIcon} data-icon={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className={styles.spacer} />

        <NavLink to="/settings" className={styles.navItem} onClick={onClose}>
          <span className={styles.navIcon} data-icon="settings" />
          <span>Settings</span>
        </NavLink>

        <div className={styles.profile} data-testid="sidebar-profile">
          <div className={styles.avatar}>
            {user?.email?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className={styles.profileInfo}>
            <span className={styles.profileName}>{user?.email || 'User'}</span>
            <button className={styles.logoutBtn} onClick={handleLogout}>Sign out</button>
          </div>
        </div>
      </aside>
    </>
  );
}
