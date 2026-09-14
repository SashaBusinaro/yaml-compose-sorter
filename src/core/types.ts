export interface SorterConfig {
  topLevelKeyOrder: string[];
  serviceKeyOrder: string[];
  serviceKeyGroups?: string[][];
  useServiceKeyGroups: boolean;
  preserveBlankLinesWithinServiceKeyGroups: boolean;
  addDocumentSeparator: boolean;
  addBlankLinesTopLevel: boolean;
  addBlankLinesServices: boolean;
  removeVersionKey: boolean;
  transformKeyValueLists: boolean;
}
