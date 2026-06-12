let addGoalDirty = false;

export function setAddGoalDirty(value) {
  addGoalDirty = Boolean(value);
}

export function hasAddGoalDirty() {
  return addGoalDirty;
}
