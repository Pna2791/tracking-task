import { Handle, Position } from 'reactflow';
import { COLOR } from '../color';
import { NODE_WIDTH, NODE_HEIGHT } from '../layout';

// Tailwind classes per derived color. Neutral = white/gray.
const COLOR_STYLES = {
  [COLOR.RED]: 'bg-red-100 border-red-400 text-red-900',
  [COLOR.GREEN]: 'bg-green-100 border-green-400 text-green-900',
  [COLOR.NEUTRAL]: 'bg-white border-gray-300 text-gray-800',
};

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function formatDeadline(deadline) {
  const d = new Date(deadline);
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Custom React Flow node. All display state (color, badges, collapse info)
// comes in via `data`, computed centrally in App. Every node is a fixed size
// so the tree layout stays perfectly aligned regardless of title length.
export default function TaskNode({ data, selected }) {
  const {
    task,
    color,
    assigneeName,
    overdue,
    dueSoon,
    hasChildren,
    isCollapsed,
    hiddenCount,
    onToggleCollapse,
    isDropTarget,
    isDragSource,
    isFlashed,
  } = data;

  return (
    <div
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      className={`relative rounded-lg border-2 px-3 py-2 shadow-sm transition-[box-shadow,border-color,background-color] duration-150 ${
        COLOR_STYLES[color]
      } ${selected ? 'ring-2 ring-blue-500 ring-offset-1' : ''} ${
        isFlashed && !selected
          ? 'ring-2 ring-amber-400 ring-offset-2 shadow-lg shadow-amber-300/50'
          : ''
      } ${
        isDropTarget
          ? 'ring-2 ring-violet-500 ring-offset-2 border-violet-500 shadow-lg shadow-violet-300/60 scale-[1.02]'
          : ''
      } ${isDragSource ? 'opacity-60' : ''}`}
      title={task.title}
    >
      {/* Connection handles (edges are drawn parent -> child). */}
      <Handle type="target" position={Position.Left} className="!bg-gray-400" />
      <Handle type="source" position={Position.Right} className="!bg-gray-400" />

      <div className="flex items-start gap-2 h-full">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            {task.isDone && <span title="Done">✅</span>}
            {overdue && <span title="Overdue">⏰</span>}
            {!overdue && dueSoon && <span title="Due soon">🔔</span>}
            <span className={`font-medium truncate ${task.isDone ? 'line-through opacity-70' : ''}`}>
              {task.title}
            </span>
          </div>

          {task.deadline && (
            <div className="text-[11px] mt-0.5 opacity-70 truncate">{formatDeadline(task.deadline)}</div>
          )}

          {/* Badge showing how many descendants are hidden while collapsed. */}
          {isCollapsed && hiddenCount > 0 && (
            <span className="inline-block mt-1 rounded-full bg-gray-700 text-white text-[10px] px-2 py-0.5">
              {hiddenCount} hidden
            </span>
          )}
        </div>

        {assigneeName && (
          <span
            title={assigneeName}
            className="shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-600 text-white text-[10px] font-semibold"
          >
            {initials(assigneeName)}
          </span>
        )}
      </div>

      {/* Expand/collapse toggle — only on nodes that actually have children.
          `nodrag` stops React Flow from starting a drag; stopPropagation keeps
          the click from selecting/opening the node. */}
      {hasChildren && (
        <button
          className="nodrag absolute -right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full border-2 border-gray-400 bg-white text-gray-700 text-sm font-bold leading-none flex items-center justify-center shadow hover:bg-gray-100"
          title={isCollapsed ? 'Expand subtree' : 'Collapse subtree'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse(task);
          }}
        >
          {isCollapsed ? '+' : '−'}
        </button>
      )}
    </div>
  );
}
