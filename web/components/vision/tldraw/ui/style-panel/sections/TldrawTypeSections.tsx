'use client';

import type { Editor } from 'tldraw';
import { DefaultDashStyle, DefaultFillStyle, DefaultSizeStyle } from '@tldraw/editor';
import { TldrawFillSection, TldrawOutlineSection, TldrawTextSection } from '@/components/vision/tldraw/ui/style-panel/sections/TldrawSections';

export function TldrawTypeSections({
  enabled,
  editor,
  fill,
  outline,
  text,
  sizeNumber,
  sizeTokenFromNumber,
  onPickPrimaryColor,
  onPickTextColor,
}: {
  enabled: boolean;
  editor: Editor;
  fill: { color: string; mixed: boolean; placeholder: string; fillStyle: string };
  outline: { color: string; mixed: boolean; placeholder: string; dashStyle: string };
  text: { color: string; mixed: boolean; placeholder: string };
  sizeNumber: number;
  sizeTokenFromNumber: (n: number) => string;
  onPickPrimaryColor: (hex: string, variant: 'fill' | 'semi' | 'pattern' | 'solid') => void;
  onPickTextColor: (hex: string) => void;
}) {
  if (!enabled) return null;
  return (
    <>
      <TldrawFillSection
        color={fill.color}
        mixed={fill.mixed}
        placeholder={fill.placeholder}
        fillStyle={fill.fillStyle}
        onPickColor={(hex) => onPickPrimaryColor(hex, 'fill')}
        onCommitHex={(hex) => onPickPrimaryColor(hex, 'fill')}
        onChangeFillStyle={(v) => {
          try {
            editor.setStyleForSelectedShapes(DefaultFillStyle as any, v as any);
            editor.setStyleForNextShapes(DefaultFillStyle as any, v as any);
          } catch {
            // ignore
          }
        }}
      />

      <TldrawOutlineSection
        color={outline.color}
        mixed={outline.mixed}
        placeholder={outline.placeholder}
        sizeNumber={sizeNumber}
        dashStyle={outline.dashStyle}
        onPickColor={(hex) => onPickPrimaryColor(hex, 'solid')}
        onCommitHex={(hex) => onPickPrimaryColor(hex, 'solid')}
        onChangeSizeNumber={(n) => {
          const nn = Math.max(1, Math.min(4, Math.round(Number(n || 2))));
          const token = sizeTokenFromNumber(nn);
          try {
            editor.setStyleForSelectedShapes(DefaultSizeStyle as any, token as any);
            editor.setStyleForNextShapes(DefaultSizeStyle as any, token as any);
          } catch {
            // ignore
          }
        }}
        onChangeDashStyle={(v) => {
          try {
            editor.setStyleForSelectedShapes(DefaultDashStyle as any, v as any);
            editor.setStyleForNextShapes(DefaultDashStyle as any, v as any);
          } catch {
            // ignore
          }
        }}
      />

      <TldrawTextSection
        color={text.color}
        mixed={text.mixed}
        placeholder={text.placeholder}
        sizeNumber={sizeNumber}
        onPickColor={(hex) => onPickTextColor(hex)}
        onCommitHex={(hex) => onPickTextColor(hex)}
        onChangeSizeNumber={(n) => {
          const nn = Math.max(1, Math.min(4, Math.round(Number(n || 2))));
          const token = sizeTokenFromNumber(nn);
          try {
            editor.setStyleForSelectedShapes(DefaultSizeStyle as any, token as any);
            editor.setStyleForNextShapes(DefaultSizeStyle as any, token as any);
          } catch {
            // ignore
          }
        }}
      />
    </>
  );
}

