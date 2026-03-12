let taskCounter = 9;
let goalCounter = 5;

export function nextTaskId(): string {
  return `t${taskCounter++}`;
}

export function nextGoalId(): string {
  return `g${goalCounter++}`;
}

export function nextStressTaskId(): string {
  return `ts${taskCounter++}`;
}
