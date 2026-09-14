import { SorterConfig } from "./types";

export const DEFAULT_TOP_LEVEL_KEY_ORDER: string[] = [
  "version",
  "name",
  "services",
  "volumes",
  "networks",
  "configs",
  "secrets"
];

export const DEFAULT_SERVICE_KEY_ORDER: string[] = [
  "container_name",
  "image",
  "build",
  "restart",
  "depends_on",
  "ports",
  "expose",
  "volumes",
  "environment",
  "env_file",
  "networks",
  "labels",
  "healthcheck"
];

export const DEFAULT_SERVICE_KEY_GROUPS: string[][] = [
  ["container_name"],
  ["image", "build"],
  ["restart", "depends_on"],
  ["ports", "expose"],
  ["volumes"],
  ["environment", "env_file"],
  ["networks"],
  ["labels", "healthcheck"]
];

export const DEFAULT_TRANSFORMABLE_LIST_KEYS: readonly string[] = [
  "environment",
  "labels",
  "extra_hosts",
  "args"
];

export const DEFAULT_CONFIG: SorterConfig = {
  topLevelKeyOrder: DEFAULT_TOP_LEVEL_KEY_ORDER,
  serviceKeyOrder: DEFAULT_SERVICE_KEY_ORDER,
  serviceKeyGroups: DEFAULT_SERVICE_KEY_GROUPS,
  useServiceKeyGroups: false,
  preserveBlankLinesWithinServiceKeyGroups: true,
  addDocumentSeparator: false,
  addBlankLinesTopLevel: true,
  addBlankLinesServices: true,
  removeVersionKey: false,
  transformKeyValueLists: false
};
