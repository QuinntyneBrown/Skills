import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import Icon from './Icon';
import styles from './Sidebar.module.css';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  skillId?: string;
}

function getNavItems(skillId?: string) {
  return [
    { to: '/dashboard', icon: 'layout-dashboard', label: 'Dashboard' },
    { to: '/dashboard?view=my', icon: 'file-text', label: 'My Skills' },
    { to: '/dashboard?view=shared', icon: 'users', label: 'Shared with me' },
    { to: skillId ? `/skills/${skillId}/versions` : '/dashboard?view=versions', icon: 'git-branch', label: 'Versions' },
    { to: '/dashboard?view=search', icon: 'search', label: 'Search' },
  ];
}

export default function Sidebar({ isOpen, onClose, skillId }: SidebarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const navItems = getNavItems(skillId);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <>
      {isOpen && <div className={styles.overlay} onClick={onClose} />}
      <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
        <div className={styles.brand}>
          <Icon name="sparkles" size={24} color="var(--accent-primary)" />
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
              <Icon name={item.icon} size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className={styles.spacer} />

        <NavLink to="/settings" className={styles.navItem} onClick={onClose}>
          <Icon name="settings" size={20} />
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
