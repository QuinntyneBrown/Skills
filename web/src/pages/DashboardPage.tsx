import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import Sidebar from '../components/Sidebar';
import { SkeletonTable } from '../components/SkeletonLoader';
import styles from './DashboardPage.module.css';

interface Skill {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  visibility: string;
  updated_at: string;
  version: number;
}

interface PaginatedSkills {
  data: Skill[];
  pagination: {
    page: number;
    page_size: number;
    total_count: number;
    total_pages: number;
  };
}

export default function DashboardPage() {
  const [skills, setSkills] = useState<PaginatedSkills | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Skill | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const page = parseInt(searchParams.get('page') || '1');
  const query = searchParams.get('q') || '';
  const tags = searchParams.get('tags') || '';
  const sort = searchParams.get('sort') || 'updated_at';
  const order = searchParams.get('order') || 'desc';

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { page: String(page), page_size: '25', sort, order };
      if (query) params.q = query;
      if (tags) params.tags = tags;
      const { data } = await api.get<PaginatedSkills>('/skills', { params });
      setSkills(data);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || 'Failed to load skills';
      setError(msg);
      if (err.response?.status === 500) {
        const corrId = err.response?.data?.error?.correlation_id;
        setError(`Something went wrong. ${corrId ? `Correlation ID: ${corrId}` : ''}`);
      }
    } finally {
      setLoading(false);
    }
  }, [page, query, tags, sort, order]);

  useEffect(() => { fetchSkills(); }, [fetchSkills]);

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const q = formData.get('q') as string;
    setSearchParams((prev) => {
      if (q) prev.set('q', q); else prev.delete('q');
      prev.set('page', '1');
      return prev;
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/skills/${deleteTarget.id}`);
      showToast('success', `Skill "${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      fetchSkills();
    } catch {
      showToast('error', 'Failed to delete skill');
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const totalSkills = skills?.pagination.total_count || 0;

  return (
    <div className={styles.layout}>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className={styles.main}>
        {/* Mobile/Tablet Top Bar */}
        <div className={styles.topBar}>
          <button className={styles.menuToggle} onClick={() => setSidebarOpen(true)} aria-label="Open menu" data-testid="menu-toggle">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div className={styles.topBrand}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
            <span>SkillForge</span>
          </div>
        </div>

        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.title}>Dashboard</h1>
            <p className={styles.subtitle}>Manage and organize your skills</p>
          </div>
          <button className={styles.newBtn} onClick={() => navigate('/skills/new')}>+ New Skill</button>
        </div>

        <div className={styles.toolbar}>
          <form onSubmit={handleSearch} className={styles.searchForm}>
            <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--foreground-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input name="q" type="text" placeholder="Search skills by name, tag, or keyword..." className={styles.searchInput} defaultValue={query} />
          </form>
          <div className={styles.toolbarActions}>
            <button className={styles.toolbarBtn} aria-label="Filter">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              Filters
            </button>
            <button className={styles.toolbarBtn} aria-label="Sort">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/></svg>
              Sort
            </button>
          </div>
        </div>

        <div className={styles.stats}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Total Skills</div>
            <div className={styles.statSub}>{totalSkills} skills in your library</div>
            <div className={styles.statValue}>{totalSkills}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Shared</div>
            <div className={styles.statSub}>Skills shared with your team</div>
            <div className={styles.statValue}>{skills?.data.filter(s => s.visibility === 'shared').length || 0}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Recent Edits</div>
            <div className={styles.statSub}>Edits in the last 7 days</div>
            <div className={styles.statValue}>{skills?.data.filter(s => new Date(s.updated_at) > new Date(Date.now() - 7 * 86400000)).length || 0}</div>
          </div>
        </div>

        <div className={styles.tableContainer}>
          {loading ? (
            <SkeletonTable rows={5} />
          ) : error ? (
            <div className={styles.errorState}>
              <p>Something went wrong</p>
              <p className={styles.errorDetail}>{error}</p>
              <button onClick={fetchSkills} className={styles.retryBtn}>Try Again</button>
            </div>
          ) : (
            <>
              <table className={styles.table}>
                <thead>
                  <tr><th>Name</th><th>Tags</th><th>Visibility</th><th>Updated</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {skills?.data.map((skill) => (
                    <tr key={skill.id} className={styles.skillRow} data-testid="skill-row" onClick={() => navigate(`/skills/${skill.id}/edit`)}>
                      <td>
                        <div className={styles.skillName}>{skill.name}</div>
                        <div className={styles.skillDesc}>{skill.description}</div>
                      </td>
                      <td>
                        <div className={styles.tagList}>
                          {skill.tags.slice(0, 3).map((tag) => (<span key={tag} className={styles.badge}>{tag}</span>))}
                        </div>
                      </td>
                      <td><span className={`${styles.visBadge} ${styles[`vis${skill.visibility}`]}`}>{skill.visibility}</span></td>
                      <td className={styles.dateCell}>{formatDate(skill.updated_at)}</td>
                      <td>
                        <button className={styles.actionBtn} data-testid="delete-action" aria-label="Delete skill" onClick={(e) => { e.stopPropagation(); setDeleteTarget(skill); }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {skills?.data.length === 0 && (<tr><td colSpan={5} className={styles.emptyState}>No skills found. Create your first skill!</td></tr>)}
                </tbody>
              </table>
              {skills && skills.pagination.total_pages > 0 && (
                <div className={styles.pagination}>
                  <span className={styles.pageInfo}>Showing {((page - 1) * skills.pagination.page_size) + 1}-{Math.min(page * skills.pagination.page_size, skills.pagination.total_count)} of {skills.pagination.total_count} skills</span>
                  <div className={styles.pageControls}>
                    <button disabled={page <= 1} onClick={() => setSearchParams((p) => { p.set('page', String(page - 1)); return p; })} className={styles.pageBtn}>‹ Prev</button>
                    {Array.from({ length: Math.min(5, skills.pagination.total_pages) }, (_, i) => i + 1).map((p) => (
                      <button key={p} className={`${styles.pageBtn} ${p === page ? styles.pageBtnActive : ''}`} onClick={() => setSearchParams((prev) => { prev.set('page', String(p)); return prev; })}>{p}</button>
                    ))}
                    <button disabled={page >= (skills?.pagination.total_pages || 1)} onClick={() => setSearchParams((p) => { p.set('page', String(page + 1)); return p; })} className={styles.pageBtn}>Next ›</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {deleteTarget && (
        <div className={styles.dialogOverlay} onClick={() => setDeleteTarget(null)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogHeader}><h3>Delete Skill?</h3><button className={styles.dialogClose} onClick={() => setDeleteTarget(null)}>×</button></div>
            <p className={styles.dialogBody}>This action will soft-delete the skill. You can recover it later from the admin panel.</p>
            <div className={styles.dialogActions}>
              <button className={styles.cancelBtn} onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className={styles.deleteBtn} onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
