import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Editor, { type OnMount } from '@monaco-editor/react';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import Sidebar from '../components/Sidebar';
import ShareDialog from '../components/ShareDialog';
import styles from './SkillEditorPage.module.css';

interface SkillData {
  id: string;
  name: string;
  description: string | null;
  body: string;
  tags: string[];
  visibility: string;
  version: number;
  updated_at: string;
}

type EditorInstance = Parameters<OnMount>[0];

function basicMarkdownToHtml(md: string): string {
  let html = md
    // code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // bold and italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // blockquote
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // horizontal rule
    .replace(/^---$/gm, '<hr/>')
    // unordered list items
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // paragraphs: wrap standalone lines
    .replace(/^(?!<[hublop/]|<li|<hr|<blockquote|<pre|<code)(.+)$/gm, '<p>$1</p>');

  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li>.*<\/li>\s*)+)/g, '<ul>$1</ul>');

  return html;
}

export default function SkillEditorPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const isNew = location.pathname === '/skills/new';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [version, setVersion] = useState(1);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'preview' | 'meta'>('editor');
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);
  const [nameError, setNameError] = useState('');

  const editorRef = useRef<EditorInstance | null>(null);

  // Fetch skill data when editing
  useEffect(() => {
    if (isNew || !id) return;
    let cancelled = false;
    const fetchSkill = async () => {
      try {
        const res = await api.get<{ data: SkillData }>(`/skills/${id}`);
        if (cancelled) return;
        const skill = res.data.data;
        setName(skill.name);
        setDescription(skill.description || '');
        setContent(skill.body || '');
        setTags(skill.tags?.join(', ') || '');
        setVisibility(skill.visibility);
        setVersion(skill.version);
      } catch {
        showToast('error', 'Failed to load skill');
        navigate('/dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchSkill();
    return () => { cancelled = true; };
  }, [id, isNew, navigate, showToast]);

  // Save handler
  const handleSave = useCallback(async () => {
    setNameError('');
    if (!name.trim()) {
      setNameError('Name is required');
      showToast('warning', 'Please enter a skill name');
      return;
    }
    if (name.trim().length > 200) {
      setNameError('Name must be 200 characters or fewer');
      showToast('warning', 'Please shorten the name (max 200)');
      return;
    }
    setSaving(true);
    try {
      const basePayload = {
        name: name.trim(),
        description: description.trim() || null,
        body: content?.trim() ? content : '(empty)',
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        visibility,
      };
      if (isNew) {
        const res = await api.post<{ data: SkillData }>('/skills', basePayload);
        showToast('success', 'Skill created');
        navigate(`/skills/${res.data.data.id}/edit`, { replace: true });
      } else {
        await api.patch(`/skills/${id}`, { ...basePayload, version });
        setVersion((v) => v + 1);
        showToast('success', 'Skill saved');
      }
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to save skill';
      showToast('error', message);
    } finally {
      setSaving(false);
    }
  }, [name, description, content, tags, visibility, isNew, id, version, navigate, showToast]);

  // Ctrl+S shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave]);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.onDidChangeCursorPosition((e) => {
      setCursorLine(e.position.lineNumber);
      setCursorCol(e.position.column);
    });
  };

  const handleShareSave = (newVisibility: string, _sharedUsers: { email: string; permission: string }[]) => {
    setVisibility(newVisibility);
    setShareOpen(false);
    showToast('success', 'Share settings updated');
  };


  if (loading) {
    return (
      <div className={styles.layout}>
        <div className={styles.main}>
          <div className={styles.loadingState}>Loading skill...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <div className={styles.sidebarDesktop}>
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} skillId={isNew ? undefined : id} />
      </div>

      <div className={styles.main}>
        {/* Top Bar */}
        <div className={styles.topBar}>
          <div className={styles.topBarLeft}>
            <button className={styles.backBtn} onClick={() => navigate('/dashboard')} aria-label="Back" data-testid="back-button">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <span className={styles.breadcrumb}>
              <button className={styles.breadcrumbLink} onClick={() => navigate('/dashboard')}>My Skills</button>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--foreground-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
              <span className={styles.breadcrumbCurrent}>{name || 'New Skill'}</span>
            </span>
            <span className={styles.topBarTitle}>{name || 'New Skill'}</span>
          </div>
          <div className={styles.topBarRight}>
            {!isNew && id && (
              <button className={styles.shareBtn} onClick={() => navigate(`/skills/${id}/versions`)} aria-label="View versions">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="6" y1="3" x2="6" y2="15" />
                  <circle cx="18" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <path d="M18 9a9 9 0 0 1-9 9" />
                </svg>
                <span>History</span>
              </button>
            )}
            <button className={styles.shareBtn} onClick={() => setShareOpen(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              <span>Share</span>
            </button>
            <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M17 21v-7H7v7"/><path d="M7 3v4h7"/></svg>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {/* Metadata Bar */}
        <div className={styles.meta}>
          <div className={styles.metaGroup}>
            <span className={styles.metaLabel}>Name</span>
            <span className={styles.metaValue}>{name || 'Untitled'}</span>
          </div>
          <div className={styles.metaSep} />
          <div className={styles.metaGroup}>
            <span className={styles.metaLabel}>Tags</span>
            <div className={styles.metaTags}>
              {tags.split(',').filter(Boolean).map((t) => (
                <span key={t.trim()} className={styles.metaBadgeInfo}>{t.trim()}</span>
              ))}
              {!tags.trim() && <span className={styles.metaBadge}>none</span>}
            </div>
          </div>
          <div className={styles.metaSep} />
          <div className={styles.metaGroup}>
            <span className={styles.metaLabel}>Visibility</span>
            <span className={visibility === 'public' ? styles.metaBadgeSuccess : visibility === 'shared' ? styles.metaBadgeWarning : styles.metaBadge}>{visibility}</span>
          </div>
        </div>

        {/* Form Section */}
        <div className={styles.formSection}>
          <div className={styles.formGrid}>
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="skill-name">Name</label>
              <input
                id="skill-name"
                className={styles.formInput}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Skill name..."
              />
              {nameError && <span className={styles.fieldError}>{nameError}</span>}
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="skill-description">Description</label>
              <textarea
                id="skill-description"
                className={styles.formTextarea}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this skill..."
                rows={2}
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Tags (comma-separated)</label>
              <input
                className={styles.formInput}
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="api, error-handling, typescript..."
              />
            </div>
          </div>
        </div>

        {/* Tabs (tablet / mobile) */}
        <div className={styles.tabs} role="tablist">
          <button
            role="tab"
            className={`${styles.tab} ${activeTab === 'editor' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('editor')}
            aria-selected={activeTab === 'editor'}
          >
            Editor
          </button>
          <button
            role="tab"
            className={`${styles.tab} ${activeTab === 'preview' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('preview')}
            aria-selected={activeTab === 'preview'}
          >
            Preview
          </button>
        </div>

        {/* Split Pane / Tabbed Content */}
        <div className={styles.splitPane}>
          {(activeTab === 'editor' || typeof window !== 'undefined') && (
            <div className={styles.editorPane} style={activeTab === 'preview' ? { display: 'none' } : undefined}>
              <div className={styles.editorWrapper} data-testid="skill-editor">
                <Editor
                  height="100%"
                  language="markdown"
                  theme="vs-dark"
                  value={content}
                  onChange={(val) => setContent(val || '')}
                  onMount={handleEditorMount}
                  options={{
                    fontSize: 14,
                    fontFamily: 'var(--font-mono)',
                    minimap: { enabled: false },
                    wordWrap: 'on',
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    padding: { top: 16 },
                    renderLineHighlight: 'gutter',
                    overviewRulerLanes: 0,
                    hideCursorInOverviewRuler: true,
                    overviewRulerBorder: false,
                    scrollbar: {
                      verticalScrollbarSize: 8,
                      horizontalScrollbarSize: 8,
                    },
                  }}
                />
              </div>
            </div>
          )}
          <div
            className={styles.previewPane}
            data-testid="preview-pane"
            style={activeTab === 'editor' ? undefined : undefined}
          >
            {content ? (
              <div
                className={styles.previewContent}
                dangerouslySetInnerHTML={{ __html: basicMarkdownToHtml(content) }}
              />
            ) : (
              <div className={styles.previewPlaceholder}>
                Start typing in the editor to see a preview...
              </div>
            )}
          </div>
        </div>

        {/* Status Bar */}
        <div className={styles.statusBar} data-testid="editor-status">
          <div className={styles.statusLeft}>
            <span>Ln {cursorLine}, Col {cursorCol}</span>
          </div>
          <div className={styles.statusRight}>
            <span>{content.length} chars</span>
          </div>
        </div>
      </div>

      {/* Share Dialog */}
      {shareOpen && (
        <ShareDialog
          skillName={name || 'Untitled'}
          visibility={visibility}
          onVisibilityChange={setVisibility}
          onClose={() => setShareOpen(false)}
          onSave={handleShareSave}
        />
      )}
    </div>
  );
}
