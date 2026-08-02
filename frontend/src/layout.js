import dagre from '@dagrejs/dagre';
import { compareByDeadline } from './tree';

// ===========================================================================
// AUTO TREE LAYOUT
// ===========================================================================
// Positions are computed automatically with dagre in a left-to-right tree
// (root on the left, children extending right). We no longer rely on the
// manually-dragged positionX/positionY for layout — the tree always snaps to
// a tidy arrangement after any structural change.
//
// Because dagre assigns every node a "rank" equal to its depth, all nodes at
// the same depth (which includes all siblings of a parent) get the SAME X
// coordinate — giving the aligned left edges the spec requires — and are
// evenly spaced vertically by `nodesep`.
//
// Sibling vertical order follows deadline (earliest first); see compareByDeadline.
// ===========================================================================

// Fixed node dimensions — every node is the same size regardless of title.
export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 56;

const RANK_SEP = 90; // horizontal gap between depth levels
const NODE_SEP = 24; // vertical gap between siblings

/**
 * Compute tidy left-to-right positions for the given visible tasks.
 *
 * @param {object[]} visibleTasks tasks currently shown (hidden ones excluded)
 * @returns {Map<number, {x:number, y:number}>} top-left position per task id
 */
export function computeLayout(visibleTasks) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', ranksep: RANK_SEP, nodesep: NODE_SEP });
  g.setDefaultEdgeLabel(() => ({}));

  const visibleIds = new Set(visibleTasks.map((t) => t.id));

  for (const t of visibleTasks) {
    g.setNode(String(t.id), { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  // Add parent→child edges in deadline order so dagre stacks siblings earliest-first.
  const byParent = new Map();
  for (const t of visibleTasks) {
    if (t.parentId != null && visibleIds.has(t.parentId)) {
      if (!byParent.has(t.parentId)) byParent.set(t.parentId, []);
      byParent.get(t.parentId).push(t);
    }
  }
  for (const [parentId, children] of byParent) {
    children.sort(compareByDeadline);
    for (const t of children) {
      g.setEdge(String(parentId), String(t.id));
    }
  }

  dagre.layout(g);

  // dagre returns node centers; React Flow positions use the top-left corner.
  const positions = new Map();
  for (const t of visibleTasks) {
    const n = g.node(String(t.id));
    positions.set(t.id, { x: n.x - NODE_WIDTH / 2, y: n.y - NODE_HEIGHT / 2 });
  }
  return positions;
}
