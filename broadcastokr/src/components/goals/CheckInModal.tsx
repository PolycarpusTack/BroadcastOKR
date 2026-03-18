import { useState } from 'react';
import type { Confidence, GoalStatus, Theme } from '../../types';
import { Modal } from '../ui/Modal';
import { inputStyle, labelStyle, buttonStyle } from '../../styles/formStyles';
import { PRIMARY_COLOR, COLOR_SUCCESS, COLOR_DANGER, COLOR_WARNING, FONT_BODY } from '../../constants/config';

interface CheckInModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (entry: { value: number; confidence?: Confidence; note?: string }) => void;
  krTitle: string;
  currentValue: number;
  krStatus: GoalStatus;
  isLive: boolean;
  theme: Theme;
}

const STATUS_TO_CONFIDENCE: Record<GoalStatus, Confidence> = {
  on_track: 'on_track',
  at_risk: 'at_risk',
  behind: 'blocked',
  done: 'on_track',
};

const CONFIDENCE_OPTIONS: { value: Confidence; label: string; color: string }[] = [
  { value: 'on_track', label: 'On Track', color: COLOR_SUCCESS },
  { value: 'at_risk', label: 'At Risk', color: COLOR_WARNING },
  { value: 'blocked', label: 'Blocked', color: COLOR_DANGER },
];

export function CheckInModal({
  open,
  onClose,
  onSubmit,
  krTitle,
  currentValue,
  krStatus,
  isLive,
  theme,
}: CheckInModalProps) {
  const [value, setValue] = useState<string>(String(currentValue));
  const [confidence, setConfidence] = useState<Confidence>(STATUS_TO_CONFIDENCE[krStatus]);
  const [note, setNote] = useState('');

  const numValue = Number(value);
  const isDisabled = value === '' || isNaN(numValue);

  const handleSubmit = () => {
    if (isDisabled) return;
    onSubmit({
      value: numValue,
      confidence,
      note: note.slice(0, 500) || undefined,
    });
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Check-in: ${krTitle}`} theme={theme} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Value */}
        <div>
          <label style={labelStyle(theme)}>Value</label>
          <input
            type="number"
            aria-label="Value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            readOnly={isLive}
            onKeyDown={handleKeyDown}
            style={{
              ...inputStyle(theme),
              ...(isLive ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
            }}
          />
        </div>

        {/* Confidence */}
        <div>
          <label style={labelStyle(theme)}>Confidence</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {CONFIDENCE_OPTIONS.map((opt) => {
              const selected = confidence === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setConfidence(opt.value)}
                  onKeyDown={handleKeyDown}
                  style={{
                    flex: 1,
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: `1px solid ${selected ? opt.color : theme.border}`,
                    background: selected ? opt.color + '22' : 'transparent',
                    color: selected ? opt.color : theme.textMuted,
                    fontFamily: FONT_BODY,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Note */}
        <div>
          <label style={labelStyle(theme)}>Note</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What's driving this? (optional)"
            maxLength={500}
            rows={3}
            style={{
              ...inputStyle(theme),
              resize: 'vertical' as const,
              minHeight: 60,
            }}
          />
        </div>

        {/* Submit */}
        <button
          type="button"
          disabled={isDisabled}
          onClick={handleSubmit}
          style={buttonStyle(PRIMARY_COLOR, isDisabled)}
        >
          Record Check-in
        </button>
      </div>
    </Modal>
  );
}
