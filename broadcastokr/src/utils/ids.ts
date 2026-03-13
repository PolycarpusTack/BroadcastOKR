export function nextTaskId(): string {
  return `t-${crypto.randomUUID().slice(0, 8)}`;
}

export function nextGoalId(): string {
  return `g-${crypto.randomUUID().slice(0, 8)}`;
}

export function nextStressTaskId(): string {
  return `ts-${crypto.randomUUID().slice(0, 8)}`;
}
