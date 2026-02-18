import { saveTestDoc, type TestDoc } from '@/lib/testjson';

export function makeStarterTestMarkdown(res?: Partial<Omit<TestDoc, 'version'>>): string {
  const base: TestDoc = {
    version: 1,
    name: String(res?.name || 'New Test'),
    sourceFileId: String(res?.sourceFileId || '<diagram-file-id>'),
    flowRootId: String(res?.flowRootId || '<flow-root-id>'),
    flowNodeId: String(res?.flowNodeId || '<flow-node-id>'),
    createdAt: typeof res?.createdAt === 'number' ? res.createdAt : Date.now(),
    updatedAt: new Date().toISOString(),
  };

  const md = ['# ' + base.name, '', 'Configure this test in the sidebar, then run it.', ''].join('\n');
  return saveTestDoc(md + '\n', base);
}

