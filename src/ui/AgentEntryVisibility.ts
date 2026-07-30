export interface AgentSurfaceVisibility {
  containerShown: boolean;
  sidedockCollapsed: boolean;
}

export function shouldShowFloatingAgentButton(
  surfaces: readonly AgentSurfaceVisibility[],
): boolean {
  return !surfaces.some(surface => (
    surface.containerShown && !surface.sidedockCollapsed
  ));
}
