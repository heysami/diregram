export type DocKind = 'diagram' | 'note' | 'grid' | 'vision';

export type NexusDocHeaderV1 = {
  kind: DocKind;
  version: 1;
};

export type NexusDocHeader = NexusDocHeaderV1;

