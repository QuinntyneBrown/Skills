import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import Sidebar from '../components/Sidebar';
import styles from './VersionHistoryPage.module.css';

interface SkillDetail {
  id: string;
  name: string;
  version: number;
}

interface SkillVersion {
  id: string;
  skill_id: string;
  version_number: number;
  name: string;
  description: string | null;
  body: string;
  tags: string[];
  changed_by: string;
  created_at: string;
}

interface DiffLine {
  type: 'add' | 'remove' | 'unchanged';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

interface DiffResult {
  field: string;
  changes: DiffLine[];
}

interface VersionDiffResponse {
  diffs: DiffResult[];
  stats: { additions: number; deletions: number };
}

type DiffViewMode = 'unified' | 'side-by-side';
type MobileTab = 'list' | 'diff';

export default function VersionHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [skill, setSkill] = useState<SkillDetail | null>(null);
  const [versions, setVersions] = useState<SkillVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [compareVersion, setCompareVersion] = useState<number | null>(null);
  const [diff, setDiff] = useState<VersionDiffResponse | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>('unified');
  const [mobileTab, setMobileTab] = useState<MobileTab>('list');
  const [restoring, setRestoring] = useState(false);

  // Fetch skill details and versions
  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [skillRes, versionsRes] = await Promise.all([
        api.get<{ data: SkillDetail }>(`/skills/${id}`),
        api.get<{ data: SkillVersion[]; pagination: unknown }>(`/skills/${id}/versions`),
      ]);
      setSkill(skillRes.data.data);
      const sorted = [...versionsRes.data.data].sort(
        (a, b) => b.version_number - a.version_number
      );
      setVersions(sorted);

