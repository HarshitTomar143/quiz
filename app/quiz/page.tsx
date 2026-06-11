"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Question } from "@/lib/types";

// Shown in the popup that appears before the quiz starts.
// Edit these lines to change the disclaimer text.
const DISCLAIMER_PARAGRAPHS = [
  "यह चेकर आपके परिणाम की गणना एक अनुमानित उत्तर कुंजी के आधार पर गणितीय रूप से करता है — न कि परीक्षा बोर्ड द्वारा जारी आधिकारिक उत्तर कुंजी के आधार पर।",
  "इस ऐप का उद्देश्य केवल आपको एक मोटा अनुमान देना है कि आपने लगभग कितने अंक प्राप्त किए होंगे। यह एक अनुमानित अंदाज़ा है, आपका अंतिम या आधिकारिक परिणाम नहीं।",
  "आधिकारिक उत्तर कुंजी जारी होने के बाद वास्तविक अंक भिन्न हो सकते हैं। कृपया इस स्कोर का उपयोग केवल स्व-मूल्यांकन के लिए करें।",
];

// Shown in the "How it works" popup opened from the (i) info button.
// Edit these steps to change the on-screen instructions.
const INSTRUCTION_STEPS = [
  "हर प्रश्न में वही विकल्प चुनें जो आपने वास्तविक परीक्षा में चुना था।",
  "जिस प्रश्न पर बाद में लौटना चाहते हैं उसे चिह्नित करने के लिए “Flag for review” का उपयोग करें, और प्रश्नों के बीच जाने के लिए “All questions” का।",
  "अपने सभी उत्तर भरने के बाद, अपना अनुमानित स्कोर और चयन की संभावना देखने के लिए “Submit quiz” पर टैप करें।",
  "आपके परिणाम के साथ एक 6-अंकों का कोड मिलेगा — इसे सहेज लें ताकि बाद में बिना दोबारा टेस्ट दिए वही परिणाम फिर से देख सकें।",
];

// Number of correct answers at/above which the report card shows a
// positive selection-chance message.
const SELECTION_THRESHOLD = 118;

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

// Small round "i" info button. Opens the instructions popup.
function InfoButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="How it works"
      title="How it works"
      className="flex h-8 w-8 items-center justify-center rounded-full border border-indigo-300 bg-white font-serif text-base font-bold italic text-indigo-600 transition hover:bg-indigo-50"
    >
      i
    </button>
  );
}

// "How it works" popup explaining how to use the predictor.
function InstructionsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl sm:p-8">
        <button
          onClick={onClose}
          aria-label="Close instructions"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <span className="text-xl leading-none">✕</span>
        </button>

        <h2 className="text-xl font-bold text-slate-900">यह कैसे काम करता है</h2>
        <p className="mt-2 text-sm text-slate-600">
          अपना परिणाम जानने के लिए अपनी परीक्षा यहाँ दोबारा भरें:
        </p>
        <ol className="mt-4 space-y-3">
          {INSTRUCTION_STEPS.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
                {i + 1}
              </span>
              <span className="text-sm leading-relaxed text-slate-700">
                {step}
              </span>
            </li>
          ))}
        </ol>

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-lg bg-indigo-600 px-6 py-2.5 font-medium text-white transition hover:bg-indigo-700"
        >
          समझ गया
        </button>
      </div>
    </div>
  );
}

