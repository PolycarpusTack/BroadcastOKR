import { PillBadge } from '../ui/PillBadge';
import { COLOR_SUCCESS, COLOR_WARNING, COLOR_DANGER } from '../../constants/config';
import type { Confidence, KRHistoryEntry } from '../../types';

interface ConfidenceBadgeProps {
  history: KRHistoryEntry[];
}

const CONFIDENCE_MAP: Record<Confidence, { label: string; color: string }> = {
  on_track: { label: 'On Track', color: COLOR_SUCCESS },
  at_risk: { label: 'At Risk', color: COLOR_WARNING },
  blocked: { label: 'Blocked', color: COLOR_DANGER },
};

export function ConfidenceBadge({ history }: ConfidenceBadgeProps) {
  // Find the last entry that has a confidence value set
  let lastConfidence: Confidence | undefined;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].confidence) {
      lastConfidence = history[i].confidence;
      break;
    }
  }
  if (!lastConfidence) return null;

  const { label, color } = CONFIDENCE_MAP[lastConfidence];
  return <PillBadge label={label} color={color} bold />;
}
