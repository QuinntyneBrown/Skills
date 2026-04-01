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
  content: string;
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

  const editorRef = useRef<EditorInstance | null>(null);

  // Fetch skill data when editing
  useEffect(() => {
    if (isNew || !id) return;
    let cancelled = false;
    const fetchSkill = async () => {
      try {
        const { data } = await api.get<SkillData>(`/skills/${id}`);
        if (cancelled) return;
        setName(data.name);
        setDescription(data.description || '');
        setContent(data.content || '');
        setTags(data.tags?.join(', ') || '');
        setVisibility(data.visibility);
        setVersion(data.version);
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
    if (!name.trim()) {
      showToast('warning', 'Skill name is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        content,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        visibility,
      };
      if (isNew) {
        const { data } = await api.post<SkillData>('/skills', payload);
        showToast('success', 'Skill created');
        navigate(`/skills/${data.id}/edit`, { replace: true });
      } else {
        await api.patch(`/skills/${id}`, payload);
        setVersion((v) => v + 1);
        showToast('success', 'Skill saved');
      }
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to save skill';
      showToast('error', message);
    } finally {
      setSaving(false);
    }
  }, [name, description, content, tags, visibility, isNew, id, navigate, showToast]);

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

  const visibilityBadgeClass = visibility === 'public'
    ? styles.metaBadgeSuccess
    : visibility === 'shared'
      ? styles.metaBadgeWarning
      : styles.metaBadge;

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
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </div>

      <div className={styles.main}>
        {/* Top Bar */}
        <div className={styles.topBar}>
          <div className={styles.topBarLeft}>
            <button className={styles.backBtn} onClick={() => navigate('/dashboard')} aria-label="Back">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <span className={styles.breadcrumb}>
              <button className={styles.breadcrumbLink} onClick={() => navigate('/dashboard')}>My Skills</button>
              {' > '}
              <span className={styles.breadcrumbCurrent}>{name || 'New Skill'}</span>
            </span>
            <span className={styles.topBarTitle}>{name || 'New Skill'}</span>
          </div>
          <div className={styles.topBarRight}>
            <button className={styles.shareBtn} onClick={() => setShareOpen(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              <span>Share</span>
            </button>
            <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {/* Metadata Bar */}
        <div className={styles.meta}>
          <span className={styles.metaBadge}>skill.md</span>
          {!isNew && <span className={styles.metaBadgeAccent}>v{version}</span>}
          <span className={visibilityBadgeClass}>{visibility}</span>
          <span className={styles.metaBadge}>{content.length} chars</span>
        </div>

        {/* Form Section */}
        <div className={styles.formSection}>
          <div className={styles.formGrid}>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Name</label>
              <input
                className={styles.formInput}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Skill name..."
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Description</label>
              <textarea
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
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'editor' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('editor')}
          >
            Editor
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'preview' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('preview')}
          >
            Preview
          </button>
        </div>

        {/* Split Pane / Tabbed Content */}
        <div className={styles.splitPane}>
          {(activeTab === 'editor' || typeof window !== 'undefined') && (
            <div className={styles.editorPane} style={activeTab === 'preview' ? { display: 'none' } : undefined}>
              <div className={styles.editorWrapper}>
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
        <div className={styles.statusBar}>
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
