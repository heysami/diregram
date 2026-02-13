# Hooks Documentation

This directory contains modularized React hooks that encapsulate specific functionality. These hooks are designed to be self-contained and should not be modified when adding new features to prevent breaking existing functionality.

## use-layout-animation.ts

**Purpose**: Synchronizes node and line animations to ensure smooth, coordinated movement.

**Key Features**:
- Interpolates layout positions smoothly using requestAnimationFrame
- Automatically detects and handles new nodes (race condition protection)
- Manages animation suppression for instant node appearance
- Provides CSS transition classes that match animation timing

**When to use**: Always use this hook when rendering nodes or lines that need to animate together.

**When NOT to modify**: Do not modify this hook when adding new features. If you need different animation behavior, create a new hook or extend this one carefully.

## use-nexus-structure.ts

**Purpose**: Handles all Yjs document mutations for node structure (create, delete, move).

**Key Features**:
- Creates siblings and children
- Deletes nodes (with safety checks)
- Moves nodes (up, down, indent, unindent)
- Manages hub variants and common nodes

**When to use**: Use this hook for any operation that modifies the node tree structure.

## use-keyboard-navigation.ts

**Purpose**: Handles keyboard navigation between nodes.

**Key Features**:
- Arrow key navigation
- Enter/Tab for creating nodes
- Delete/Backspace for removing nodes

**When to use**: Use this hook for keyboard interaction handling.

## use-drag-drop.ts

**Purpose**: Handles drag and drop operations for moving nodes.

**Key Features**:
- Validates drop targets (prevents invalid moves)
- Performs node moves with proper indentation

**When to use**: Use this hook for drag and drop functionality.

## use-conditions-structure.ts

**Purpose**: Manages condition-based variant structures for hub nodes.

**Key Features**:
- Adds/removes condition dimensions
- Generates variants based on conditions
- Manages variant children

**When to use**: Use this hook for condition and variant management.

## use-yjs.ts

**Purpose**: Manages Yjs document connection and synchronization.

**Key Features**:
- Connects to collaboration server
- Manages document state
- Handles connection status

**When to use**: Use this hook for Yjs document access.

## use-branch-highlighting.ts

**Purpose**: Calculates which nodes should be highlighted when hovering over a branch pill in the DimensionFlowEditor.

**Key Features**:
- Traces back through parent branches to find all ancestor nodes (path from root to fork point)
- Includes only the first child node in the branch (not all nodes)
- Does not include descendant branches or other nodes in the branch
- Returns a Map from branch ID to Set of node IDs that should be highlighted

**When to use**: Use this hook when implementing branch hover highlighting in flow editors.

**When NOT to modify**: Do not modify this hook when adding new features. The highlighting logic is intentionally isolated to prevent breakage.

## use-custom-lines.ts

**Purpose**: Manages all custom line (shortcut/return) functionality including creation, selection, deletion, and persistence.

**Key Features**:
- Loads/saves custom lines from/to markdown in `custom-connections` code block
- Handles line creation via drag and drop
- Determines line type (shortcut vs return) based on node relationships
- Manages line selection and deletion
- Provides helper function to check if a line is connected to a node (for highlighting)

**When to use**: Use this hook for any custom line functionality in the main canvas.

**When NOT to modify**: Do not modify this hook when adding new features. All custom line logic is encapsulated here to prevent breaking existing functionality.

## use-flowlike-global-enter-tab.ts

**Purpose**: Reliability guard for Flow tab (swimlane) so **Enter/Tab always create nodes** even when other UI controls bypass the canvas container `onKeyDown`.

**Key Features**:
- Captures Enter/Tab at the **window** level (capture phase)
- Ignores real form fields (inputs/textareas/selects/contenteditable)
- Delegates to the same create-sibling/create-child actions

**When to use**: Used by `NexusCanvas` automatically in flow-like mode.

**When NOT to modify**: Treat as **DO NOT REGRESS**. See `web/AI_STABILITY_NOTES.md`.

## use-condition-dimension-description-modals.tsx

**Purpose**: Centralizes Conditional hub **dimension** descriptions (Table + Flow modals) including markdown parsing, running-number linkage, and persistence.

