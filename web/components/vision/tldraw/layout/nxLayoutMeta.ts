export const NX_LAYOUT_CHILD_META_KEY = 'nxLayoutChild' as const;
export const NX_LAYOUT_CONSTRAINTS_META_KEY = 'nxConstraints' as const;

export type NxLayoutChildSizeMode = 'fixed' | 'hug' | 'fill';

export type NxLayoutChildMeta = {
  sizeX?: NxLayoutChildSizeMode;
  sizeY?: NxLayoutChildSizeMode;
  alignSelf?: 'start' | 'center' | 'end' | 'stretch';
};

export type NxLayoutConstraints = {
  h?: 'left' | 'right' | 'leftRight' | 'center';
  v?: 'top' | 'bottom' | 'topBottom' | 'center';
};

export function readNxLayoutChildMeta(meta: any): Required<Pick<NxLayoutChildMeta, 'sizeX' | 'sizeY'>> & NxLayoutChildMeta {
  const raw = (meta && typeof meta === 'object' ? (meta as any)[NX_LAYOUT_CHILD_META_KEY] : null) as any;
  const sizeX = raw?.sizeX;
  const sizeY = raw?.sizeY;
  return {
    ...(raw && typeof raw === 'object' ? raw : null),
    sizeX: sizeX === 'fill' || sizeX === 'hug' || sizeX === 'fixed' ? sizeX : 'fixed',
    sizeY: sizeY === 'fill' || sizeY === 'hug' || sizeY === 'fixed' ? sizeY : 'fixed',
  };
}

export function readNxConstraints(meta: any): Required<NxLayoutConstraints> {
  const raw = (meta && typeof meta === 'object' ? (meta as any)[NX_LAYOUT_CONSTRAINTS_META_KEY] : null) as any;
  // Back-compat: older docs may have used `scale`. We now treat it as `stretch`.
  const hRaw = raw?.h === 'scale' ? 'leftRight' : raw?.h;
  const vRaw = raw?.v === 'scale' ? 'topBottom' : raw?.v;
  const h = hRaw;
  const v = vRaw;
  return {
    h: h === 'right' || h === 'leftRight' || h === 'center' || h === 'left' ? h : 'left',
    v: v === 'bottom' || v === 'topBottom' || v === 'center' || v === 'top' ? v : 'top',
  };
}

