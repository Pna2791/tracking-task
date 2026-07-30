// ===========================================================================
// COLOR / STATUS LOGIC  —  the most important logic in this app.
// ===========================================================================
// Colors are NEVER stored in the database. They are always derived from a
// node's own state (isDone, deadline) plus the recursive state of all of its
// descendants, and re-evaluated against the CURRENT TIME. This guarantees the
// display can never go stale — e.g. a node silently turns red the moment its
// deadline passes, without any write to the DB.
//
// The three possible colors, and their propagation priority for a PARENT node
// computed over its entire subtree:
//
//        RED  >  GREEN  >  NEUTRAL
//
// Rules:
//   • Leaf, not done, no overdue deadline .......... NEUTRAL
//   • Leaf, done .................................... GREEN
//   • Any node, has a deadline in the past AND not
//     done ......................................... RED  (self-overdue)
//   • Parent: RED   if it is self-overdue OR any
//             descendant is RED (red wins, always).
//   • Parent: GREEN if not red AND every child is
//             GREEN (i.e. the whole subtree is done).
//   • Parent: NEUTRAL otherwise.
// ===========================================================================

export const COLOR = {
  RED: 'red',
  GREEN: 'green',
  NEUTRAL: 'neutral',
};

// A node's own deadline has passed and it is not marked done.
export function isOverdue(task, now = new Date()) {
  if (!task.deadline || task.isDone) return false;
  return new Date(task.deadline).getTime() < now.getTime();
}

/**
 * Compute the color for a single node given its children's already-computed
 * colors and the current time. Kept pure and separate so the rule is easy to
 * read and reason about.
 *
 * @param {object} task        the node
 * @param {string[]} childColors colors of its direct children (already derived)
 * @param {Date} now           current time
 * @returns {'red'|'green'|'neutral'}
 */
export function colorFrom(task, childColors, now) {
  const overdue = isOverdue(task, now);

  // Leaf node.
  if (childColors.length === 0) {
    if (overdue) return COLOR.RED;
    return task.isDone ? COLOR.GREEN : COLOR.NEUTRAL;
  }

  // Parent node. Red always wins (self-overdue OR any red descendant).
  if (overdue || childColors.includes(COLOR.RED)) return COLOR.RED;

  // Green only when the entire subtree is green.
  if (childColors.every((c) => c === COLOR.GREEN)) return COLOR.GREEN;

  return COLOR.NEUTRAL;
}

/**
 * Given the flat list of tasks from the API, build a map of id -> color by
 * walking each node's subtree recursively (memoised so each node is computed
 * once even in deep trees).
 *
 * @param {object[]} tasks flat list with id + parentId
 * @param {Date} now
 * @returns {Map<number, 'red'|'green'|'neutral'>}
 */
export function computeColors(tasks, now = new Date()) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const childrenOf = new Map();
  for (const t of tasks) {
    if (t.parentId != null) {
      if (!childrenOf.has(t.parentId)) childrenOf.set(t.parentId, []);
      childrenOf.get(t.parentId).push(t);
    }
  }

  const colors = new Map();

  function resolve(id) {
    if (colors.has(id)) return colors.get(id);
    const task = byId.get(id);
    const children = childrenOf.get(id) || [];
    const childColors = children.map((c) => resolve(c.id));
    const color = colorFrom(task, childColors, now);
    colors.set(id, color);
    return color;
  }

  for (const t of tasks) resolve(t.id);
  return colors;
}
