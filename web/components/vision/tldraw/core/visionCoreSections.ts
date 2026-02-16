'use client';

/**
 * Barrel module for Vision tldraw “core sections”.
 *
 * Keep imports stable (`.../visionCoreSections`) while implementations stay modular:
 * - Core frames (Asset / Thumbnail / Annotator)
 * - Annotator mirror sync
 * - Traversal / safety helpers
 */

export { type VisionCoreSection, NX_CORE_SECTION_META_KEY, findCoreFrameId, ensureCoreFrames } from '@/components/vision/tldraw/core/visionCoreFrames';

export { NX_MIRROR_SOURCE_META_KEY, NX_MIRROR_ROOT_META_KEY, syncAnnotatorMirror } from '@/components/vision/tldraw/core/visionAnnotatorMirror';

