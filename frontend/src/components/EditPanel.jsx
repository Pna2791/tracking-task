import { useEffect, useRef, useState } from 'react';

const pad = (n) => String(n).padStart(2, '0');
const SAVE_DEBOUNCE_MS = 400;

// The deadline is edited with a custom WHOLE-HOUR picker: a date input plus
// Hour (1–12) and AM/PM dropdowns. This guarantees whole-hour selection in
// every browser (native datetime-local minute behavior varies). We decompose
// the stored deadline into {date, hour12, ampm} for editing and recompose it
// (minutes forced to :00) on save — all in the browser's LOCAL timezone.

// Break a stored deadline (ISO string, or a Date) into local picker parts.
// A non-zero-minute legacy value simply displays at its hour (minutes dropped).
function partsFromDeadline(value) {
  if (!value) return { date: '', hour12: '9', ampm: 'AM' };
  const d = new Date(value);
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { date, hour12: String(h12), ampm };
}

// Recombine picker parts into an ISO string for storage (minutes = 00), or
// null when no date is chosen (= no deadline). Built from a LOCAL datetime.
function deadlineFromParts(date, hour12, ampm) {
  if (!date) return null;
  let h = parseInt(hour12, 10) % 12; // 12 -> 0
  if (ampm === 'PM') h += 12; // 12 PM -> 12, 12 AM -> 0
  return new Date(`${date}T${pad(h)}:00`).toISOString();
}

function formToPayload(form) {
  return {
    title: form.title.trim() || 'Untitled',
    description: form.description,
    isDone: form.isDone,
    deadline: deadlineFromParts(form.deadlineDate, form.deadlineHour12, form.deadlineAmPm),
    assigneeId: form.assigneeId === '' ? null : Number(form.assigneeId),
  };
}

function payloadEqualsTask(payload, task) {
  const taskDeadline = task.deadline ? new Date(task.deadline).toISOString() : null;
  const payloadDeadline = payload.deadline ? new Date(payload.deadline).toISOString() : null;
  return (
    payload.title === task.title &&
    payload.description === (task.description || '') &&
    payload.isDone === task.isDone &&
    payloadDeadline === taskDeadline &&
    (payload.assigneeId ?? null) === (task.assigneeId ?? null)
  );
}

// Quick-deadline presets. Each computes a Date in the BROWSER'S LOCAL time
// (same timezone used everywhere else). "Later today" stays on today at 18:00
// even if it's already past 18:00.
const DEADLINE_PRESETS = [
  { value: 'later-today', label: 'Later today', days: 0, hour: 18 },
  { value: 'tomorrow-morning', label: 'Tomorrow morning', days: 1, hour: 9 },
  { value: 'tomorrow', label: 'Tomorrow', days: 1, hour: 18 },
  { value: 'in-2-days', label: 'In 2 days', days: 2, hour: 18 },
  { value: 'in-3-days', label: 'In 3 days', days: 3, hour: 18 },
];

