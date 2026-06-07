"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Question } from "@/lib/types";

// Shown in the popup that appears before the quiz starts.
// Edit these lines to change the disclaimer text.
const DISCLAIMER_PARAGRAPHS = [
  "This checker calculates your result mathematically using a predicted answer key — not the official answer key released by the examination board.",
  "The purpose of this app is only to give you a rough estimate of how many marks you may have scored. It is an approximate guess, not your final or official result.",
  "Actual marks may differ once the official answer key is published. Please use this score for self-evaluation purposes only.",
];

// Where in-progress quiz state is saved so an accidental refresh doesn't
// wipe the user's answers. Bump the version if the shape below changes.
const STORAGE_KEY = "quiz-progress-v1";

type SavedProgress = {
  order: string[]; // question ids, in the shuffled order shown to the user
  answers: Record<string, string>; // questionId -> selected optionId
  flagged?: string[]; // question ids the user marked for review
  current: number; // index into `order`
};

type Phase =
  | "loading"
  | "error"
  | "empty"
  | "disclaimer"
  | "resume"
  | "playing"
  | "results";

function readSavedProgress(): SavedProgress | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedProgress;
    if (!Array.isArray(data.order) || data.order.length === 0) return null;
    if (typeof data.answers !== "object" || data.answers === null) return null;
    return data;
  } catch {
    return null;
  }
}

