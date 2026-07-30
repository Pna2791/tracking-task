import { isOverdue } from '../color';

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

/**
 * Read-only left panel: not-done tasks sorted by deadline, with assignee filter.
 * Clicking a row focuses that node on the canvas (handled by parent).
 */
export default function UpcomingPanel({
  tasks,
  assignees,
  assigneeName,
  now,
  filter,
  onFilterChange,
  onFocusTask,
  onClose,
}) {
  const openTasks = tasks.filter((t) => !t.isDone);

  const filtered = openTasks.filter((t) => {
    if (filter === 'all') return true;
    if (filter === 'unassigned') return t.assigneeId == null;
    return t.assigneeId === Number(filter);
  });

  const withDeadline = filtered
    .filter((t) => t.deadline)
    .slice()
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

  const noDeadline = filtered.filter((t) => !t.deadline);

  function renderRow(task) {
    const overdue = isOverdue(task, now);
    const name = assigneeName(task.assigneeId);

    return (
      <button
        key={task.id}
        type="button"
        onClick={() => onFocusTask(task.id)}
        className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-gray-100 flex items-start gap-2 transition-colors"
      >
        <div className="flex-1 min-w-0">
          {task.deadline ? (
            <div
              className={`text-[11px] font-medium truncate ${
                overdue ? 'text-red-600' : 'text-gray-500'
              }`}
            >
              {formatDeadline(task.deadline)}
              {overdue ? ' · overdue' : ''}
            </div>
          ) : (
            <div className="text-[11px] text-gray-400 truncate">No deadline</div>
          )}
          <div className="text-sm text-gray-800 truncate mt-0.5" title={task.title}>
            {task.title}
          </div>
        </div>

        {name ? (
          <span
            title={name}
            className="shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-600 text-white text-[10px] font-semibold mt-0.5"
          >
            {initials(name)}
          </span>
        ) : (
          <span
            title="Unassigned"
            className="shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full bg-gray-200 text-gray-500 text-[10px] font-semibold mt-0.5"
          >
            —
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="absolute top-0 left-0 h-full w-80 bg-white shadow-xl border-r border-gray-200 flex flex-col z-10">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="font-semibold text-gray-800">Upcoming</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">
          ×
        </button>
      </div>

      <div className="px-4 py-3 border-b">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Assignee</span>
          <select
            className="mt-1 w-full rounded border-gray-300 border px-2 py-1.5 text-sm bg-white"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
          >
            <option value="all">All</option>
            {assignees.map((a) => (
              <option key={a.id} value={String(a.id)}>
                {a.name}
              </option>
            ))}
            <option value="unassigned">Unassigned</option>
          </select>
        </label>
      </div>

      <div className="flex-1 overflow-y-auto">
        {withDeadline.length === 0 && noDeadline.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400 text-center">No open tasks</p>
        ) : (
          <>
            {withDeadline.map(renderRow)}
            {noDeadline.length > 0 && (
              <>
                <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400 bg-gray-50 border-y border-gray-100">
                  No deadline
                </div>
                {noDeadline.map(renderRow)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
