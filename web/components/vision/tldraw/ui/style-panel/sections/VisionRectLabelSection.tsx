'use client';

import { NxRectLabelSection } from '@/components/vision/tldraw/ui/style-panel/sections/NxRectLabelSection';

export function VisionRectLabelSection({
  enabled,
  label,
  labelSize,
  labelAlign,
  labelColor,
  onChangeLabel,
  onChangeLabelSize,
  onChangeLabelAlign,
  onChangeLabelColor,
}: {
  enabled: boolean;
  label: string;
  labelSize: number;
  labelAlign: any;
  labelColor: string;
  onChangeLabel: (s: string) => void;
  onChangeLabelSize: (n: number) => void;
  onChangeLabelAlign: (a: any) => void;
  onChangeLabelColor: (hex: string) => void;
}) {
  if (!enabled) return null;
  return (
    <NxRectLabelSection
      label={label}
      labelSize={labelSize}
      labelAlign={labelAlign}
      labelColor={labelColor}
      onChangeLabel={onChangeLabel}
      onChangeLabelSize={onChangeLabelSize}
      onChangeLabelAlign={onChangeLabelAlign}
      onChangeLabelColor={onChangeLabelColor}
    />
  );
}