// A preset resolves straight into picker parts (always a whole hour).
function presetToParts(preset) {
  const d = new Date();
  d.setDate(d.getDate() + preset.days);
  d.setHours(preset.hour, 0, 0, 0);
  return partsFromDeadline(d);
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12

// Slide-in editor for the selected node.
export default function EditPanel({ task, assignees, onSave, onClose, onAddChild, onAddSibling, onDelete }) {
  const [form, setForm] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const taskIdRef = useRef(null);
  const skipSaveRef = useRef(true);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Reset form only when switching to a different task (not on every prop refresh).
  useEffect(() => {
    if (!task) {
      setForm(null);
      taskIdRef.current = null;
      setSaveState('idle');
      return;
    }
    if (taskIdRef.current === task.id) return;
    taskIdRef.current = task.id;
    skipSaveRef.current = true;
    setSaveState('idle');
    const parts = partsFromDeadline(task.deadline);
    setForm({
      title: task.title,
      description: task.description || '',
      isDone: task.isDone,
      deadlineDate: parts.date,
      deadlineHour12: parts.hour12,
      deadlineAmPm: parts.ampm,
      assigneeId: task.assigneeId ?? '',
    });
  }, [task]);

  // Debounced auto-save whenever the form changes after the initial load.
  useEffect(() => {
    if (!form || !task || taskIdRef.current !== task.id) return;
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }

    const payload = formToPayload(form);
    if (payloadEqualsTask(payload, task)) return;

    setSaveState('saving');
    const timer = setTimeout(async () => {
      try {
        await onSaveRef.current(task.id, payload);
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    }, SAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [form, task]);

  if (!task || !form) return null;

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const isRoot = task.parentId == null;

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-white shadow-xl border-l border-gray-200 flex flex-col z-10">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="font-semibold text-gray-800">Edit task</h2>
        <div className="flex items-center gap-3">
          <span
            className={`text-xs ${
              saveState === 'error'
                ? 'text-red-600'
                : saveState === 'saving'
                  ? 'text-gray-400'
                  : saveState === 'saved'
                    ? 'text-green-600'
                    : 'text-transparent'
            }`}
          >
            {saveState === 'error' ? 'Save failed' : saveState === 'saving' ? 'Saving…' : 'Saved'}
          </span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">
            ×
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Title</span>
          <input
            className="mt-1 w-full rounded border-gray-300 border px-2 py-1.5 text-sm focus:ring-blue-500 focus:border-blue-500"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
          />
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.isDone}
            onChange={(e) => set('isDone', e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span className="text-sm font-medium text-gray-700">Mark as done</span>
        </label>

        <div className="block">
          <span className="text-sm font-medium text-gray-700">Deadline</span>

          {/* Quick presets — fill the date + hour pickers below (whole hours). */}
          <select
            value=""
            onChange={(e) => {
              const preset = DEADLINE_PRESETS.find((p) => p.value === e.target.value);
              if (!preset) return;
              const parts = presetToParts(preset);
              setForm((f) => ({
                ...f,
                deadlineDate: parts.date,
                deadlineHour12: parts.hour12,
                deadlineAmPm: parts.ampm,
              }));
            }}
            className="mt-1 w-full rounded border-gray-300 border px-2 py-1.5 text-sm bg-white"
          >
            <option value="">— Quick set —</option>
            {DEADLINE_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>

          {/* Custom whole-hour picker: date + Hour (1–12) + AM/PM. */}
          <input
            type="date"
            className="mt-1 w-full rounded border-gray-300 border px-2 py-1.5 text-sm"
            value={form.deadlineDate}
            onChange={(e) => set('deadlineDate', e.target.value)}
          />
          <div className="mt-1 flex gap-1">
            <select
              value={form.deadlineHour12}
              onChange={(e) => set('deadlineHour12', e.target.value)}
              disabled={!form.deadlineDate}
              className="flex-1 rounded border-gray-300 border px-2 py-1.5 text-sm bg-white disabled:opacity-50"
              title={form.deadlineDate ? '' : 'Pick a date first'}
            >
              {HOURS_12.map((h) => (
                <option key={h} value={String(h)}>
                  {h}:00
                </option>
              ))}
            </select>
            <select
              value={form.deadlineAmPm}
              onChange={(e) => set('deadlineAmPm', e.target.value)}
              disabled={!form.deadlineDate}
              className="w-20 rounded border-gray-300 border px-2 py-1.5 text-sm bg-white disabled:opacity-50"
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>

          {form.deadlineDate && (
            <button
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  deadlineDate: '',
                  deadlineHour12: '9',
                  deadlineAmPm: 'AM',
                }))
              }
              className="mt-1 text-xs text-blue-600 hover:underline"
            >
              Clear deadline
            </button>
          )}
        </div>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Assignee</span>
          <select
            className="mt-1 w-full rounded border-gray-300 border px-2 py-1.5 text-sm bg-white"
            value={form.assigneeId}
            onChange={(e) => set('assigneeId', e.target.value)}
          >
            <option value="">— Unassigned —</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Notes</span>
          <textarea
            rows={4}
            className="mt-1 w-full rounded border-gray-300 border px-2 py-1.5 text-sm"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </label>
      </div>

      <div className="border-t p-4 space-y-2">
        <div className="flex gap-2">
          <button
            onClick={() => onAddChild(task)}
            className="flex-1 rounded border border-gray-300 py-2 text-sm hover:bg-gray-50"
          >
            + Child
          </button>
          <button
            onClick={() => onAddSibling(task)}
            disabled={isRoot}
            className="flex-1 rounded border border-gray-300 py-2 text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            title={isRoot ? 'A root node has no siblings' : ''}
          >
            + Sibling
          </button>
        </div>
        <button
          onClick={() => onDelete(task)}
          className="w-full rounded border border-red-300 text-red-700 py-2 text-sm hover:bg-red-50"
        >
          Delete node{task.parentId == null ? '' : ' & descendants'}
        </button>
      </div>
    </div>
  );
}
