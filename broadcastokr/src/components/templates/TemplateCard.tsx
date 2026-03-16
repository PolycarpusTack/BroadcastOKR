import { PillBadge } from '../ui/PillBadge';
import { PRIMARY_COLOR, COLOR_DANGER, COLOR_SUCCESS, COLOR_INFO, FONT_HEADING, FONT_BODY } from '../../constants/config';
import type { GoalTemplate, Theme } from '../../types';

interface TemplateCardProps {
  template: GoalTemplate;
  theme: Theme;
  clientCount: number;
  onEdit: () => void;
  onMaterialize: () => void;
  onDelete: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  'Health Check': COLOR_SUCCESS,
  'Operational': COLOR_INFO,
  'Custom': PRIMARY_COLOR,
};

export function TemplateCard({ template, theme, clientCount, onEdit, onMaterialize, onDelete }: TemplateCardProps) {
  const categoryColor = CATEGORY_COLORS[template.category] ?? PRIMARY_COLOR;

  return (
    <div
      style={{
        background: theme.bgCard,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: theme.text,
                fontFamily: FONT_HEADING,
              }}
            >
              {template.title}
            </span>
            <PillBadge label={template.category} color={categoryColor} />
            {clientCount > 0 && (
              <PillBadge
                label={`${clientCount} client${clientCount !== 1 ? 's' : ''}`}
                color={COLOR_SUCCESS}
                icon="\u{1F4CB}"
              />
            )}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginTop: 6,
              fontSize: 11,
              color: theme.textFaint,
              fontFamily: FONT_BODY,
            }}
          >
            <span>{template.period}</span>
            <span>\u00B7</span>
            <span>{template.krTemplates.length} KR{template.krTemplates.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            onClick={onEdit}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: `1px solid ${theme.border}`,
              background: 'transparent',
              color: theme.textSecondary,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: FONT_BODY,
            }}
          >
            \u270E Edit
          </button>
          <button
            onClick={onMaterialize}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: 'none',
              background: PRIMARY_COLOR,
              color: '#fff',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: FONT_BODY,
            }}
          >
            {'\u{1F4CB}'} Materialize
          </button>
          <button
            onClick={onDelete}
            aria-label="Delete template"
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: `1px solid ${COLOR_DANGER}4D`,
              background: `${COLOR_DANGER}18`,
              color: COLOR_DANGER,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: FONT_BODY,
            }}
          >
            {'\u{1F5D1}'}
          </button>
        </div>
      </div>

      {/* KR list preview */}
      {template.krTemplates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {template.krTemplates.map((krt) => (
            <div
              key={krt.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 10px',
                borderRadius: 6,
                background: theme.bgMuted,
                border: `1px solid ${theme.borderLight}`,
                fontSize: 11,
                color: theme.textSecondary,
                fontFamily: FONT_BODY,
              }}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {krt.title}
              </span>
              <span style={{ color: theme.textFaint, flexShrink: 0 }}>
                {krt.start} \u2192 {krt.target} {krt.unit}
              </span>
              <PillBadge label={krt.direction === 'hi' ? '\u2191 hi' : '\u2193 lo'} color={krt.direction === 'hi' ? COLOR_SUCCESS : COLOR_DANGER} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
