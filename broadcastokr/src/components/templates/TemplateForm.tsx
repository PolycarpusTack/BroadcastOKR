import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { inputStyle, labelStyle, buttonStyle } from '../../styles/formStyles';
import { PRIMARY_COLOR, COLOR_DANGER, FONT_BODY, FONT_MONO } from '../../constants/config';
import type { GoalTemplate, KRTemplate, Theme } from '../../types';

interface TemplateFormProps {
  open: boolean;
  onClose: () => void;
  theme: Theme;
  template?: GoalTemplate;
  onSave: (template: GoalTemplate) => void;
}

type KRFormRow = {
  id: string;
  title: string;
  sql: string;
  unit: string;
  direction: 'hi' | 'lo';
  start: number;
  target: number;
  timeframeDays: string; // string so input can be empty
};

function emptyKRRow(): KRFormRow {
  return {
    id: crypto.randomUUID(),
    title: '',
    sql: '',
    unit: '',
    direction: 'hi',
    start: 0,
    target: 100,
    timeframeDays: '',
  };
}

function buildFormRows(template?: GoalTemplate): KRFormRow[] {
  if (!template) return [emptyKRRow()];

  return template.krTemplates.map((krt) => ({
    id: krt.id,
    title: krt.title,
    sql: krt.sql,
    unit: krt.unit,
    direction: krt.direction,
    start: krt.start,
    target: krt.target,
    timeframeDays: krt.timeframeDays !== undefined ? String(krt.timeframeDays) : '',
  }));
}

export function TemplateForm({ open, onClose, theme, template, onSave }: TemplateFormProps) {
  const formKey = template?.id ?? 'new';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={template ? '\u270E Edit Template' : '\u{1F4CB} New Template'}
      theme={theme}
      width={680}
    >
      {open && (
        <TemplateFormContent
          key={formKey}
          theme={theme}
          template={template}
          onClose={onClose}
          onSave={onSave}
        />
      )}
    </Modal>
  );
}