function clearSavedProgress() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export default function QuizPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [phase, setPhase] = useState<Phase>("loading");

  // questionId -> selected optionId
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // questionId -> true when marked for review
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [current, setCurrent] = useState(0);

  // Progress found in localStorage on load (the "Resume?" prompt uses this).
  const [saved, setSaved] = useState<SavedProgress | null>(null);

  // UI toggles for the playing screen.
  const [showPalette, setShowPalette] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/questions");
        if (!res.ok) throw new Error();
        const data: Question[] = await res.json();
        if (!active) return;
        if (data.length === 0) {
          setPhase("empty");
          return;
        }
        setQuestions(data);
        // Offer to resume if a previous attempt was left unfinished.
        const progress = readSavedProgress();
        if (progress) {
          setSaved(progress);
          setPhase("resume");
        } else {
          setPhase("disclaimer");
        }
      } catch {
        if (active) setPhase("error");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Persist progress while the quiz is being played, so a refresh / accidental
  // tab close can be recovered. Cleared on finish (see finishQuiz).
  useEffect(() => {
    if (phase !== "playing") return;
    const data: SavedProgress = {
      order: questions.map((q) => q.id),
      answers,
      flagged: Object.keys(flagged).filter((id) => flagged[id]),
      current,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* storage full or unavailable — non-fatal */
    }
  }, [phase, questions, answers, flagged, current]);

  // Warn before leaving (refresh / close) mid-quiz. The browser shows its own
  // generic "Leave site?" dialog; the text below is ignored by modern browsers.
  useEffect(() => {
    if (phase !== "playing") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  function start() {
    // Fresh attempt: shuffle for variety and discard any saved progress.
    clearSavedProgress();
    setSaved(null);
    setQuestions((prev) => [...prev].sort(() => Math.random() - 0.5));
    setAnswers({});
    setFlagged({});
    setCurrent(0);
    setShowPalette(false);
    setPhase("playing");
  }

  function resume() {
    if (!saved) {
      start();
      return;
    }
    // Re-order the freshly fetched questions to match the saved order, so the
    // user sees the same sequence. New questions (added since) go to the end;
    // questions that no longer exist are dropped.
    const byId = new Map(questions.map((q) => [q.id, q]));
    const ordered: Question[] = [];
    for (const id of saved.order) {
      const q = byId.get(id);
      if (q) {
        ordered.push(q);
        byId.delete(id);
      }
    }
    for (const q of byId.values()) ordered.push(q);

    // Keep only answers / flags that still point at a question we have.
    const validAnswers: Record<string, string> = {};
    const validFlags: Record<string, boolean> = {};
    const savedFlags = new Set(saved.flagged ?? []);
    for (const q of ordered) {
      if (saved.answers[q.id]) validAnswers[q.id] = saved.answers[q.id];
      if (savedFlags.has(q.id)) validFlags[q.id] = true;
    }

    setQuestions(ordered);
    setAnswers(validAnswers);
    setFlagged(validFlags);
    setCurrent(Math.min(saved.current, ordered.length - 1));
    setShowPalette(false);
    setPhase("playing");
  }

  const score = useMemo(() => {
    let correct = 0;
    for (const q of questions) {
      const chosen = answers[q.id];
      const correctOption = q.options.find((o) => o.isCorrect);
      if (chosen && correctOption && chosen === correctOption.id) correct++;
    }
    return correct;
  }, [questions, answers]);

  if (phase === "loading") {
    return <p className="text-slate-500">Loading quiz…</p>;
  }

  if (phase === "error") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <p className="font-medium text-red-700">Couldn’t load the quiz.</p>
        <p className="mt-1 text-sm text-red-600">
          Make sure the database is configured and the dev server is running.
        </p>
      </div>
    );
  }

  if (phase === "empty") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-medium text-slate-900">
          No questions available
        </p>
        <p className="mt-1 text-slate-600">
          There are no questions to show right now. Please check back later.
        </p>
      </div>
    );
  }

  if (phase === "resume") {
    const answeredCount = saved ? Object.keys(saved.answers).length : 0;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
        <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl sm:p-8">
          <h2 className="text-xl font-bold text-slate-900">
            Resume your quiz?
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            We found a quiz you didn’t finish — you’d answered{" "}
            <span className="font-semibold text-slate-900">
              {answeredCount}
            </span>{" "}
            question{answeredCount === 1 ? "" : "s"}. You can pick up where you
            left off, or start a fresh attempt.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={resume}
              className="flex-1 rounded-lg bg-indigo-600 px-6 py-2.5 font-medium text-white transition hover:bg-indigo-700"
            >
              Resume
            </button>
            <button
              onClick={start}
              className="flex-1 rounded-lg border border-slate-300 px-6 py-2.5 font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Start over
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "disclaimer") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
        <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl sm:p-8">
          {/* Cross icon — closing the disclaimer starts the quiz. */}
          <button
            onClick={start}
            aria-label="Close disclaimer and start quiz"
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <span className="text-xl leading-none">✕</span>
          </button>

          <h2 className="text-xl font-bold text-slate-900">Disclaimer</h2>
          <div className="mt-3 space-y-2 text-sm leading-relaxed text-slate-600">
            {DISCLAIMER_PARAGRAPHS.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>

          <button
            onClick={start}
            className="mt-6 w-full rounded-lg bg-indigo-600 px-6 py-2.5 font-medium text-white transition hover:bg-indigo-700"
          >
            Start quiz
          </button>
        </div>
      </div>
    );
  }

  if (phase === "results") {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Your score</h1>
          <p className="mt-3 text-5xl font-bold text-indigo-600">
            {score}/{questions.length}
          </p>
          <p className="mt-1 text-slate-600">{pct}% correct</p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={start}
              className="rounded-lg bg-indigo-600 px-5 py-2 font-medium text-white hover:bg-indigo-700"
            >
              Check again
            </button>
            <Link
              href="/"
              className="rounded-lg border border-slate-300 px-5 py-2 font-medium text-slate-700 hover:bg-slate-100"
            >
              Home
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Review</h2>
          {questions.map((q, i) => {
            const chosenId = answers[q.id];
            return (
              <div
                key={q.id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <p className="font-medium text-slate-900">
                  {i + 1}. {q.text}
                </p>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {q.options.map((o) => {
                    const isChosen = o.id === chosenId;
                    let cls = "text-slate-600";
                    let mark = "";
                    if (o.isCorrect) {
                      cls = "font-medium text-green-700";
                      mark = "✓";
                    } else if (isChosen) {
                      cls = "font-medium text-red-700";
                      mark = "✗";
                    }
                    return (
                      <li key={o.id} className={cls}>
                        <span className="inline-block w-4">{mark}</span>
                        {o.text}
                        {isChosen && !o.isCorrect && (
                          <span className="ml-2 text-xs text-red-500">
                            (your answer)
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {!chosenId && (
                  <p className="mt-2 text-xs text-amber-600">Not answered</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // phase === "playing"
  const q = questions[current];
  const selected = answers[q.id];
  const isFlagged = !!flagged[q.id];
  const answeredCount = Object.keys(answers).length;
  const unansweredCount = questions.length - answeredCount;
  const flaggedCount = Object.values(flagged).filter(Boolean).length;

  function choose(optionId: string) {
    setAnswers((prev) => ({ ...prev, [q.id]: optionId }));
  }

  function toggleFlag() {
    setFlagged((prev) => {
      const next = { ...prev };
      if (next[q.id]) delete next[q.id];
      else next[q.id] = true;
      return next;
    });
  }

  function goTo(index: number) {
    setCurrent(index);
    setShowPalette(false);
  }

  function finishQuiz() {
    setShowSubmitConfirm(false);
    setPhase("results");
    // This attempt is done — drop the saved progress so the next visit
    // starts fresh rather than offering to resume a completed quiz.
    clearSavedProgress();
    setSaved(null);
    // Record this attempt for admin engagement stats (best-effort —
    // a failure here must never block the user from seeing their result).
    fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score, total: questions.length }),
    }).catch(() => {});
  }

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            Question {current + 1} of {questions.length}
          </span>
          <button
            onClick={() => setShowPalette((s) => !s)}
            className="font-medium text-indigo-600 transition hover:text-indigo-700"
          >
            {answeredCount} answered
            {flaggedCount > 0 && ` · ${flaggedCount} flagged`} ·{" "}
            {showPalette ? "Hide" : "All questions"}
          </button>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full bg-indigo-600 transition-all"
            style={{
              width: `${((current + 1) / questions.length) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Question palette — jump to any question. Color shows answered state. */}
      {showPalette && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-indigo-600" /> Answered
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-slate-300 bg-white" />{" "}
              Not answered
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-amber-400" /> Flagged
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded ring-2 ring-indigo-400" /> Current
            </span>
          </div>
          <div className="grid max-h-64 grid-cols-6 gap-2 overflow-y-auto sm:grid-cols-10">
            {questions.map((item, i) => {
              const isAnswered = !!answers[item.id];
              const isItemFlagged = !!flagged[item.id];
              const isCurrent = i === current;
              return (
                <button
                  key={item.id}
                  onClick={() => goTo(i)}
                  className={`relative flex h-9 w-full items-center justify-center rounded-lg border text-sm font-medium transition ${
                    isAnswered
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  } ${isCurrent ? "ring-2 ring-indigo-400 ring-offset-1" : ""}`}
                >
                  {i + 1}
                  {isItemFlagged && (
                    <span
                      aria-label="Flagged for review"
                      className="absolute -right-1 -top-1 h-3 w-3 rounded-full border border-white bg-amber-400"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Question */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-semibold text-slate-900">{q.text}</h1>
          <button
            onClick={toggleFlag}
            aria-pressed={isFlagged}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              isFlagged
                ? "border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100"
                : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span>🚩</span>
            {isFlagged ? "Flagged" : "Flag for review"}
          </button>
        </div>
        <div className="mt-5 space-y-3">
          {q.options.map((o) => {
            const active = selected === o.id;
            return (
              <button
                key={o.id}
                onClick={() => choose(o.id)}
                className={`flex w-full items-center rounded-xl border px-4 py-3 text-left transition ${
                  active
                    ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                    : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
                }`}
              >
                <span
                  className={`mr-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    active
                      ? "border-indigo-600 bg-indigo-600"
                      : "border-slate-300"
                  }`}
                >
                  {active && (
                    <span className="h-2 w-2 rounded-full bg-white" />
                  )}
                </span>
                <span className="text-slate-800">{o.text}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          disabled={current === 0}
          className="rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
        >
          Previous
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSubmitConfirm(true)}
            className="rounded-lg bg-green-600 px-5 py-2 font-medium text-white transition hover:bg-green-700"
          >
            Submit quiz
          </button>
          <button
            onClick={() =>
              setCurrent((c) => Math.min(questions.length - 1, c + 1))
            }
            disabled={current === questions.length - 1}
            className="rounded-lg bg-indigo-600 px-5 py-2 font-medium text-white transition hover:bg-indigo-700 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      {/* Submit confirmation */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl sm:p-8">
            <h2 className="text-xl font-bold text-slate-900">Submit quiz?</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              You’ve answered{" "}
              <span className="font-semibold text-slate-900">
                {answeredCount}
              </span>{" "}
              of {questions.length} questions.
              {unansweredCount > 0 && (
                <>
                  {" "}
                  <span className="font-semibold text-amber-600">
                    {unansweredCount}
                  </span>{" "}
                  {unansweredCount === 1 ? "is" : "are"} still unanswered.
                </>
              )}{" "}
              Once you submit, you’ll see your score and can’t change your
              answers.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
              <button
                onClick={finishQuiz}
                className="flex-1 rounded-lg bg-green-600 px-6 py-2.5 font-medium text-white transition hover:bg-green-700"
              >
                Submit
              </button>
              <button
                onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 rounded-lg border border-slate-300 px-6 py-2.5 font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Keep going
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
