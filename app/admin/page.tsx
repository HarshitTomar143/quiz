"use client";

import { useCallback, useEffect, useState } from "react";
import { ADMIN_HEADER } from "@/lib/constants";
import type { Question } from "@/lib/types";

const PW_KEY = "quiz_admin_pw";
const MAX_OPTIONS = 6;

export default function AdminPage() {
  const [password, setPassword] = useState<string | null>(null);

  // Restore a previously verified password from localStorage on mount.
  useEffect(() => {
    const saved = localStorage.getItem(PW_KEY);
    if (saved) setPassword(saved);
  }, []);

  if (!password) {
    return <PasswordGate onUnlock={setPassword} />;
  }

  return (
    <AdminPanel
      password={password}
      onLogout={() => {
        localStorage.removeItem(PW_KEY);
        setPassword(null);
      }}
    />
  );
}

function PasswordGate({ onUnlock }: { onUnlock: (pw: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { [ADMIN_HEADER]: value },
      });
      if (res.ok) {
        localStorage.setItem(PW_KEY, value);
        onUnlock(value);
      } else {
        setError("Incorrect password.");
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-2xl font-bold text-slate-900">Admin login</h1>
      <p className="mt-1 text-sm text-slate-600">
        Enter the admin password to manage questions.
      </p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Password"
          autoFocus
          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading || !value}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}

type OptionDraft = { text: string; isCorrect: boolean };

function emptyOptions(): OptionDraft[] {
  return [
    { text: "", isCorrect: true },
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
  ];
}

function AdminPanel({
  password,
  onLogout,
}: {
  password: string;
  onLogout: () => void;
}) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);

  const [text, setText] = useState("");
  const [options, setOptions] = useState<OptionDraft[]>(emptyOptions());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const authHeaders = useCallback(
    (extra?: Record<string, string>) => ({
      [ADMIN_HEADER]: password,
      ...extra,
    }),
    [password]
  );

  const loadQuestions = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await fetch("/api/questions");
      if (!res.ok) throw new Error();
      setQuestions(await res.json());
    } catch {
      setListError("Failed to load questions.");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  function setOptionText(index: number, newText: string) {
    setOptions((prev) =>
      prev.map((o, i) => (i === index ? { ...o, text: newText } : o))
    );
  }

  function setCorrect(index: number) {
    setOptions((prev) => prev.map((o, i) => ({ ...o, isCorrect: i === index })));
  }

  function addOption() {
    setOptions((prev) =>
      prev.length >= MAX_OPTIONS
        ? prev
        : [...prev, { text: "", isCorrect: false }]
    );
  }

  function removeOption(index: number) {
    setOptions((prev) => {
      if (prev.length <= 2) return prev;
      const next = prev.filter((_, i) => i !== index);
      // Ensure a correct answer still exists if we removed the marked one.
      if (!next.some((o) => o.isCorrect)) next[0].isCorrect = true;
      return next;
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const cleaned = options
      .map((o) => ({ text: o.text.trim(), isCorrect: o.isCorrect }))
      .filter((o) => o.text.length > 0);

    if (!text.trim()) {
      setFormError("Question text is required.");
      return;
    }
    if (cleaned.length < 2) {
      setFormError("Add at least 2 options.");
      return;
    }
    if (cleaned.filter((o) => o.isCorrect).length !== 1) {
      setFormError("Mark exactly one option as correct.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ text: text.trim(), options: cleaned }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create question.");
      }
      setText("");
      setOptions(emptyOptions());
      setFormSuccess("Question added.");
      await loadQuestions();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this question?")) return;
    try {
      const res = await fetch(`/api/questions/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error();
      setQuestions((prev) => prev.filter((q) => q.id !== id));
    } catch {
      alert("Failed to delete question.");
    }
  }

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Admin panel</h1>
        <button
          onClick={onLogout}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Log out
        </button>
      </div>

      {/* Add question */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Add a question</h2>
        <form onSubmit={handleCreate} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Question
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              placeholder="e.g. What is the capital of France?"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Options{" "}
              <span className="font-normal text-slate-400">
                (select the correct one)
              </span>
            </label>
            <div className="mt-2 space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct"
                    checked={opt.isCorrect}
                    onChange={() => setCorrect(i)}
                    className="h-4 w-4 accent-indigo-600"
                    aria-label={`Mark option ${i + 1} correct`}
                  />
                  <input
                    type="text"
                    value={opt.text}
                    onChange={(e) => setOptionText(i, e.target.value)}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    disabled={options.length <= 2}
                    className="rounded-md px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-red-600 disabled:opacity-30"
                    aria-label={`Remove option ${i + 1}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            {options.length < MAX_OPTIONS && (
              <button
                type="button"
                onClick={addOption}
                className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                + Add option
              </button>
            )}
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}
          {formSuccess && (
            <p className="text-sm text-green-600">{formSuccess}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-5 py-2 font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Add question"}
          </button>
        </form>
      </section>

      {/* Existing questions */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            Questions{" "}
            <span className="text-slate-400">({questions.length})</span>
          </h2>
        </div>

        {loadingList ? (
          <p className="mt-4 text-slate-500">Loading…</p>
        ) : listError ? (
          <p className="mt-4 text-red-600">{listError}</p>
        ) : questions.length === 0 ? (
          <p className="mt-4 text-slate-500">No questions yet. Add one above.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {questions.map((q) => (
              <li
                key={q.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <p className="font-medium text-slate-900">{q.text}</p>
                  <button
                    onClick={() => handleDelete(q.id)}
                    className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {q.options.map((o) => (
                    <li
                      key={o.id}
                      className={
                        o.isCorrect
                          ? "font-medium text-green-700"
                          : "text-slate-600"
                      }
                    >
                      {o.isCorrect ? "✓ " : "• "}
                      {o.text}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
