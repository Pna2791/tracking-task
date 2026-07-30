import { useEffect, useState } from 'react';
import { api } from '../api';

// Simple CRUD screen for the shared list of people that tasks can be
// assigned to. Not an auth system — just names.
export default function AssigneesPage() {
  const [assignees, setAssignees] = useState([]);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [error, setError] = useState(null);

  async function load() {
    setAssignees(await api.getAssignees());
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    try {
      await api.createAssignee(name);
      setNewName('');
      setError(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSaveEdit(id) {
    const name = editingName.trim();
    if (!name) return;
    await api.updateAssignee(id, name);
    setEditingId(null);
    load();
  }

  async function handleDelete(id) {
    if (!confirm('Delete this person? Tasks assigned to them will become unassigned.')) return;
    await api.deleteAssignee(id);
    load();
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-xl font-semibold text-gray-800 mb-4">Manage assignees</h1>

      <form onSubmit={handleAdd} className="flex gap-2 mb-4">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New person's name"
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
        />
        <button className="rounded bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700">
          Add
        </button>
      </form>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <ul className="divide-y divide-gray-200 border border-gray-200 rounded">
        {assignees.length === 0 && (
          <li className="px-4 py-3 text-sm text-gray-500">No assignees yet. Add one above.</li>
        )}
        {assignees.map((a) => (
          <li key={a.id} className="flex items-center gap-2 px-4 py-2">
            {editingId === a.id ? (
              <>
                <input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                  autoFocus
                />
                <button
                  onClick={() => handleSaveEdit(a.id)}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="text-sm text-gray-500 hover:underline"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-gray-800">{a.name}</span>
                <button
                  onClick={() => {
                    setEditingId(a.id);
                    setEditingName(a.name);
                  }}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(a.id)}
                  className="text-sm text-red-600 hover:underline"
                >
                  Delete
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
