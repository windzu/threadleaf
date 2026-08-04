export const LOCAL_DEPLOY_ASSETS: readonly string[];

export function loadLocalEnvironment(sourceDirectory?: string): void;

export function resolveLocalVaultPath(
  argument: string | undefined,
  environment?: Record<string, string | undefined>,
): string | null;

export function deployLocalPlugin(
  vaultPath: string,
  sourceDirectory?: string,
): string;

export function createLocalDeployPlugin(
  vaultPath: string,
  sourceDirectory?: string,
): {
  name: string;
  setup(build: {
    onEnd(callback: (result: { errors: unknown[] }) => void): void;
  }): void;
};
