// Helpers for working with the flat task list as a tree.

// Build a Map of parentId -> array of child tasks.
export function buildChildrenMap(tasks) {
  const childrenOf = new Map();
  for (const t of tasks) {
    if (t.parentId != null) {
      if (!childrenOf.has(t.parentId)) childrenOf.set(t.parentId, []);
      childrenOf.get(t.parentId).push(t);
    }
  }
  return childrenOf;
}

// Ids of tasks that are hidden because some ANCESTOR is collapsed. The
// collapsed node itself stays visible — only its descendants are hidden.
export function getHiddenIds(tasks) {
  const childrenOf = buildChildrenMap(tasks);
  const hidden = new Set();

  function hideSubtree(id) {
    for (const child of childrenOf.get(id) || []) {
      hidden.add(child.id);
      hideSubtree(child.id);
    }
  }

  for (const t of tasks) {
    if (t.isCollapsed) hideSubtree(t.id);
  }
  return hidden;
}

// Count all descendants (recursively) of a task — used for the collapsed badge.
export function countDescendants(tasks, id, childrenOf = buildChildrenMap(tasks)) {
  let count = 0;
  for (const child of childrenOf.get(id) || []) {
    count += 1 + countDescendants(tasks, child.id, childrenOf);
  }
  return count;
}

// All descendant ids of a task (not including the task itself).
export function getDescendantIds(tasks, id, childrenOf = buildChildrenMap(tasks)) {
  const ids = new Set();
  function walk(pid) {
    for (const child of childrenOf.get(pid) || []) {
      ids.add(child.id);
      walk(child.id);
    }
  }
  walk(id);
  return ids;
}

/** Walk parentId links upward; returns ancestors from nearest parent to root. */
export function getAncestors(tasks, id) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ancestors = [];
  let current = byId.get(id);
  while (current?.parentId != null) {
    current = byId.get(current.parentId);
    if (!current) break;
    ancestors.push(current);
  }
  return ancestors;
}

/**
 * Whether `nodeId` may be reparented under `newParentId`.
 * Rejects: missing nodes, roots, self, current parent, and descendant targets (cycles).
 */
export function canReparent(tasks, nodeId, newParentId) {
  if (nodeId == null || newParentId == null) return false;
  if (nodeId === newParentId) return false;
  const node = tasks.find((t) => t.id === nodeId);
  const parent = tasks.find((t) => t.id === newParentId);
  if (!node || !parent) return false;
  if (node.parentId == null) return false; // roots stay roots
  if (node.parentId === newParentId) return false; // already under this parent
  if (getDescendantIds(tasks, nodeId).has(newParentId)) return false;
  return true;
}