      // Auto-select latest two versions for comparison
      if (sorted.length >= 2) {
        setSelectedVersion(sorted[0].version_number);
        setCompareVersion(sorted[1].version_number);
      } else if (sorted.length === 1) {
        setSelectedVersion(sorted[0].version_number);
        // Generate a synthetic diff for single version (show all content as additions)
        const singleVersion = sorted[0];
        const bodyLines = (singleVersion.body || '').split('\n');
        const syntheticDiff: VersionDiffResponse = {
          diffs: [
            {
              field: 'body',
              changes: bodyLines.map((line, idx) => ({
                type: 'add' as const,
                content: line,
                newLineNumber: idx + 1,
              })),
            },
          ],
          stats: {
            additions: bodyLines.length,
            deletions: 0,
          },
        };
        setDiff(syntheticDiff);
        setCompareVersion(0); // virtual "empty" version
      }
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: { message?: string } }; status?: number } };
      const msg =
        axErr.response?.data?.error?.message || 'Failed to load version history';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch diff when two versions are selected
  useEffect(() => {
    if (!id || selectedVersion == null || compareVersion == null) {
      setDiff(null);
      return;
    }
    const lower = Math.min(selectedVersion, compareVersion);
    const upper = Math.max(selectedVersion, compareVersion);
    if (lower === upper) {
      setDiff(null);
      return;
    }
    // Skip API fetch for synthetic diff (compareVersion === 0 means initial empty state)
    if (lower === 0) {
      return;
    }

    let cancelled = false;
    const fetchDiff = async () => {
      setDiffLoading(true);
      try {
        const { data } = await api.get<VersionDiffResponse>(
          `/skills/${id}/versions/${lower}/diff/${upper}`
        );
        if (!cancelled) setDiff(data);
      } catch {
        if (!cancelled) {
          showToast('error', 'Failed to load diff');
          setDiff(null);
        }
      } finally {
        if (!cancelled) setDiffLoading(false);
      }
    };
    fetchDiff();
    return () => {
      cancelled = true;
    };
  }, [id, selectedVersion, compareVersion, showToast]);

  // Handle version card click - toggle selection for comparison
  const handleVersionClick = (versionNumber: number) => {
    if (selectedVersion === versionNumber) {
      // Deselect
      setSelectedVersion(compareVersion);
      setCompareVersion(null);
    } else if (compareVersion === versionNumber) {
      setCompareVersion(null);
    } else if (selectedVersion == null) {
      setSelectedVersion(versionNumber);
    } else if (compareVersion == null) {
      setCompareVersion(versionNumber);
      setMobileTab('diff');
    } else {
      // Replace compare version
      setCompareVersion(versionNumber);
      setMobileTab('diff');
    }
  };

  const handleRestore = async () => {
    if (!id || selectedVersion == null) return;
    setRestoring(true);
    try {
      await api.post(`/skills/${id}/versions/${selectedVersion}/restore`);
      showToast('success', `Restored to v${selectedVersion}`);
      fetchData();
    } catch {
      showToast('error', 'Failed to restore version');
    } finally {
      setRestoring(false);
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const maxVersion = versions.length > 0 ? versions[0].version_number : 0;

  const lowerV =
    selectedVersion != null && compareVersion != null
      ? Math.min(selectedVersion, compareVersion)
      : null;
  const upperV =
    selectedVersion != null && compareVersion != null
      ? Math.max(selectedVersion, compareVersion)
      : null;

  // Render
  if (loading) {
    return (
      <div className={styles.layout}>
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className={styles.main}>
          <div className={styles.loading}>Loading version history...</div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.layout}>
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className={styles.main}>
          <div className={styles.errorState}>
            <p>Something went wrong</p>
            <p className={styles.errorDetail}>{error}</p>
            <button onClick={fetchData} className={styles.retryBtn}>
              Try Again
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className={styles.main}>
        {/* Mobile/Tablet Top Bar */}
        <div className={styles.topBar}>
          <button
            className={styles.menuToggle}
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <button className={styles.backBtn} onClick={() => navigate(-1)}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            Back
          </button>
        </div>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h1 className={styles.title}>
              {skill?.name ?? 'Skill'} &mdash; Version History
            </h1>
            <p className={styles.subtitle}>
              {versions.length} version{versions.length !== 1 ? 's' : ''} &middot;
              Select two versions to compare
            </p>
          </div>
          <button
            className={styles.restoreBtn}
            onClick={handleRestore}
            disabled={
              restoring ||
              selectedVersion == null ||
              selectedVersion === maxVersion
            }
          >
            {restoring ? 'Restoring...' : 'Restore Selected'}
          </button>
        </div>

        {/* Mobile Tabs */}
        <div className={styles.mobileTabs}>
          <button
            className={`${styles.mobileTab} ${mobileTab === 'list' ? styles.mobileTabActive : ''}`}
            onClick={() => setMobileTab('list')}
          >
            List
          </button>
          <button
            className={`${styles.mobileTab} ${mobileTab === 'diff' ? styles.mobileTabActive : ''}`}
            onClick={() => setMobileTab('diff')}
          >
            Diff
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {/* Version List */}
          <div
            className={`${styles.versionList} ${mobileTab !== 'list' ? styles.mobileHidden : ''}`}
          >
            {versions.map((v) => {
              const isActive =
                v.version_number === selectedVersion ||
                v.version_number === compareVersion;
              return (
                <div
                  key={v.id}
                  className={`${styles.versionCard} ${isActive ? styles.versionCardActive : ''}`}
                  onClick={() => handleVersionClick(v.version_number)}
                >
                  <div className={styles.versionNumber}>
                    v{v.version_number}
                    {v.version_number === maxVersion && (
                      <span className={styles.versionCurrent}>current</span>
                    )}
                  </div>
                  {v.description && (
                    <div className={styles.versionSummary}>{v.description}</div>
                  )}
                  <div className={styles.versionMeta}>
                    {formatDate(v.created_at)} &middot; {v.changed_by}
                  </div>
                </div>
              );
            })}
            {versions.length === 0 && (
              <div className={styles.emptyDiff}>No versions found</div>
            )}
          </div>

          {/* Diff Panel */}
          <div
            className={`${styles.diffPanel} ${mobileTab !== 'diff' ? styles.mobileHidden : ''}`}
          >
            {diffLoading ? (
              <div className={styles.loading}>Loading diff...</div>
            ) : diff && lowerV != null && upperV != null ? (
              <>
                <div className={styles.diffHeader} data-testid="diff-viewer">
                  <span className={styles.diffTitle}>
                    Comparing v{lowerV} &rarr; v{upperV}
                  </span>
                  <div className={styles.diffTabs}>
                    <button
                      className={`${styles.diffTab} ${diffViewMode === 'unified' ? styles.diffTabActive : ''}`}
                      onClick={() => setDiffViewMode('unified')}
                    >
                      Unified
                    </button>
                    <button
                      className={`${styles.diffTab} ${diffViewMode === 'side-by-side' ? styles.diffTabActive : ''}`}
                      onClick={() => setDiffViewMode('side-by-side')}
                    >
                      Side by Side
                    </button>
                  </div>
                </div>

                {diffViewMode === 'unified' ? (
                  <div className={styles.diffContent}>
                    {diff.diffs.map((result) => (
                      <div key={result.field}>
                        <div className={styles.diffFieldHeader}>
                          {result.field}
                        </div>
                        {result.changes.map((line, i) => (
                          <div
                            key={i}
                            className={`${styles.diffLine} ${
                              line.type === 'add'
                                ? styles.lineAdded
                                : line.type === 'remove'
                                  ? styles.lineRemoved
                                  : styles.lineUnchanged
                            }`}
                            data-testid={line.type === 'add' ? 'diff-addition' : line.type === 'remove' ? 'diff-deletion' : undefined}
                          >
                            <span className={styles.lineNumber}>
                              {line.type === 'remove'
                                ? line.oldLineNumber ?? ''
                                : line.newLineNumber ?? ''}
                            </span>
                            {line.type === 'add'
                              ? '+ '
                              : line.type === 'remove'
                                ? '- '
                                : '  '}
                            {line.content}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.diffContent}>
                    {diff.diffs.map((result) => (
                      <div key={result.field}>
                        <div className={styles.diffFieldHeader}>
                          {result.field}
                        </div>
                        <div className={styles.sideBySide}>
                          <div className={styles.sideBySidePanel}>
                            <div className={styles.sideBySidePanelHeader}>
                              v{lowerV}
                            </div>
                            {result.changes
                              .filter((l) => l.type !== 'add')
                              .map((line, i) => (
                                <div
                                  key={i}
                                  className={`${styles.diffLine} ${
                                    line.type === 'remove'
                                      ? styles.lineRemoved
                                      : styles.lineUnchanged
                                  }`}
                                >
                                  <span className={styles.lineNumber}>
                                    {line.oldLineNumber ?? ''}
                                  </span>
                                  {line.type === 'remove' ? '- ' : '  '}
                                  {line.content}
                                </div>
                              ))}
                          </div>
                          <div className={styles.sideBySidePanel}>
                            <div className={styles.sideBySidePanelHeader}>
                              v{upperV}
                            </div>
                            {result.changes
                              .filter((l) => l.type !== 'remove')
                              .map((line, i) => (
                                <div
                                  key={i}
                                  className={`${styles.diffLine} ${
                                    line.type === 'add'
                                      ? styles.lineAdded
                                      : styles.lineUnchanged
                                  }`}
                                >
                                  <span className={styles.lineNumber}>
                                    {line.newLineNumber ?? ''}
                                  </span>
                                  {line.type === 'add' ? '+ ' : '  '}
                                  {line.content}
                                </div>
                              ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className={styles.diffStats}>
                  <span className={styles.statAdditions}>
                    +{diff.stats.additions} addition
                    {diff.stats.additions !== 1 ? 's' : ''}
                  </span>
                  <span className={styles.statDeletions}>
                    {diff.stats.deletions} deletion
                    {diff.stats.deletions !== 1 ? 's' : ''}
                  </span>
                </div>
              </>
            ) : (
              <div className={styles.emptyDiff}>
                {selectedVersion != null && compareVersion == null
                  ? 'Select a second version to compare'
                  : 'Select two versions to see a diff'}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
