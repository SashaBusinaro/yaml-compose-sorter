import {
  DEFAULT_CONFIG,
  DEFAULT_SERVICE_KEY_GROUPS,
  DEFAULT_SERVICE_KEY_ORDER,
  DEFAULT_TOP_LEVEL_KEY_ORDER,
  SorterConfig
} from "../core";

export {
  DEFAULT_CONFIG,
  DEFAULT_SERVICE_KEY_GROUPS,
  DEFAULT_SERVICE_KEY_ORDER,
  DEFAULT_TOP_LEVEL_KEY_ORDER
};

/** Helper to merge defaults with overrides */
export const cleanConfig = (overrides: Partial<SorterConfig> = {}): SorterConfig => ({
  ...DEFAULT_CONFIG,
  ...overrides
});

/** Alias for cleanConfig to maintain compatibility with adversary test suites */
export const createConfig = cleanConfig;
