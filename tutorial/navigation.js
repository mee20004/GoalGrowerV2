// Tab/stack targets for each step
export function getStepNavigationTarget(step) {
  if (!step?.navigation) return null;
  const { tab, screen, params } = step.navigation;
  return {
    tab,
    screen: screen ?? null,
    params: params ?? {},
  };
}

export function buildTutorialNavigateAction(step) {
  const target = getStepNavigationTarget(step);
  if (!target?.tab) return null;

  if (target.screen) {
    return {
      name: target.tab,
      params: {
        screen: target.screen,
        params: target.params,
      },
    };
  }

  return { name: target.tab, params: target.params };
}
