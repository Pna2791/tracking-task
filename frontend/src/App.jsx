import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { api } from './api';
import { computeColors, isOverdue } from './color';
import { computeLayout, NODE_WIDTH, NODE_HEIGHT } from './layout';
import { buildChildrenMap, getHiddenIds, countDescendants, canReparent, getAncestors } from './tree';
import TaskNode from './components/TaskNode';
import EditPanel from './components/EditPanel';
import UpcomingPanel from './components/UpcomingPanel';
import AssigneesPage from './components/AssigneesPage';

const nodeTypes = { task: TaskNode };
const DUE_SOON_MS = 24 * 60 * 60 * 1000; // highlight deadlines within 24h
const FLASH_MS = 1500;

/** Pick the intersecting node closest to the dragged node's center. */
function pickDropTarget(draggedNode, intersecting, tasks) {
  const draggedId = Number(draggedNode.id);
  const valid = intersecting.filter((n) => canReparent(tasks, draggedId, Number(n.id)));
  if (valid.length === 0) return null;

  const cx = draggedNode.positionAbsolute.x + (draggedNode.width || 0) / 2;
  const cy = draggedNode.positionAbsolute.y + (draggedNode.height || 0) / 2;

  let best = null;
  let bestDist = Infinity;
  for (const n of valid) {
    const nx = n.positionAbsolute.x + (n.width || 0) / 2;
    const ny = n.positionAbsolute.y + (n.height || 0) / 2;
    const dist = (nx - cx) ** 2 + (ny - cy) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = Number(n.id);
    }
  }
  return best;
}

