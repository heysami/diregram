export type TestingTest = {
  id: string;
  name: string;
  /** Flow tab root id at creation time (best-effort; ids are line-index based) */
  flowRootId: string;
  /** Flow node id used as source (must exist in flowtab-process-references map) */
  flowNodeId: string;
  createdAt: number;
};
