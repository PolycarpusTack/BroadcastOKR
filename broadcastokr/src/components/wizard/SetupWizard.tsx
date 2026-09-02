import { useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import type { Theme } from '../../types';
import { PRIMARY_COLOR, COLOR_SUCCESS, FONT_BODY, FONT_HEADING } from '../../constants/config';
import { activeSteps } from './wizardSteps';
import { emptyWizardData, type WizardBridge, type WizardContext, type WizardData } from './wizardTypes';
import { StepWelcome } from './steps/StepWelcome';
import { StepBridge } from './steps/StepBridge';
import { StepConnection } from './steps/StepConnection';
import { StepClient } from './steps/StepClient';
import { StepPath } from './steps/StepPath';
import { StepGoal } from './steps/StepGoal';
import { StepKPI } from './steps/StepKPI';
import { StepFinish } from './steps/StepFinish';

export interface SetupWizardProps {
  open: boolean;
  onDismiss: () => void;
  onComplete: () => void;
  theme: Theme;
  bridge: WizardBridge;
  context: WizardContext;
}

/**
 * Guided first-run setup: bridge -> database -> client -> what to measure ->
 * a real goal and/or a real KPI -> where things live.
 *
 * Every step writes through the same store actions and bridge endpoints the
 * normal UI uses, so the wizard produces ordinary records with no privileged
 * path of its own. That also means a half-finished run is not wasted: the
 * connection, client, goal and KPI each persist as they are created.
 */
export function SetupWizard({ open, onDismiss, onComplete, theme, bridge, context }: SetupWizardProps) {
  const [data, setData] = useState<WizardData>(emptyWizardData);
  const [index, setIndex] = useState(0);

  // The step list depends on `data.path`, so it is recomputed as choices change.
  const steps = useMemo(() => activeSteps(context, data), [context, data]);
  const safeIndex = Math.min(index, steps.length - 1);
  const step = steps[safeIndex];
  const isLast = safeIndex === steps.length - 1;

  const patch = (p: Partial<WizardData>) => setData((prev) => ({ ...prev, ...p }));

  const canAdvance = !step?.canAdvance || step.canAdvance(data);
  const goNext = () => (isLast ? onComplete() : setIndex(safeIndex + 1));
  const goBack = () => setIndex(Math.max(0, safeIndex - 1));

  const stepProps = { data, patch, theme, bridge, context, goNext };

  const body = (() => {
    switch (step?.id) {
      case 'welcome': return <StepWelcome {...stepProps} />;
      case 'bridge': return <StepBridge {...stepProps} />;
      case 'connection': return <StepConnection {...stepProps} />;
      case 'client': return <StepClient {...stepProps} />;
      case 'path': return <StepPath {...stepProps} />;
      case 'goal': return <StepGoal {...stepProps} />;
      case 'kpi': return <StepKPI {...stepProps} />;
      case 'finish': return <StepFinish {...stepProps} />;
      default: return null;
    }
  })();

  const navButton = (label: string, onClick: () => void, primary = false, disabled = false) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600, fontFamily: FONT_BODY,
        border: primary ? 'none' : `1px solid ${theme.border}`,
        background: primary ? PRIMARY_COLOR : 'transparent',
        color: primary ? '#fff' : theme.textSecondary,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );

  return (
    <Modal open={open} onClose={onDismiss} title="Set up BroadcastOKR" width={720} theme={theme}>
      {/* Progress rail — named steps, so the length of the road is visible */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
        {steps.map((s, i) => {
          const done = i < safeIndex;
          const current = i === safeIndex;
          return (
            <span
              key={s.id}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 9px', borderRadius: 999, fontSize: 11,
                fontWeight: current ? 700 : 500,
                fontFamily: FONT_BODY,
                background: current ? `${PRIMARY_COLOR}18` : 'transparent',
                border: `1px solid ${current ? PRIMARY_COLOR : theme.borderLight}`,
                color: current ? PRIMARY_COLOR : done ? COLOR_SUCCESS : theme.textFaint,
              }}
            >
              <span aria-hidden>{done ? '✓' : s.icon}</span>
              {s.title}
            </span>
          );
        })}
      </div>

      <div style={{ minHeight: 280 }}>
        <h3 style={{
          margin: '0 0 10px 0', fontFamily: FONT_HEADING, fontSize: 17,
          fontWeight: 700, color: theme.text,
        }}>
          {step?.icon} {step?.title}
        </h3>
        {body}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginTop: 20,
        paddingTop: 14, borderTop: `1px solid ${theme.borderLight}`,
      }}>
        {safeIndex > 0 && navButton('Back', goBack)}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onDismiss}
          style={{
            background: 'none', border: 'none', color: theme.textFaint,
            fontSize: 12, fontFamily: FONT_BODY, cursor: 'pointer', textDecoration: 'underline',
          }}
        >
          {/* Honest label: nothing already created is rolled back. */}
          Finish later
        </button>
        {/* An optional step that has not been completed offers Skip as the way
            forward, so Next never sits there disabled with no alternative. */}
        {canAdvance
          ? navButton(isLast ? 'Done' : 'Next', goNext, true)
          : step?.optional
            ? navButton('Skip for now', goNext, false)
            : navButton('Next', goNext, true, true)}
      </div>
    </Modal>
  );
}
