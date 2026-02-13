import type React from 'react';
import type { ExpandedGridNodeRuntime, ExpandedGridUiItem, ExpandedGridUiSection, ExpandedGridUiTab } from '@/lib/expanded-grid-storage';

export type ExpandedGridPreviewCommonProps = {
  node: ExpandedGridNodeRuntime;
  gridKey: string;
  onClickDataObjectId?: (dataObjectId: string) => void;
};

export type ExpandedGridTabsState = {
  activeTabByGridKey: Record<string, string>;
  setActiveTabByGridKey: React.Dispatch<React.SetStateAction<Record<string, string>>>;
};

export type ExpandedGridCollapsedState = {
  collapsedByGridKey: Record<string, Record<string, boolean>>;
  setCollapsedByGridKey: React.Dispatch<React.SetStateAction<Record<string, Record<string, boolean>>>>;
};

export type ExpandedGridDropdownState = {
  dropdownOpenByGridKey: Record<string, boolean>;
  setDropdownOpenByGridKey: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
};

export type RenderUiItem = (it: ExpandedGridUiItem, keyPrefix: string) => React.ReactNode;

export type UiTabs = ExpandedGridUiTab[];
export type UiSections = ExpandedGridUiSection[];

