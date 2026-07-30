import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  shouldShowFloatingAgentButton,
} from '../../src/ui/AgentEntryVisibility';

describe('shouldShowFloatingAgentButton', () => {
  it('shows the entry when no agent surface exists', () => {
    assert.equal(shouldShowFloatingAgentButton([]), true);
  });

  it('hides the entry while an agent surface is visible', () => {
    assert.equal(shouldShowFloatingAgentButton([{
      containerShown: true,
      sidedockCollapsed: false,
    }]), false);
  });

  it('restores the entry when the agent sidedock is collapsed', () => {
    assert.equal(shouldShowFloatingAgentButton([{
      containerShown: true,
      sidedockCollapsed: true,
    }]), true);
  });

  it('restores the entry when another sidedock tab replaces the agent', () => {
    assert.equal(shouldShowFloatingAgentButton([{
      containerShown: false,
      sidedockCollapsed: false,
    }]), true);
  });

  it('stays hidden when at least one agent surface remains visible', () => {
    assert.equal(shouldShowFloatingAgentButton([
      {
        containerShown: false,
        sidedockCollapsed: false,
      },
      {
        containerShown: true,
        sidedockCollapsed: false,
      },
    ]), false);
  });
});
