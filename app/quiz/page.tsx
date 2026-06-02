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

type Phase =
  | "loading"
  | "error"
  | "empty"
  | "disclaimer"
  | "playing"
  | "results";

export default function QuizPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [phase, setPhase] = useState<Phase>("loading");

  // questionId -> selected optionId
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState(0);

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
        } else {
          setQuestions(data);
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

  function start() {
    // Shuffle for variety each play-through.
    setQuestions((prev) => [...prev].sort(() => Math.random() - 0.5));
    setAnswers({});
    setCurrent(0);
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
  const isLast = current === questions.length - 1;

  function choose(optionId: string) {
    setAnswers((prev) => ({ ...prev, [q.id]: optionId }));
  }

  function finishQuiz() {
    setPhase("results");
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
          <span>
            {Object.keys(answers).length} answered
          </span>
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

      {/* Question */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">{q.text}</h1>
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
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          disabled={current === 0}
          className="rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
        >
          Previous
        </button>
        {isLast ? (
          <button
            onClick={finishQuiz}
            className="rounded-lg bg-green-600 px-5 py-2 font-medium text-white transition hover:bg-green-700"
          >
            Finish
          </button>
        ) : (
          <button
            onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}
            className="rounded-lg bg-indigo-600 px-5 py-2 font-medium text-white transition hover:bg-indigo-700"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}