function TemplateFormContent({
  theme,
  template,
  onClose,
  onSave,
}: Pick<TemplateFormProps, 'theme' | 'template' | 'onClose' | 'onSave'>) {
  const [title, setTitle] = useState(() => template?.title ?? '');
  const [category, setCategory] = useState(() => template?.category ?? 'Health Check');
  const [period, setPeriod] = useState(() => template?.period ?? 'Q1 2026');
  const [krs, setKRs] = useState<KRFormRow[]>(() => buildFormRows(template));

  const updateKR = <K extends keyof KRFormRow>(idx: number, key: K, value: KRFormRow[K]) => {
    setKRs((prev) => prev.map((row, i) => (i === idx ? { ...row, [key]: value } : row)));
  };

  const addKR = () => setKRs((prev) => [...prev, emptyKRRow()]);

  const removeKR = (idx: number) => {
    setKRs((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    if (!title.trim()) return;
    const krTemplates: KRTemplate[] = krs
      .filter((row) => row.title.trim())
      .map((row) => ({
        id: row.id,
        title: row.title.trim(),
        sql: row.sql.trim(),
        unit: row.unit.trim(),
        direction: row.direction,
        start: Number(row.start),
        target: Number(row.target),
        timeframeDays: row.timeframeDays !== '' ? Number(row.timeframeDays) : undefined,
      }));
    if (krTemplates.length === 0) return;

    const result: GoalTemplate = {
      id: template?.id ?? crypto.randomUUID(),
      title: title.trim(),
      category,
      period: period.trim(),
      krTemplates,
      syncIntervalMs: template?.syncIntervalMs,
    };
    onSave(result);
  };

  const inp = inputStyle(theme);
  const lbl = labelStyle(theme);
  const canSave = title.trim().length > 0 && krs.some((row) => row.title.trim());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: FONT_BODY }}>
        {/* Title */}
        <div>
          <label style={lbl}>Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Monthly Health Check"
            style={inp}
          />
        </div>

        {/* Category + Period */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ ...inp, cursor: 'pointer' }}
            >
              <option>Health Check</option>
              <option>Operational</option>
              <option>Custom</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Period</label>
            <input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="Q1 2026"
              style={inp}
            />
          </div>
        </div>

        {/* KR Templates */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ ...lbl, marginBottom: 0 }}>Key Result Templates</span>
            <button
              onClick={addKR}
              style={buttonStyle(PRIMARY_COLOR)}
            >
              + Add KR
            </button>
          </div>

          {krs.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px', color: theme.textFaint, fontSize: 12 }}>
              No KRs yet — click "Add KR" to add one.
            </div>
          )}

          {krs.map((kr, idx) => (
            <div
              key={kr.id}
              style={{
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                padding: 12,
                marginBottom: 10,
                background: theme.bgMuted,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {/* KR header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, flex: 1 }}>
                  KR #{idx + 1}
                </span>
                <button
                  onClick={() => removeKR(idx)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: COLOR_DANGER,
                    cursor: 'pointer',
                    fontSize: 13,
                    padding: '2px 6px',
                    borderRadius: 4,
                  }}
                  aria-label={`Remove KR ${idx + 1}`}
                >
                  \u00D7 Remove
                </button>
              </div>

              {/* Title */}
              <div>
                <label style={lbl}>Title</label>
                <input
                  value={kr.title}
                  onChange={(e) => updateKR(idx, 'title', e.target.value)}
                  placeholder="e.g. Uptime %"
                  style={inp}
                />
              </div>

              {/* SQL */}
              <div>
                <label style={lbl}>SQL Query</label>
                <textarea
                  value={kr.sql}
                  onChange={(e) => updateKR(idx, 'sql', e.target.value)}
                  placeholder="SELECT COUNT(*) AS value FROM ..."
                  rows={3}
                  style={{
                    ...inp,
                    fontFamily: FONT_MONO,
                    fontSize: 11,
                    resize: 'vertical',
                  }}
                />
              </div>

              {/* Unit + Direction */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={lbl}>Unit</label>
                  <input
                    value={kr.unit}
                    onChange={(e) => updateKR(idx, 'unit', e.target.value)}
                    placeholder="e.g. %, ms, count"
                    style={inp}
                  />
                </div>
                <div>
                  <label style={lbl}>Direction</label>
                  <select
                    value={kr.direction}
                    onChange={(e) => updateKR(idx, 'direction', e.target.value as 'hi' | 'lo')}
                    style={{ ...inp, cursor: 'pointer' }}
                  >
                    <option value="hi">Higher is better (\u2191)</option>
                    <option value="lo">Lower is better (\u2193)</option>
                  </select>
                </div>
              </div>

              {/* Start + Target + Timeframe */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={lbl}>Start</label>
                  <input
                    type="number"
                    value={kr.start}
                    onChange={(e) => updateKR(idx, 'start', Number(e.target.value))}
                    style={inp}
                  />
                </div>
                <div>
                  <label style={lbl}>Target</label>
                  <input
                    type="number"
                    value={kr.target}
                    onChange={(e) => updateKR(idx, 'target', Number(e.target.value))}
                    style={inp}
                  />
                </div>
                <div>
                  <label style={lbl}>Timeframe (days, optional)</label>
                  <input
                    type="number"
                    value={kr.timeframeDays}
                    onChange={(e) => updateKR(idx, 'timeframeDays', e.target.value)}
                    placeholder="e.g. 30"
                    style={inp}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Save / Cancel */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{ ...buttonStyle(PRIMARY_COLOR, !canSave), flex: 1 }}
          >
            {template ? 'Save Changes' : 'Create Template'}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: `1px solid ${theme.border}`,
              background: 'transparent',
              color: theme.text,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: FONT_BODY,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
  );
}
