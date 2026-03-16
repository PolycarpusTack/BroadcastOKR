import { useState, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { PillBadge } from '../ui/PillBadge';
import { useStore } from '../../store/store';
import { useToast } from '../../context/ToastContext';
import { useActivityLog } from '../../context/ActivityLogContext';
import { useAuth } from '../../context/AuthContext';
import { parseFile, exportToExcel, exportToCSV, exportToJSON, downloadTemplate } from '../../utils/importExport';
import type { ParsedData } from '../../utils/importExport';
import type { Theme } from '../../types';
import { PRIMARY_COLOR, COLOR_SUCCESS, COLOR_WARNING, COLOR_DANGER, COLOR_COBALT_MID } from '../../constants/config';

interface ImportExportModalProps {
  open: boolean;
  onClose: () => void;
  theme: Theme;
}

type Tab = 'import' | 'export';
type ImportMode = 'replace' | 'append';

export function ImportExportModal({ open, onClose, theme }: ImportExportModalProps) {
  const [tab, setTab] = useState<Tab>('import');
  const [importMode, setImportMode] = useState<ImportMode>('append');
  const [preview, setPreview] = useState<ParsedData | null>(null);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  const { logAction } = useActivityLog();
  const { currentUser } = useAuth();

  const goals = useStore((s) => s.goals);
  const tasks = useStore((s) => s.tasks);
  const kpis = useStore((s) => s.kpis);
  const clients = useStore((s) => s.clients);
  const goalTemplates = useStore((s) => s.goalTemplates);
  const setGoals = useStore((s) => s.setGoals);
  const setTasks = useStore((s) => s.setTasks);
  const setKPIs = useStore((s) => s.setKPIs);
  const addBulkTasks = useStore((s) => s.addBulkTasks);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setPreview(null);
    setLoading(true);
    setFileName(file.name);

    try {
      const data = await parseFile(file);
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = () => {
    if (!preview) return;

    let imported = 0;

    if (preview.goals.length > 0) {
      if (importMode === 'replace') {
        setGoals(preview.goals);
      } else {
        setGoals([...preview.goals, ...goals]);
      }
      imported += preview.goals.length;
    }

    if (preview.tasks.length > 0) {
      if (importMode === 'replace') {
        setTasks(preview.tasks);
      } else {
        addBulkTasks(preview.tasks);
      }
      imported += preview.tasks.length;
    }

    if (preview.kpis.length > 0) {
      if (importMode === 'replace') {
        setKPIs(preview.kpis);
      } else {
        setKPIs([...preview.kpis, ...kpis]);
      }
      imported += preview.kpis.length;
    }

    if (preview.clients.length > 0 || preview.goalTemplates.length > 0) {
      if (importMode === 'replace') {
        useStore.setState({ clients: preview.clients, goalTemplates: preview.goalTemplates });
        imported += preview.clients.length + preview.goalTemplates.length;
      } else {
        const existingClientIds = new Set(clients.map((c) => c.id));
        const newClients = preview.clients.filter((c) => !existingClientIds.has(c.id));
        const existingTemplateIds = new Set(goalTemplates.map((t) => t.id));
        const newTemplates = preview.goalTemplates.filter((t) => !existingTemplateIds.has(t.id));
        useStore.setState({
          clients: [...newClients, ...clients],
          goalTemplates: [...newTemplates, ...goalTemplates],
        });
        imported += newClients.length + newTemplates.length;
      }
    }

    toast(`Imported ${imported} items from ${fileName}`, COLOR_SUCCESS, '\u{1F4E5}');
    logAction(`Imported ${imported} items from ${fileName}`, currentUser.name, COLOR_SUCCESS);

    setPreview(null);
    setFileName('');
    if (fileRef.current) fileRef.current.value = '';
    onClose();
  };

  const handleExport = (format: 'xlsx' | 'json') => {
    if (format === 'xlsx') {
      exportToExcel(goals, tasks, kpis, clients, goalTemplates);
    } else {
      exportToJSON(goals, tasks, kpis, clients, goalTemplates);
    }
    toast(`Exported data as ${format.toUpperCase()}`, PRIMARY_COLOR, '\u{1F4E4}');
    logAction(`Exported data as ${format.toUpperCase()}`, currentUser.name, PRIMARY_COLOR);
  };

  const handleExportCSV = (type: 'goals' | 'tasks' | 'kpis') => {
    exportToCSV(goals, tasks, kpis, type, clients, goalTemplates);
    toast(`Exported ${type} as CSV`, PRIMARY_COLOR, '\u{1F4E4}');
  };

  const resetImport = () => {
    setPreview(null);
    setFileName('');
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const labelStyle = { fontSize: 11, fontWeight: 700 as const, color: theme.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 };
  const btnStyle = { padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700 as const, cursor: 'pointer' };

  return (
    <Modal open={open} onClose={() => { resetImport(); onClose(); }} title={'\u{1F4C1} Import / Export'} theme={theme} width={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Tab Switcher */}
        <div style={{ display: 'flex', borderRadius: 8, border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
          {(['import', 'export'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); resetImport(); }}
              style={{
                flex: 1,
                padding: '8px 0',
                border: 'none',
                background: tab === t ? PRIMARY_COLOR : theme.bgMuted,
                color: tab === t ? '#fff' : theme.textMuted,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {t === 'import' ? '\u{1F4E5} Import' : '\u{1F4E4} Export'}
            </button>
          ))}
        </div>

        {tab === 'import' ? (
          <>
            {/* File Upload */}
            <div>
              <div style={labelStyle}>Upload File</div>
              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  padding: 24,
                  borderRadius: 10,
                  border: `2px dashed ${theme.border}`,
                  background: theme.bgMuted,
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                }}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = PRIMARY_COLOR; }}
                onDragLeave={(e) => { e.currentTarget.style.borderColor = theme.border; }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.style.borderColor = theme.border;
                  const file = e.dataTransfer.files[0];
                  if (file && fileRef.current) {
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    fileRef.current.files = dt.files;
                    fileRef.current.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 8 }}>{'\u{1F4C4}'}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                  {fileName || 'Drop file here or click to browse'}
                </div>
                <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 4 }}>
                  Supports .xlsx, .csv, .json
                </div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,.json"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                aria-label="Upload file"
              />
            </div>

            {/* Template Download */}
            <button
              onClick={downloadTemplate}
              style={{ ...btnStyle, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span style={{ fontSize: 16 }}>{'\u{1F4CB}'}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>Download Template</div>
                <div style={{ fontSize: 10, fontWeight: 400, color: theme.textFaint, marginTop: 1 }}>Excel template with sample data and correct column headers</div>
              </div>
            </button>

            {/* Loading */}
            {loading && (
              <div style={{ textAlign: 'center', padding: 16, color: theme.textMuted, fontSize: 13 }}>
                Parsing file...
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: `${COLOR_DANGER}18`, border: `1px solid ${COLOR_DANGER}4D`, color: COLOR_DANGER, fontSize: 12, fontWeight: 600 }}>
                {error}
              </div>
            )}

            {/* Preview */}
            {preview && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={labelStyle}>Preview</div>
                <div style={{ padding: '12px 14px', borderRadius: 10, background: theme.bgMuted, border: `1px solid ${theme.borderLight}` }}>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: preview.warnings.length > 0 ? 10 : 0 }}>
                    {preview.goals.length > 0 && <PillBadge label={`${preview.goals.length} Goals`} color={COLOR_COBALT_MID} bold />}
                    {preview.tasks.length > 0 && <PillBadge label={`${preview.tasks.length} Tasks`} color={COLOR_SUCCESS} bold />}
                    {preview.kpis.length > 0 && <PillBadge label={`${preview.kpis.length} KPIs`} color={COLOR_WARNING} bold />}
                    {preview.goals.length === 0 && preview.tasks.length === 0 && preview.kpis.length === 0 && (
                      <span style={{ fontSize: 12, color: COLOR_DANGER, fontWeight: 600 }}>No importable data found</span>
                    )}
                  </div>
                  {preview.warnings.length > 0 && (
                    <div style={{ borderTop: `1px solid ${theme.borderLight}`, paddingTop: 8 }}>
                      {preview.warnings.map((w, i) => (
                        <div key={i} style={{ fontSize: 11, color: COLOR_WARNING, marginBottom: 2 }}>{'\u26A0\uFE0F'} {w}</div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Import Mode */}
                <div>
                  <div style={labelStyle}>Import Mode</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['append', 'replace'] as ImportMode[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => setImportMode(m)}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: `1px solid ${importMode === m ? PRIMARY_COLOR : theme.border}`,
                          background: importMode === m ? `${PRIMARY_COLOR}20` : 'transparent',
                          color: importMode === m ? PRIMARY_COLOR : theme.textMuted,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>{m === 'append' ? '\u2795 Append' : '\u{1F504} Replace'}</div>
                        <div style={{ fontSize: 10, marginTop: 2, opacity: 0.7 }}>
                          {m === 'append' ? 'Add to existing data' : 'Replace existing data'}
                        </div>
                      </button>
                    ))}
                  </div>
                  {importMode === 'replace' && (
                    <div style={{ fontSize: 11, color: COLOR_WARNING, marginTop: 6 }}>
                      {'\u26A0\uFE0F'} Replace mode will overwrite all existing {[preview.goals.length > 0 && 'goals', preview.tasks.length > 0 && 'tasks', preview.kpis.length > 0 && 'KPIs'].filter(Boolean).join(', ')} data.
                    </div>
                  )}
                </div>

                {/* Import Button */}
                {(preview.goals.length > 0 || preview.tasks.length > 0 || preview.kpis.length > 0) && (
                  <button
                    onClick={handleImport}
                    style={{ ...btnStyle, background: PRIMARY_COLOR, color: '#fff', marginTop: 4 }}
                  >
                    {'\u{1F4E5}'} Import {preview.goals.length + preview.tasks.length + preview.kpis.length} Items
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          /* Export Tab */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={labelStyle}>Current Data</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <PillBadge label={`${goals.length} Goals`} color={COLOR_COBALT_MID} bold />
              <PillBadge label={`${tasks.length} Tasks`} color={COLOR_SUCCESS} bold />
              <PillBadge label={`${kpis.length} KPIs`} color={COLOR_WARNING} bold />
            </div>

            <div style={labelStyle}>Export All</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => handleExport('xlsx')} style={{ ...btnStyle, flex: 1, background: PRIMARY_COLOR, color: '#fff' }}>
                {'\u{1F4CA}'} Excel (.xlsx)
              </button>
              <button onClick={() => handleExport('json')} style={{ ...btnStyle, flex: 1, background: theme.bgMuted, color: theme.text, border: `1px solid ${theme.border}` }}>
                {'\u{1F4C4}'} JSON
              </button>
            </div>

            <div style={labelStyle}>Export Individual (CSV)</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => handleExportCSV('goals')} style={{ ...btnStyle, flex: 1, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.text, fontSize: 11 }}>
                Goals CSV
              </button>
              <button onClick={() => handleExportCSV('tasks')} style={{ ...btnStyle, flex: 1, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.text, fontSize: 11 }}>
                Tasks CSV
              </button>
              <button onClick={() => handleExportCSV('kpis')} style={{ ...btnStyle, flex: 1, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.text, fontSize: 11 }}>
                KPIs CSV
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