// A creative, self-contained SVG "result card" shown on the results screen.
// Everything (gauge, ribbons, code) is drawn as SVG so it scales crisply and
// reads like a printed scorecard. Colours shift to green/amber based on whether
// the user cleared the selection threshold.
function ReportCard({
  score,
  total,
  pct,
  selected,
  code,
}: {
  score: number;
  total: number;
  pct: number;
  selected: boolean;
  code: string | null;
}) {
  // Progress ring geometry.
  const cx = 320;
  const cy = 280;
  const r = 92;
  const circ = 2 * Math.PI * r;
  const dash = (circ * Math.min(100, Math.max(0, pct))) / 100;

  // Accent colours depend on the verdict.
  const ringId = selected ? "ringPass" : "ringFail";
  const verdictBg = selected ? "#ecfdf5" : "#fffbeb";
  const verdictText = selected ? "#047857" : "#b45309";
  const verdictMsg = selected
    ? "You have a very good chance of selection!"
    : "Keep practising — you can do better!";

  const height = code ? 600 : 480;

  return (
    <svg
      viewBox={`0 0 640 ${height}`}
      className="block w-full"
      role="img"
      aria-label={`Result card: scored ${score} out of ${total}, ${pct} percent`}
    >
      <defs>
        <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4f46e5" />
          <stop offset="55%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#c026d3" />
        </linearGradient>
        <linearGradient id="ringPass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6ee7b7" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
        <linearGradient id="ringFail" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#fb923c" />
        </linearGradient>
      </defs>

      {/* Background + decorative flourishes */}
      <rect x="0" y="0" width="640" height={height} fill="url(#bgGrad)" />
      <circle cx="585" cy="55" r="95" fill="#ffffff" opacity="0.07" />
      <circle cx="45" cy={height - 60} r="120" fill="#ffffff" opacity="0.07" />
      <rect
        x="18"
        y="18"
        width="604"
        height={height - 36}
        rx="22"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.35"
        strokeWidth="1.5"
        strokeDasharray="2 8"
        strokeLinecap="round"
      />

      {/* Header */}
      <text
        x="320"
        y="62"
        textAnchor="middle"
        fontSize="30"
        aria-hidden="true"
      >
        🏆
      </text>
      <text
        x="320"
        y="104"
        textAnchor="middle"
        fill="#ffffff"
        fontSize="22"
        fontWeight="800"
        letterSpacing="2"
      >
        UPTGT HINDI 2026
      </text>
      <text
        x="320"
        y="130"
        textAnchor="middle"
        fill="#ffffff"
        fillOpacity="0.85"
        fontSize="14"
        fontWeight="600"
        letterSpacing="5"
      >
        RESULT PREDICTOR
      </text>

      {/* Progress gauge */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.2"
        strokeWidth="16"
      />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={`url(#${ringId})`}
        strokeWidth="16"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        fill="#ffffff"
        fontSize="60"
        fontWeight="800"
      >
        {score}
      </text>
      <text
        x={cx}
        y={cy + 30}
        textAnchor="middle"
        fill="#ffffff"
        fillOpacity="0.85"
        fontSize="17"
        fontWeight="600"
        letterSpacing="1"
      >
        out of {total}
      </text>

      {/* Percentage caption */}
      <text
        x="320"
        y={cy + r + 36}
        textAnchor="middle"
        fill="#ffffff"
        fontSize="18"
        fontWeight="700"
        letterSpacing="1"
      >
        {pct}% correct
      </text>

      {/* Verdict ribbon */}
      <rect
        x="100"
        y={cy + r + 56}
        width="440"
        height="46"
        rx="23"
        fill={verdictBg}
      />
      <text
        x="320"
        y={cy + r + 85}
        textAnchor="middle"
        fill={verdictText}
        fontSize="16"
        fontWeight="700"
      >
        {selected ? "🎉 " : ""}
        {verdictMsg}
      </text>

      {/* Result code — save & re-open later */}
      {code && (
        <>
          <text
            x="320"
            y={cy + r + 138}
            textAnchor="middle"
            fill="#ffffff"
            fillOpacity="0.85"
            fontSize="12"
            fontWeight="600"
            letterSpacing="3"
          >
            YOUR RESULT CODE
          </text>
          <rect
            x="205"
            y={cy + r + 150}
            width="230"
            height="54"
            rx="14"
            fill="#ffffff"
          />
          <text
            x="320"
            y={cy + r + 186}
            textAnchor="middle"
            fill="#4338ca"
            fontSize="34"
            fontWeight="800"
            letterSpacing="8"
          >
            {code}
          </text>
          <text
            x="320"
            y={cy + r + 226}
            textAnchor="middle"
            fill="#ffffff"
            fillOpacity="0.8"
            fontSize="12"
          >
            Save it — enter it on the start screen to reopen this result.
          </text>
        </>
      )}
    </svg>
  );
}

export default function QuizPage() {
  // The full set of questions as fetched. `questions` below is the working
  // list (shuffled for an attempt, or reordered to rebuild a saved result),
  // while `allQuestions` always holds the complete set for a fresh start.
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [phase, setPhase] = useState<Phase>("loading");

  // questionId -> selected optionId
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // questionId -> true when marked for review
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [current, setCurrent] = useState(0);

  // Progress found in localStorage on load (the "Resume?" prompt uses this).
  const [saved, setSaved] = useState<SavedProgress | null>(null);

  // The 6-digit code for the result currently on the results screen (set after
  // submitting, or when re-opening a past result by code).
  const [resultCode, setResultCode] = useState<string | null>(null);
  // When set, the results screen shows this stored score/total instead of
  // recomputing — used when viewing a past result by code.
  const [viewResult, setViewResult] = useState<{
    score: number;
    total: number;
  } | null>(null);

  // The "view a past result" code field on the disclaimer screen.
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);

  // UI toggles for the playing screen.
  const [showPalette, setShowPalette] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

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
        setAllQuestions(data);
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
    // Fresh attempt: shuffle the full question set and discard any saved
    // progress or previously viewed result.
    clearSavedProgress();
    setSaved(null);
    setResultCode(null);
    setViewResult(null);
    setQuestions([...allQuestions].sort(() => Math.random() - 0.5));
    setAnswers({});
    setFlagged({});
    setCurrent(0);
    setShowPalette(false);
    setPhase("playing");
  }

  // Re-open a past result from its 6-digit code. Rebuilds the same results
  // screen (score + per-question review) the user saw when they finished.
  async function viewPastResult() {
    const code = codeInput.trim();
    if (!/^\d{6}$/.test(code)) {
      setCodeError("Enter the 6-digit code you were given.");
      return;
    }
    setCodeError(null);
    setCodeLoading(true);
    try {
      const res = await fetch(`/api/submissions/${code}`);
      if (!res.ok) {
        setCodeError(
          res.status === 404
            ? "No result found for that code."
            : "Couldn’t load that result. Please try again."
        );
        return;
      }
      const data: {
        code: string;
        score: number;
        total: number;
        answers: Record<string, string>;
        order: string[];
      } = await res.json();

      // Rebuild the question list in the saved order (dropping any questions
      // that have since been deleted), and restore the saved answers.
      const byId = new Map(allQuestions.map((q) => [q.id, q]));
      const ordered: Question[] = [];
      for (const id of data.order) {
        const q = byId.get(id);
        if (q) ordered.push(q);
      }
      const validAnswers: Record<string, string> = {};
      for (const q of ordered) {
        if (data.answers[q.id]) validAnswers[q.id] = data.answers[q.id];
      }

      setQuestions(ordered);
      setAnswers(validAnswers);
      setFlagged({});
      setResultCode(String(data.code));
      setViewResult({ score: data.score, total: data.total });
      setCodeInput("");
      setShowPalette(false);
      setPhase("results");
    } catch {
      setCodeError("Couldn’t load that result. Please try again.");
    } finally {
      setCodeLoading(false);
    }
  }

  function resume() {
    if (!saved) {
      start();
      return;
    }
    // Re-order the freshly fetched questions to match the saved order, so the
    // user sees the same sequence. New questions (added since) go to the end;
    // questions that no longer exist are dropped.
    const byId = new Map(allQuestions.map((q) => [q.id, q]));
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
        {showInstructions && (
          <InstructionsModal onClose={() => setShowInstructions(false)} />
        )}
        <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl sm:p-8">
          {/* Info button — explains how to use the predictor. */}
          <div className="absolute left-4 top-4">
            <InfoButton onClick={() => setShowInstructions(true)} />
          </div>
          {/* Cross icon — closing the disclaimer starts the quiz. */}
          <button
            onClick={start}
            aria-label="Close disclaimer and start quiz"
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <span className="text-xl leading-none">✕</span>
          </button>

          <div className="mb-5 mt-8 rounded-xl bg-linear-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-5 py-4 text-center">
            <p className="text-lg font-extrabold tracking-wide text-white">
              UPTGT HINDI 2026
            </p>
            <p className="text-xs font-semibold tracking-[0.3em] text-white/85">
              RESULT PREDICTOR
            </p>
          </div>

          <h2 className="text-xl font-bold text-slate-900">अस्वीकरण</h2>
          <div className="mt-3 space-y-2 text-sm leading-relaxed text-slate-600">
            {DISCLAIMER_PARAGRAPHS.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>

          <button
            onClick={start}
            className="mt-6 w-full rounded-lg bg-indigo-600 px-6 py-2.5 font-medium text-white transition hover:bg-indigo-700"
          >
            क्विज़ शुरू करें
          </button>

          {/* Re-open a past result by its 6-digit code. */}
          <div className="mt-6 border-t border-slate-200 pt-5">
            <p className="text-sm font-medium text-slate-700">
              Already took the test?
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Enter the 6-digit code from your result to view it again.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                viewPastResult();
              }}
              className="mt-3 flex gap-2"
            >
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={codeInput}
                onChange={(e) => {
                  // Digits only, at most 6.
                  setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setCodeError(null);
                }}
                placeholder="123456"
                className="w-32 rounded-lg border border-slate-300 px-3 py-2 tracking-widest outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
              <button
                type="submit"
                disabled={codeLoading || codeInput.length !== 6}
                className="rounded-lg border border-indigo-300 px-4 py-2 font-medium text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-40"
              >
                {codeLoading ? "Loading…" : "View result"}
              </button>
            </form>
            {codeError && (
              <p className="mt-2 text-sm text-red-600">{codeError}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "results") {
    // When re-viewing a past result, show the stored score/total; otherwise
    // use the score just computed from the current attempt.
    const displayScore = viewResult ? viewResult.score : score;
    const displayTotal = viewResult ? viewResult.total : questions.length;
    const pct =
      displayTotal > 0 ? Math.round((displayScore / displayTotal) * 100) : 0;
    const selected = displayScore >= SELECTION_THRESHOLD;
    return (
      <div className="space-y-6">
        <div className="overflow-hidden rounded-2xl shadow-xl">
          <ReportCard
            score={displayScore}
            total={displayTotal}
            pct={pct}
            selected={selected}
            code={resultCode}
          />

          <div className="bg-white px-6 pb-7 pt-1 text-center">
            <div className="mt-2 flex justify-center gap-3">
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

            {/* Tiny disclaimer — the score is produced with the help of AI. */}
            <p className="mt-5 text-xs text-slate-400">
              This score is calculated with the help of AI and is an approximate
              estimate, not your official result.
            </p>
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
    setViewResult(null);
    setResultCode(null);
    setPhase("results");
    // This attempt is done — drop the saved progress so the next visit
    // starts fresh rather than offering to resume a completed quiz.
    clearSavedProgress();
    setSaved(null);
    // Record this attempt — this both powers admin engagement stats and
    // returns the 6-digit code the user uses to re-open this result later.
    // Best-effort: a failure here must never block the user's result; they
    // simply won't get a code that time.
    fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        score,
        total: questions.length,
        answers,
        order: questions.map((item) => item.id),
      }),
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        if (data?.code) setResultCode(String(data.code));
      })
      .catch(() => {});
  }

  return (
    <div className="space-y-6">
      {showInstructions && (
        <InstructionsModal onClose={() => setShowInstructions(false)} />
      )}

      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span className="flex items-center gap-2">
            <InfoButton onClick={() => setShowInstructions(true)} />
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