**Key Features**:
- Single source of truth for `## Condition Dimension Descriptions` section
- Maintains `<!-- desc:table:<key>:<rn>,flow:<key>:<rn> -->` anchors on tree lines
- Updates ` ```dimension-descriptions``` ` registry consistently
- Uses `NexusCanvas` (Flow Tab style) for Flow descriptions

**When to use**: Use from conditional node UI to open/save dimension Table/Flow descriptions.

## use-data-object-attribute-description-modals.tsx

**Purpose**: Shared Table/Flow description modals for **Data Object status attributes** (single source of truth used by both Data Object inspector and conditional locked dimensions).

**Key Features**:
- Single source of truth for `## Data Object Attribute Descriptions` section
- Uses `NexusCanvas` (Flow Tab style) for Flow descriptions
- Provides `textAutocompleteOptions` + linked indicators based on status values

**When to use**: Whenever you need to edit/view status attribute descriptions anywhere in the UI.

## use-linked-data-object-status-dimensions.ts

**Purpose**: Conditional hub integration for a linked Data Object’s status attributes as **locked** dimensions.

**Key Features**:
- Persists selection via `<!-- dostatus:attr-1,attr-2 -->` on the hub line
- Derives dimension keys/values from the Data Object attribute (non-editable in the conditional UI)
- Provides `effectiveKeyValues` merged with user-defined dimensions

**When to use**: Only in conditional hub logic where `<!-- do:do-X -->` is present and status attributes should be exposed as locked dimensions.

## use-expanded-node-resize.ts

**Purpose**: Manages all expanded node resize functionality including width/height adjustments and metadata persistence.

**Key Features**:
- Loads/saves expanded node metadata using running numbers (stable identifiers)
- Handles all resize directions (width+/-, height+/-)
- Enforces min/max constraints on resize values
- Configurable resize step size
- Provides helper function to get metadata for a node

**When to use**: Use this hook for any expanded node resize functionality (arrow buttons, drag handles, etc.).

**When NOT to modify**: Do not modify this hook when adding new features. All expanded node resize logic is encapsulated here to prevent breaking existing functionality.

---

## Matching Modules (in `web/lib/`)

### expanded-state-matcher.ts

**Purpose**: Handles matching nodes to expanded states using running numbers from markdown comments. Prevents incorrect matching when nodes have duplicate content.

**Key Features**:
- Extracts running numbers from `<!-- expanded:N -->` comments in markdown
- Matches nodes by lineIndex (most reliable, handles duplicate content)
- Falls back to content matching for backward compatibility
- Includes duplicate content guard (returns null if multiple nodes have same content)
- Modularized to prevent breaking when new features are added

**When to use**: Use `matchNodeToExpandedState()` when loading expanded states to match nodes correctly.

**When NOT to modify**: Do not modify this module when adding new features. All expanded state matching logic is encapsulated here to prevent breaking existing functionality.

### dimension-description-matcher.ts

**Purpose**: Matches nodes to conditional dimension descriptions using running numbers from markdown anchors/registries.

**Key Features**:
- Extracts running numbers from `<!-- desc:... -->` comments in markdown
- Matches nodes by lineIndex (most reliable, handles duplicate content)
- Falls back to content matching for backward compatibility
- Includes duplicate content guard (returns null if multiple entries have same content)
- Modularized to prevent breaking when new features are added

**When to use**: Use when loading/saving conditional dimension descriptions to keep runningNumber linkage stable across edits.

**When NOT to modify**: Do not modify this module when adding new features. All dimension description matching logic is encapsulated here to prevent breaking existing functionality.

---

## Adding New Features

When adding new features:

1. **Check existing hooks first** - Your feature might fit into an existing hook
2. **Create new hooks for new concerns** - Don't mix concerns in existing hooks
3. **Don't modify working hooks** - If a hook is working, don't change it
4. **Test thoroughly** - Hooks are shared across components, so changes affect everything
5. **Document your hook** - Add JSDoc comments explaining purpose and usage

## Architecture Principles

- **Single Responsibility**: Each hook handles one concern
- **Encapsulation**: All related logic is contained within the hook
- **Immutability**: Hooks don't mutate external state directly
- **Composability**: Hooks can be combined to build complex features
- **Testability**: Hooks are easier to test in isolation
