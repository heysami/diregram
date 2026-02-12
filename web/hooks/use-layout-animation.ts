/**
 * ⚠️ IMPORTANT: This hook is stable and working. Do not modify unless fixing bugs.
 * 
 * This hook handles all animation synchronization between nodes and lines.
 * Modifying this hook can break existing animation behavior.
 * 
 * If you need different animation behavior, consider:
 * 1. Creating a new hook for your specific use case
 * 2. Extending this hook with optional parameters (carefully)
 * 3. Discussing with the team before making changes
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { NodeLayout } from '@/lib/layout-engine';

interface UseLayoutAnimationProps {
  layout: Record<string, NodeLayout>;
  duration?: number;
}

/**
 * Modularized hook for synchronizing node and line animations.
 * 
 * IMPORTANT: This hook is self-contained and should not be modified when adding new features.
 * All animation logic is encapsulated here to prevent breaking existing functionality.
 * 
 * This hook ensures both nodes and lines animate together smoothly by:
 * 1. Interpolating layout positions over time using requestAnimationFrame
 * 2. Managing animation suppression for new nodes (instant appearance)
 * 3. Providing CSS transition classes that match the animation timing
 * 4. Ensuring new nodes are always available in animatedLayout (handles race conditions)
 * 
 * Features:
 * - Automatic detection of new nodes and immediate layout sync
 * - Smooth interpolation with cubic ease-out timing
 * - Automatic cleanup of animation frames and timeouts
 * - Safety merge to ensure all nodes from layout are always available
 * 
 * Usage:
 * ```tsx
 * const { animatedLayout, suppressAnimation, transitionClasses } = useLayoutAnimation({ 
 *   layout,
 *   duration: 300, // optional, defaults to 300ms
 * });
 * 
 * // Temporarily suppress animation when adding new nodes
 * suppressAnimation();
 * // ... add node logic ...
 * 
 * // Use animatedLayout for both nodes and lines to keep them in sync
 * <div 
 *   style={{ left: animatedLayout[id].x, top: animatedLayout[id].y }}
 *   className={transitionClasses}
 * />
 * <path d={calculatePath(animatedLayout[parentId], animatedLayout[childId])} />
 * ```
 * 
 * @param layout - The current layout calculated from the tree structure
 * @param duration - Animation duration in milliseconds (default: 300)
 * @returns { animatedLayout, suppressAnimation, isSuppressed, transitionClasses }
 */
export function useLayoutAnimation({
  layout,
  duration = 300,
}: UseLayoutAnimationProps) {
  const [animatedLayout, setAnimatedLayout] = useState<Record<string, NodeLayout>>(layout);
  const [isSuppressed, setIsSuppressed] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const previousLayoutRef = useRef<Record<string, NodeLayout>>(layout);
  const suppressTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Function to temporarily suppress animation (for new nodes)
  const suppressAnimation = useCallback(() => {
    setIsSuppressed(true);
    // Auto-reset after layout update (handled in useEffect)
  }, []);

  useEffect(() => {
    // Guard: if layout is empty and animatedLayout is already empty, do NOT set state.
    // Some callers can temporarily produce `{}` during initialization; because `{}` is a new
    // reference each render, `setAnimatedLayout(layout)` would cause an infinite update loop.
    if (Object.keys(layout).length === 0) {
      previousLayoutRef.current = layout;
      if (Object.keys(animatedLayout).length === 0) return;
      setAnimatedLayout(layout);
      return;
    }

    // Always ensure animatedLayout is in sync with layout, especially for new nodes
    // Check if there are new nodes (ids in layout but not in previousLayout)
    const hasNewNodes = Object.keys(layout).some(id => !previousLayoutRef.current[id]);
    
    // If animation is suppressed (manually called) OR there are new nodes, update immediately
    // When new nodes are added, ALL layout changes should be instant (no animation)
    // This prevents new nodes and shifted nodes from animating
    if (isSuppressed || hasNewNodes) {
      setAnimatedLayout(layout);
      previousLayoutRef.current = layout;
      // Reset suppression after DOM has updated (only if we manually suppressed)
      if (isSuppressed) {
        if (suppressTimeoutRef.current) {
          clearTimeout(suppressTimeoutRef.current);
        }
        suppressTimeoutRef.current = setTimeout(() => {
          setIsSuppressed(false);
        }, 0);
        return () => {
          if (suppressTimeoutRef.current) {
            clearTimeout(suppressTimeoutRef.current);
          }
        };
      }
      // For new nodes, don't reset suppression - let it stay false so next update can animate
      return;
    }

    // If this is the first render or previous layout was empty, update immediately
    const isFirstLayout = Object.keys(previousLayoutRef.current).length === 0;
    if (isFirstLayout) {
      setAnimatedLayout(layout);
      previousLayoutRef.current = layout;
      return;
    }

    // Check if layout has changed (including width and height)
    const hasChanged = Object.keys(layout).some(id => {
      const old = previousLayoutRef.current[id];
      const current = layout[id];
      return !old || 
        old.x !== current.x || 
        old.y !== current.y || 
        old.width !== current.width || 
        old.height !== current.height;
    });

    // If nothing changed, keep current animated layout
    if (!hasChanged) {
      return;
    }

    // Animate from previous layout to new layout
    const startTime = performance.now();
    const startLayout = { ...previousLayoutRef.current };

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Use cubic ease-out to match CSS transition timing
      const easeProgress = 1 - Math.pow(1 - progress, 3);

      const interpolated: Record<string, NodeLayout> = {};
      Object.keys(layout).forEach(id => {
        const old = startLayout[id];
        const target = layout[id];
        if (old && target) {
          interpolated[id] = {
            ...target,
            x: old.x + (target.x - old.x) * easeProgress,
            y: old.y + (target.y - old.y) * easeProgress,
            width: old.width + (target.width - old.width) * easeProgress,
            height: old.height + (target.height - old.height) * easeProgress,
          };
        } else {
          interpolated[id] = target;
        }
      });

      setAnimatedLayout(interpolated);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        setAnimatedLayout(layout);
        previousLayoutRef.current = layout;
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [layout, isSuppressed, duration]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (suppressTimeoutRef.current) {
        clearTimeout(suppressTimeoutRef.current);
      }
    };
  }, []);

  // Generate CSS transition classes based on animation state
  const transitionClasses = isSuppressed
    ? 'transition-colors transition-shadow duration-150 ease-out'
    : 'transition-colors transition-shadow duration-300 ease-out will-change-transform';

  // Ensure animatedLayout always has all nodes from layout
  // Merge animatedLayout with layout to ensure new nodes are always available
  // This prevents issues where animatedLayout might be missing newly created nodes
  const safeAnimatedLayout = useMemo(() => {
    const merged = { ...animatedLayout };
    // Add any nodes from layout that are missing in animatedLayout
    Object.keys(layout).forEach(id => {
      if (!merged[id]) {
        merged[id] = layout[id];
      }
    });
    return merged;
  }, [animatedLayout, layout]);

  return {
    animatedLayout: safeAnimatedLayout,
    suppressAnimation,
    isSuppressed,
    transitionClasses,
  };
}
