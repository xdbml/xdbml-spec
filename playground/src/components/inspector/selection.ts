/**
 * Selection model: what's currently selected in the diagram.
 *
 * Discriminated union covering the four selectable kinds. Used by:
 *   - DiagramCanvas: owns visual highlight, emits selection events
 *   - Inspector: reads the current selection and renders its content
 *
 * Keyed by stable identifiers from the layout output:
 *   - container.name      (containers are unique by name)
 *   - entity.id           (`containerName.entityName` or just `entityName`)
 *   - field path scoped to its entity (e.g. `bill_to_address.street`)
 *   - ref.id              (synthetic `ref:<index>` from layout)
 *
 * Persisted to localStorage so reload restores the selection -- as long
 * as the schema still contains a target with that key. If the schema
 * was edited and the selection no longer resolves, the inspector
 * silently shows its empty state.
 */

export type Selection =
  | { kind: 'container'; containerName: string }
  | { kind: 'entity'; entityId: string }
  | { kind: 'field'; entityId: string; path: string }
  | { kind: 'ref'; refId: string }
  | null;

/**
 * Equality check for two selections. Used to short-circuit selection
 * updates that wouldn't change anything (avoids spurious re-renders
 * and localStorage writes).
 */
export function selectionEquals (a: Selection, b: Selection): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'container':
      return b.kind === 'container' && a.containerName === b.containerName;
    case 'entity':
      return b.kind === 'entity' && a.entityId === b.entityId;
    case 'field':
      return b.kind === 'field' && a.entityId === b.entityId && a.path === b.path;
    case 'ref':
      return b.kind === 'ref' && a.refId === b.refId;
  }
}