export default function App() {
  const [tab, setTab] = useState('map'); // 'map' | 'assignees'
  const [tasks, setTasks] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [now, setNow] = useState(new Date());
  const [showUpcoming, setShowUpcoming] = useState(true);
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [flashId, setFlashId] = useState(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Positions from manual drags — allowed as minor tweaks, but cleared (so the
  // auto layout wins) whenever the tree structure changes or "Tidy" is clicked.
  const [manualPositions, setManualPositions] = useState(new Map());

  // Drag-to-reparent: which node is being dragged, and which valid parent is under it.
  const [dragSourceId, setDragSourceId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const dropTargetIdRef = useRef(null);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const rfRef = useRef(null); // React Flow instance, for fitView()
  const didMountRef = useRef(false);
  const pendingFocusRef = useRef(null); // task id to center after expand/layout
  const flashTimerRef = useRef(null);

  // --- Data loading -------------------------------------------------------
  const loadTasks = useCallback(async () => {
    setTasks(await api.getTasks());
  }, []);

  const loadAssignees = useCallback(async () => {
    setAssignees(await api.getAssignees());
  }, []);

  useEffect(() => {
    loadTasks();
    loadAssignees();
  }, [loadTasks, loadAssignees]);

  useEffect(() => {
    if (tab === 'map') loadAssignees();
  }, [tab, loadAssignees]);

  // --- Periodic recompute (deadlines) -------------------------------------
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    const onFocus = () => setNow(new Date());
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // --- Tree derivations ---------------------------------------------------
  const childrenOf = useMemo(() => buildChildrenMap(tasks), [tasks]);

  // Nodes hidden because an ancestor is collapsed (the collapsed node stays).
  const hiddenIds = useMemo(() => getHiddenIds(tasks), [tasks]);
  const visibleTasks = useMemo(
    () => tasks.filter((t) => !hiddenIds.has(t.id)),
    [tasks, hiddenIds]
  );

  // Layout signature: structure + deadline order (siblings sort by deadline).
  const structureSig = useMemo(
    () =>
      visibleTasks
        .map((t) => `${t.id}:${t.parentId}:${t.deadline || ''}`)
        .sort()
        .join('|'),
    [visibleTasks]
  );

  // Auto tree layout (dagre, left-to-right). Recomputed only on structure change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layoutPositions = useMemo(() => computeLayout(visibleTasks), [structureSig]);

  // Center the canvas on a node and briefly flash-highlight it.
  const focusNode = useCallback((taskId) => {
    const inst = rfRef.current;
    if (!inst) return;
    const node = inst.getNode(String(taskId));
    if (!node) return;
    const x = node.position.x + (node.width || NODE_WIDTH) / 2;
    const y = node.position.y + (node.height || NODE_HEIGHT) / 2;
    inst.setCenter(x, y, { zoom: Math.max(inst.getZoom(), 1), duration: 400 });
    setFlashId(taskId);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashId(null), FLASH_MS);
  }, []);

  // When the structure changes, drop manual drag tweaks and re-fit the view so
  // the freshly-arranged tree is centered — unless we're focusing a specific
  // node after expanding collapsed ancestors.
  useEffect(() => {
    setManualPositions(new Map());
    if (didMountRef.current) {
      const pendingId = pendingFocusRef.current;
      const t = setTimeout(() => {
        if (pendingId != null) {
          pendingFocusRef.current = null;
          focusNode(pendingId);
        } else {
          rfRef.current?.fitView({ duration: 300, padding: 0.2 });
        }
      }, 60);
      return () => clearTimeout(t);
    }
    didMountRef.current = true;
  }, [structureSig, focusNode]);

  const assigneeName = useMemo(() => {
    const m = new Map(assignees.map((a) => [a.id, a.name]));
    return (id) => (id != null ? m.get(id) : undefined);
  }, [assignees]);

  // Toggle one node's collapsed state (optimistic + persisted).
  const handleToggleCollapse = useCallback(
    (task) => {
      const next = !task.isCollapsed;
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, isCollapsed: next } : t)));
      api.updateTask(task.id, { isCollapsed: next }).catch(() => loadTasks());
    },
    [loadTasks]
  );

  // --- Build React Flow nodes/edges ---------------------------------------
  // Colors are always derived from the FULL task tree (including hidden nodes),
  // so collapsing never changes a parent's color.
  useEffect(() => {
    const colors = computeColors(tasks, now);
    const visibleIds = new Set(visibleTasks.map((t) => t.id));

    setNodes(
      visibleTasks.map((task) => {
        const overdue = isOverdue(task, now);
        const dueSoon =
          !overdue &&
          !task.isDone &&
          task.deadline &&
          new Date(task.deadline).getTime() - now.getTime() <= DUE_SOON_MS;
        const hasChildren = (childrenOf.get(task.id) || []).length > 0;
        const pos = manualPositions.get(task.id) || layoutPositions.get(task.id) || { x: 0, y: 0 };
        const isRoot = task.parentId == null;

        return {
          id: String(task.id),
          type: 'task',
          position: pos,
          // Roots cannot be reparented — keep them fixed in the tree.
          draggable: !isRoot,
          data: {
            task,
            color: colors.get(task.id),
            assigneeName: assigneeName(task.assigneeId),
            overdue,
            dueSoon,
            hasChildren,
            isCollapsed: task.isCollapsed,
            hiddenCount: task.isCollapsed ? countDescendants(tasks, task.id, childrenOf) : 0,
            onToggleCollapse: handleToggleCollapse,
            // Drag highlight flags are patched in a separate effect so we do not
            // reset the in-flight drag position on every hover change.
            isDropTarget: false,
            isDragSource: false,
            isFlashed: task.id === flashId,
          },
          selected: task.id === selectedId,
        };
      })
    );

    setEdges(
      visibleTasks
        .filter((t) => t.parentId != null && visibleIds.has(t.parentId))
        .map((t) => ({
          id: `e-${t.parentId}-${t.id}`,
          source: String(t.parentId),
          target: String(t.id),
          type: 'smoothstep',
        }))
    );
  }, [
    tasks,
    visibleTasks,
    assignees,
    now,
    selectedId,
    flashId,
    layoutPositions,
    manualPositions,
    childrenOf,
    assigneeName,
    handleToggleCollapse,
    setNodes,
    setEdges,
  ]);

  // Patch drop-target / drag-source highlights without rebuilding positions.
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        const id = Number(n.id);
        const isDropTarget = dropTargetId === id;
        const isDragSource = dragSourceId === id;
        if (n.data.isDropTarget === isDropTarget && n.data.isDragSource === isDragSource) return n;
        return { ...n, data: { ...n.data, isDropTarget, isDragSource } };
      })
    );
    setEdges((eds) =>
      eds.map((e) => {
        const animated =
          dragSourceId != null &&
          (Number(e.target) === dragSourceId || Number(e.source) === dragSourceId);
        if (!!e.animated === animated) return e;
        return { ...e, animated };
      })
    );
  }, [dropTargetId, dragSourceId, setNodes, setEdges]);

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedId) || null,
    [tasks, selectedId]
  );

  // --- Interactions -------------------------------------------------------
  const onNodeClick = useCallback((_e, node) => setSelectedId(Number(node.id)), []);
  const onPaneClick = useCallback(() => setSelectedId(null), []);

  const onNodeDragStart = useCallback((_e, node) => {
    const id = Number(node.id);
    const task = tasksRef.current.find((t) => t.id === id);
    if (!task || task.parentId == null) return; // root: not draggable, but guard anyway
    setDragSourceId(id);
    setDropTargetId(null);
    dropTargetIdRef.current = null;
  }, []);

  const onNodeDrag = useCallback((_e, node) => {
    const intersecting = rfRef.current?.getIntersectingNodes(node) || [];
    const target = pickDropTarget(node, intersecting, tasksRef.current);
    dropTargetIdRef.current = target;
    setDropTargetId(target);
  }, []);

  const handleReparent = useCallback(
    async (nodeId, newParentId) => {
      const parent = tasksRef.current.find((t) => t.id === newParentId);
      // Optimistic tree update — structureSig change triggers layout + fitView.
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id === nodeId) return { ...t, parentId: newParentId };
          // Expand the new parent so the moved node (and its branch) stay visible.
          if (t.id === newParentId && t.isCollapsed) return { ...t, isCollapsed: false };
          return t;
        })
      );
      setSelectedId(nodeId);
      try {
        await api.updateTask(nodeId, { parentId: newParentId });
        if (parent?.isCollapsed) {
          await api.updateTask(newParentId, { isCollapsed: false });
        }
      } catch {
        await loadTasks();
      }
    },
    [loadTasks]
  );

  // Drop on a valid parent → reparent; otherwise keep as a manual position tweak.
  const onNodeDragStop = useCallback(
    async (_e, node) => {
      const draggedId = Number(node.id);
      const targetId = dropTargetIdRef.current;

      setDragSourceId(null);
      setDropTargetId(null);
      dropTargetIdRef.current = null;

      if (targetId != null && canReparent(tasksRef.current, draggedId, targetId)) {
        await handleReparent(draggedId, targetId);
        return;
      }

      setManualPositions((prev) => {
        const m = new Map(prev);
        m.set(draggedId, { x: node.position.x, y: node.position.y });
        return m;
      });
    },
    [handleReparent]
  );

  async function handleSave(id, data) {
    const updated = await api.updateTask(id, data);
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updated } : t)));
  }

  async function handleAddChild(parent) {
    const created = await api.createTask({ title: 'New task', parentId: parent.id });
    // Make sure the parent is expanded so the new child is visible.
    if (parent.isCollapsed) await api.updateTask(parent.id, { isCollapsed: false });
    await loadTasks();
    setSelectedId(created.id);
  }

  async function handleAddSibling(sibling) {
    if (sibling.parentId == null) return; // root has no siblings
    const created = await api.createTask({ title: 'New task', parentId: sibling.parentId });
    await loadTasks();
    setSelectedId(created.id);
  }

  async function handleDelete(task) {
    const msg =
      task.parentId == null
        ? 'Delete this root node and ALL its descendants? This cannot be undone.'
        : 'Delete this node and all its descendants? This cannot be undone.';
    if (!confirm(msg)) return;
    await api.deleteTask(task.id);
    setSelectedId(null);
    await loadTasks();
  }

  // Snap everything back to the auto-computed layout.
  function handleTidy() {
    setManualPositions(new Map());
    setTimeout(() => rfRef.current?.fitView({ duration: 300, padding: 0.2 }), 60);
  }

  async function setCollapsedForAll(collapsed) {
    // Only nodes with children can be collapsed.
    const targets = tasks.filter((t) =>
      collapsed ? (childrenOf.get(t.id) || []).length > 0 : t.isCollapsed
    );
    if (targets.length === 0) return;
    const targetIds = new Set(targets.map((t) => t.id));
    setTasks((prev) =>
      prev.map((t) => (targetIds.has(t.id) ? { ...t, isCollapsed: collapsed } : t))
    );
    try {
      await Promise.all(targets.map((t) => api.updateTask(t.id, { isCollapsed: collapsed })));
    } catch {
      await loadTasks();
    }
  }

  // Focus a task from the upcoming list: expand collapsed ancestors if needed,
  // then pan/center and briefly highlight. Does not open the edit panel.
  const handleFocusTask = useCallback(
    async (taskId) => {
      const collapsedAncestors = getAncestors(tasksRef.current, taskId).filter((t) => t.isCollapsed);

      if (collapsedAncestors.length > 0) {
        const expandIds = new Set(collapsedAncestors.map((a) => a.id));
        pendingFocusRef.current = taskId;
        setTasks((prev) =>
          prev.map((t) => (expandIds.has(t.id) ? { ...t, isCollapsed: false } : t))
        );
        try {
          await Promise.all(
            collapsedAncestors.map((a) => api.updateTask(a.id, { isCollapsed: false }))
          );
        } catch {
          await loadTasks();
        }
      } else {
        focusNode(taskId);
      }
    },
    [focusNode, loadTasks]
  );

  // --- Render -------------------------------------------------------------
  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center justify-between gap-4 px-4 py-2 border-b bg-white shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <h1 className="font-semibold text-gray-800">🧠 Mind Map Tasks</h1>
          <nav className="flex gap-1 ml-4">
            <button
              onClick={() => setTab('map')}
              className={`px-3 py-1.5 text-sm rounded ${
                tab === 'map' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Mind map
            </button>
            <button
              onClick={() => setTab('assignees')}
              className={`px-3 py-1.5 text-sm rounded ${
                tab === 'assignees' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Assignees
            </button>
          </nav>
        </div>

        {tab === 'map' && (
          <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
            <span className="hidden sm:inline text-gray-400">
              Drag a node onto another to reparent
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded bg-red-200 border border-red-400" /> Overdue
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded bg-green-200 border border-green-400" /> Done
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded bg-white border border-gray-300" /> In progress
            </span>
          </div>
        )}
      </header>

      {tab === 'assignees' ? (
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <AssigneesPage />
        </div>
      ) : (
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onInit={(inst) => (rfRef.current = inst)}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            fitView
            minZoom={0.2}
            maxZoom={2}
          >
            <Background />
            <Controls />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) =>
                ({ red: '#fca5a5', green: '#86efac', neutral: '#e5e7eb' }[n.data?.color] || '#e5e7eb')
              }
            />

            {/* Layout toolbar — shift right when the upcoming panel is open */}
            <Panel position="top-left" className={`flex gap-2 ${showUpcoming ? '!left-80' : ''}`}>
              <button
                onClick={() => setShowUpcoming((v) => !v)}
                className={`rounded border px-3 py-1.5 text-sm shadow ${
                  showUpcoming
                    ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                    : 'bg-white border-gray-300 hover:bg-gray-50'
                }`}
                title={showUpcoming ? 'Hide upcoming tasks' : 'Show upcoming tasks'}
              >
                Upcoming
              </button>
              <button
                onClick={handleTidy}
                className="rounded bg-white border border-gray-300 px-3 py-1.5 text-sm shadow hover:bg-gray-50"
                title="Snap all nodes back to the tidy auto layout"
              >
                ✨ Tidy layout
              </button>
              <button
                onClick={() => setCollapsedForAll(true)}
                className="rounded bg-white border border-gray-300 px-3 py-1.5 text-sm shadow hover:bg-gray-50"
              >
                Collapse all
              </button>
              <button
                onClick={() => setCollapsedForAll(false)}
                className="rounded bg-white border border-gray-300 px-3 py-1.5 text-sm shadow hover:bg-gray-50"
              >
                Expand all
              </button>
            </Panel>
          </ReactFlow>

          {showUpcoming && (
            <UpcomingPanel
              tasks={tasks}
              assignees={assignees}
              assigneeName={assigneeName}
              now={now}
              filter={assigneeFilter}
              onFilterChange={setAssigneeFilter}
              onFocusTask={handleFocusTask}
              onClose={() => setShowUpcoming(false)}
            />
          )}

          <EditPanel
            task={selectedTask}
            assignees={assignees}
            onSave={handleSave}
            onClose={() => setSelectedId(null)}
            onAddChild={handleAddChild}
            onAddSibling={handleAddSibling}
            onDelete={handleDelete}
          />
        </div>
      )}
    </div>
  );
}
