"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Question } from "@/lib/types";

// Shown in the popup that appears before the quiz starts.
// Edit these lines to change the disclaimer text.
const DISCLAIMER_PARAGRAPHS = [
  "यह एक AI रिज़ल्ट प्रेडिक्टर है। अब आपके अंकों की गणना परीक्षा बोर्ड द्वारा जारी आधिकारिक उत्तर कुंजी के आधार पर की जाती है।",
  "प्रत्येक प्रश्न 4 अंक का है। आपका परिणाम आपके सही उत्तरों की संख्या और कुल अंकों — दोनों के रूप में दिखाया जाता है।",
  "यह AI आधारित अनुमान केवल स्व-मूल्यांकन के लिए है। चयन की अंतिम पुष्टि बोर्ड द्वारा जारी आधिकारिक परिणाम से ही मानी जाएगी।",
];

// Shown in the "How it works" popup opened from the (i) info button.
// Edit these steps to change the on-screen instructions.
const INSTRUCTION_STEPS = [
  "अपनी श्रेणी (General/OBC/SC/ST) चुनें — आपकी चयन संभावना उसी श्रेणी के आधार पर आँकी जाती है।",
  "हर प्रश्न में वही विकल्प चुनें जो आपने वास्तविक परीक्षा में चुना था।",
  "जिस प्रश्न पर बाद में लौटना चाहते हैं उसे चिह्नित करने के लिए “Flag for review” का उपयोग करें, और प्रश्नों के बीच जाने के लिए “All questions” का।",
  "अपने सभी उत्तर भरने के बाद, अपना अनुमानित स्कोर और चयन की संभावना देखने के लिए “Submit quiz” पर टैप करें।",
  "आपके परिणाम के साथ एक 6-अंकों का कोड मिलेगा — इसे सहेज लें ताकि बाद में बिना दोबारा टेस्ट दिए वही परिणाम फिर से देख सकें।",
];

// ── Category / cut-off / vacancy data ──────────────────────────────────────
// Source: UP TGT Recruitment 2022 — Hindi, Balak varg.
// `cutoff` = number of correct answers at/above which the candidate is shown a
// positive selection-chance message for that category.
type Category = "UR" | "OBC" | "SC" | "ST";

const CATEGORIES: {
  id: Category;
  label: string;
  cutoff: number;
  vacancies: number;
}[] = [
  { id: "UR", label: "General / UR", cutoff: 118, vacancies: 294 },
  { id: "OBC", label: "OBC", cutoff: 116, vacancies: 125 },
  { id: "SC", label: "SC", cutoff: 111, vacancies: 89 },
  { id: "ST", label: "ST", cutoff: 111, vacancies: 1 },
];

const TOTAL_VACANCIES = 509;

// Each question carries 4 marks. Used to convert a correct-answer count into
// the marks shown on the result card (125 questions → 500 total marks).
const MARKS_PER_QUESTION = 4;

// Convert a correct-answer count into marks (e.g. 118 correct → 472 marks).
function toMarks(correct: number) {
  return correct * MARKS_PER_QUESTION;
}

function categoryInfo(cat: Category | null) {
  return CATEGORIES.find((c) => c.id === cat) ?? CATEGORIES[0];
}

// Self-contained professional avatars (drawn as SVG — no external images).
const AVATARS: { id: string; bg: string; fg: string }[] = [
  { id: "navy", bg: "#1e3a8a", fg: "#bfdbfe" },
  { id: "teal", bg: "#0f766e", fg: "#99f6e4" },
  { id: "slate", bg: "#334155", fg: "#cbd5e1" },
  { id: "emerald", bg: "#065f46", fg: "#a7f3d0" },
  { id: "amber", bg: "#92400e", fg: "#fde68a" },
  { id: "rose", bg: "#9f1239", fg: "#fecdd3" },
];

function avatarInfo(id: string | null) {
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}

// Where in-progress quiz state is saved so an accidental refresh doesn't
// wipe the user's answers. Bump the version if the shape below changes.
const STORAGE_KEY = "quiz-progress-v1";

type SavedProgress = {
  order: string[]; // question ids, in the shuffled order shown to the user
  answers: Record<string, string>; // questionId -> selected optionId
  flagged?: string[]; // question ids the user marked for review
  current: number; // index into `order`
  name?: string; // candidate profile, restored on resume
  category?: Category;
  avatar?: string;
};

type Phase =
  | "loading"
  | "error"
  | "empty"
  | "disclaimer"
  | "setup"
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

// Draws a clean head-and-shoulders avatar silhouette inside a coloured disc.
// Used both in the selection grid and embedded in the result card SVG.
function AvatarGlyph({
  cx,
  cy,
  r,
  bg,
  fg,
  id,
}: {
  cx: number;
  cy: number;
  r: number;
  bg: string;
  fg: string;
  id: string;
}) {
  const clipId = `avclip-${id}`;
  return (
    <>
      <clipPath id={clipId}>
        <circle cx={cx} cy={cy} r={r} />
      </clipPath>
      <circle cx={cx} cy={cy} r={r} fill={bg} />
      <g clipPath={`url(#${clipId})`}>
        <circle cx={cx} cy={cy - r * 0.12} r={r * 0.34} fill={fg} />
        <ellipse
          cx={cx}
          cy={cy + r * 0.66}
          rx={r * 0.58}
          ry={r * 0.46}
          fill={fg}
        />
      </g>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.35"
        strokeWidth={r * 0.06}
      />
    </>
  );
}

// A selectable avatar in the setup form.
function AvatarButton({
  avatar,
  selected,
  onClick,
}: {
  avatar: { id: string; bg: string; fg: string };
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`Avatar ${avatar.id}`}
      className={`rounded-full transition ${
        selected
          ? "ring-2 ring-blue-700 ring-offset-2"
          : "opacity-80 hover:opacity-100"
      }`}
    >
      <svg viewBox="0 0 64 64" className="h-12 w-12">
        <AvatarGlyph
          cx={32}
          cy={32}
          r={30}
          bg={avatar.bg}
          fg={avatar.fg}
          id={`pick-${avatar.id}`}
        />
      </svg>
    </button>
  );
}

// The UP TGT 2022 Hindi (Balak) vacancy breakdown. The candidate's chosen
// category column is highlighted.
function VacancyTable({ selected }: { selected: Category | null }) {
  const cols: { id: Category; label: string; value: string }[] = [
    { id: "UR", label: "General", value: "294" },
    { id: "OBC", label: "OBC", value: "125" },
    { id: "SC", label: "SC", value: "89" },
    { id: "ST", label: "ST", value: "01" },
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-800 px-4 py-2.5">
        <p className="text-sm font-semibold tracking-wide text-white">
          UP TGT 2022 — Hindi (Balak) Vacancies
        </p>
      </div>
      <table className="w-full text-center text-sm">
        <thead>
          <tr className="bg-slate-100 text-slate-600">
            <th className="px-3 py-2 text-left font-semibold">Varg</th>
            {cols.map((c) => (
              <th
                key={c.id}
                className={`px-3 py-2 font-semibold ${
                  selected === c.id ? "bg-blue-100 text-blue-900" : ""
                }`}
              >
                {c.label}
              </th>
            ))}
            <th className="px-3 py-2 font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr className="text-slate-800">
            <td className="px-3 py-2.5 text-left font-medium">Balak</td>
            {cols.map((c) => (
              <td
                key={c.id}
                className={`px-3 py-2.5 ${
                  selected === c.id
                    ? "bg-blue-50 font-bold text-blue-900"
                    : ""
                }`}
              >
                {c.value}
              </td>
            ))}
            <td className="px-3 py-2.5 font-bold text-slate-900">509</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// Small round "i" info button. Opens the instructions popup.
function InfoButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="How it works"
      title="How it works"
      className="flex h-8 w-8 items-center justify-center rounded-full border border-blue-300 bg-white font-serif text-base font-bold italic text-blue-800 transition hover:bg-blue-50"
    >
      i
    </button>
  );
}

// "How it works" popup explaining how to use the predictor.
function InstructionsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 p-4">
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
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-800 text-sm font-semibold text-white">
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
          className="mt-6 w-full rounded-lg bg-blue-800 px-6 py-2.5 font-medium text-white transition hover:bg-blue-900"
        >
          समझ गया
        </button>
      </div>
    </div>
  );
}

// A self-contained SVG "result card" shown on the results screen. Restyled to
// read like an official scorecard: a deep navy ground, the candidate's avatar
// and name, a score gauge, a category-specific selection verdict, the relevant
// vacancy figure, and the re-view code. Colours shift to emerald/amber based on
// whether the candidate cleared the cut-off for their category.
function ReportCard({
  name,
  score,
  total,
  pct,
  selected,
  categoryLabel,
  vacancies,
  avatarId,
  code,
}: {
  name: string | null;
  score: number;
  total: number;
  pct: number;
  selected: boolean;
  categoryLabel: string;
  vacancies: number;
  avatarId: string;
  code: string | null;
}) {
  // Progress ring geometry.
  const cx = 320;
  const cy = 332;
  const r = 88;
  const circ = 2 * Math.PI * r;
  const dash = (circ * Math.min(100, Math.max(0, pct))) / 100;

  // Accent colours depend on the verdict.
  const ringId = selected ? "ringPass" : "ringFail";
  const verdictBg = selected ? "#ecfdf5" : "#fee2e2";
  const verdictText = selected ? "#047857" : "#b91c1c";
  const verdictMsg = selected
    ? "High chance of selection"
    : "You will not be selected";

  const av = avatarInfo(avatarId);
  const heading = name && name.trim() ? name.trim() : "Candidate";
  const infoTop = cy + r + 130; // y of the first info line
  const height = code ? 740 : 600;

  return (
    <svg
      viewBox={`0 0 640 ${height}`}
      className="block w-full"
      role="img"
      aria-label={`Result card for ${heading}: scored ${score} out of ${total}, ${pct} percent`}
    >
      <defs>
        <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="55%" stopColor="#1e3a8a" />
          <stop offset="100%" stopColor="#1e40af" />
        </linearGradient>
        <linearGradient id="ringPass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
        <linearGradient id="ringFail" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
      </defs>

      {/* Background + restrained decorative flourishes */}
      <rect x="0" y="0" width="640" height={height} fill="url(#bgGrad)" />
      <circle cx="590" cy="60" r="90" fill="#ffffff" opacity="0.05" />
      <circle cx="40" cy={height - 70} r="120" fill="#ffffff" opacity="0.05" />
      <rect
        x="18"
        y="18"
        width="604"
        height={height - 36}
        rx="22"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.3"
        strokeWidth="1.5"
        strokeDasharray="2 8"
        strokeLinecap="round"
      />

      {/* Candidate avatar + name */}
      <AvatarGlyph cx={320} cy={92} r={40} bg={av.bg} fg={av.fg} id="card" />
      <text
        x="320"
        y="166"
        textAnchor="middle"
        fill="#ffffff"
        fontSize="22"
        fontWeight="800"
      >
        {heading}
      </text>
      <text
        x="320"
        y="194"
        textAnchor="middle"
        fill="#ffffff"
        fillOpacity="0.85"
        fontSize="14"
        fontWeight="700"
        letterSpacing="3"
      >
        UPTGT HINDI 2026
      </text>
      <text
        x="320"
        y="216"
        textAnchor="middle"
        fill="#ffffff"
        fillOpacity="0.7"
        fontSize="11"
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
        strokeOpacity="0.18"
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
        fontSize="58"
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

      {/* Marks + percentage caption */}
      <text
        x="320"
        y={cy + r + 32}
        textAnchor="middle"
        fill="#ffffff"
        fontSize="18"
        fontWeight="700"
        letterSpacing="1"
      >
        {toMarks(score)} marks · {pct}% correct
      </text>

      {/* Verdict ribbon */}
      <rect
        x="90"
        y={cy + r + 50}
        width="460"
        height="46"
        rx="23"
        fill={verdictBg}
      />
      <text
        x="320"
        y={cy + r + 79}
        textAnchor="middle"
        fill={verdictText}
        fontSize="15"
        fontWeight="700"
      >
        {verdictMsg}
      </text>

      {/* Category vacancy facts */}
      <text
        x="320"
        y={infoTop}
        textAnchor="middle"
        fill="#ffffff"
        fillOpacity="0.9"
        fontSize="14"
        fontWeight="600"
      >
        {categoryLabel} vacancies (Balak): {vacancies} of {TOTAL_VACANCIES}
      </text>

      {/* Result code — save & re-open later */}
      {code && (
        <>
          <text
            x="320"
            y={infoTop + 70}
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
            y={infoTop + 82}
            width="230"
            height="54"
            rx="14"
            fill="#ffffff"
          />
          <text
            x="320"
            y={infoTop + 118}
            textAnchor="middle"
            fill="#1e3a8a"
            fontSize="34"
            fontWeight="800"
            letterSpacing="8"
          >
            {code}
          </text>
          <text
            x="320"
            y={infoTop + 158}
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

  // Candidate profile, collected on the setup screen and shown on the result
  // card. Persisted with the attempt so a result re-opened by code looks right.
  const [userName, setUserName] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [avatarId, setAvatarId] = useState<string>(AVATARS[0].id);

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
      name: userName,
      category: category ?? undefined,
      avatar: avatarId,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* storage full or unavailable — non-fatal */
    }
  }, [phase, questions, answers, flagged, current, userName, category, avatarId]);

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

  // Move from the disclaimer to the candidate setup screen.
  function goToSetup() {
    setResultCode(null);
    setViewResult(null);
    setPhase("setup");
  }

  function start() {
    // Fresh attempt: shuffle the full question set and discard any saved
    // progress or previously viewed result. The candidate profile (name,
    // category, avatar) is kept so "Check again" reuses it.
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
        name?: string | null;
        category?: Category | null;
        avatar?: string | null;
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
      setUserName(data.name ?? "");
      setCategory(data.category ?? "UR");
      setAvatarId(data.avatar ?? AVATARS[0].id);
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
      goToSetup();
      return;
    }
    // Restore the candidate profile saved with the attempt.
    setUserName(saved.name ?? "");
    setCategory(saved.category ?? "UR");
    setAvatarId(saved.avatar ?? AVATARS[0].id);

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
              className="flex-1 rounded-lg bg-blue-800 px-6 py-2.5 font-medium text-white transition hover:bg-blue-900"
            >
              Resume
            </button>
            <button
              onClick={goToSetup}
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
          {/* Cross icon — closing the disclaimer moves to the setup screen. */}
          <button
            onClick={goToSetup}
            aria-label="Close disclaimer and continue"
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <span className="text-xl leading-none">✕</span>
          </button>

          <div className="mb-5 mt-8 rounded-xl bg-linear-to-br from-slate-900 via-blue-900 to-slate-800 px-5 py-4 text-center">
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
            onClick={goToSetup}
            className="mt-6 w-full rounded-lg bg-blue-800 px-6 py-2.5 font-medium text-white transition hover:bg-blue-900"
          >
            आगे बढ़ें
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
                className="w-32 rounded-lg border border-slate-300 px-3 py-2 tracking-widest outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
              <button
                type="submit"
                disabled={codeLoading || codeInput.length !== 6}
                className="rounded-lg border border-blue-300 px-4 py-2 font-medium text-blue-800 transition hover:bg-blue-50 disabled:opacity-40"
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

  if (phase === "setup") {
    return (
      <div className="mx-auto max-w-2xl">
        {showInstructions && (
          <InstructionsModal onClose={() => setShowInstructions(false)} />
        )}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* Crest header */}
          <div className="bg-linear-to-br from-slate-900 via-blue-900 to-slate-800 px-6 py-6 text-center">
            <p className="text-xl font-extrabold tracking-wide text-white">
              UPTGT HINDI 2026
            </p>
            <p className="text-xs font-semibold tracking-[0.35em] text-white/80">
              RESULT PREDICTOR
            </p>
          </div>

          <div className="space-y-7 p-6 sm:p-8">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Before you begin
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Your selection chance is estimated for your category.
              </p>
            </div>

            {/* Category */}
            <div>
              <label className="text-sm font-semibold text-slate-800">
                Select your category
              </label>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {CATEGORIES.map((c) => {
                  const active = category === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategory(c.id)}
                      aria-pressed={active}
                      className={`rounded-xl border p-3 text-left transition ${
                        active
                          ? "border-blue-700 bg-blue-50 ring-2 ring-blue-200"
                          : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"
                      }`}
                    >
                      <span className="block font-semibold text-slate-900">
                        {c.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {c.vacancies} vacancies
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Name */}
            <div>
              <label
                htmlFor="cand-name"
                className="text-sm font-semibold text-slate-800"
              >
                Your name{" "}
                <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                id="cand-name"
                type="text"
                value={userName}
                maxLength={40}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="e.g. Anjali Sharma"
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </div>

            {/* Avatar */}
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Choose an avatar
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {AVATARS.map((a) => (
                  <AvatarButton
                    key={a.id}
                    avatar={a}
                    selected={avatarId === a.id}
                    onClick={() => setAvatarId(a.id)}
                  />
                ))}
              </div>
            </div>

            {/* Vacancy reference */}
            <VacancyTable selected={category} />

            {/* Actions */}
            <div className="flex flex-col gap-3 sm:flex-row-reverse">
              <button
                onClick={start}
                disabled={!category}
                className="flex-1 rounded-lg bg-blue-800 px-6 py-2.5 font-medium text-white transition hover:bg-blue-900 disabled:opacity-40"
              >
                Begin test
              </button>
              <button
                onClick={() => setPhase("disclaimer")}
                className="flex-1 rounded-lg border border-slate-300 px-6 py-2.5 font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Back
              </button>
            </div>
            {!category && (
              <p className="-mt-3 text-center text-xs text-amber-600">
                Please select your category to continue.
              </p>
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
    const cat = categoryInfo(category);
    const selected = displayScore >= cat.cutoff;
    return (
      <div className="space-y-6">
        <div className="overflow-hidden rounded-2xl shadow-xl">
          <ReportCard
            name={userName}
            score={displayScore}
            total={displayTotal}
            pct={pct}
            selected={selected}
            categoryLabel={cat.label}
            vacancies={cat.vacancies}
            avatarId={avatarId}
            code={resultCode}
          />

          <div className="bg-white px-6 pb-7 pt-1 text-center">
            {/* Clear, unambiguous selection verdict based on the category cut-off. */}
            {selected ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                <p className="text-base font-bold text-emerald-800">
                  आपके चयन की प्रबल संभावना है!
                </p>
                <p className="mt-1.5 text-sm text-emerald-700">
                  आपके अंक ({toMarks(displayScore)}) और सही उत्तर ({displayScore})
                  आपकी श्रेणी में चयन के लिए पर्याप्त प्रतीत होते हैं। कृपया थोड़ा
                  प्रतीक्षा करें जब तक हमें और अधिक डेटा प्राप्त हो जाए।
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-4">
                <p className="text-base font-bold text-red-800">
                  आपका चयन नहीं होगा — बेहतर भाग्य अगली बार।
                </p>
                <p className="mt-1.5 text-sm text-red-700">
                  आपके अंक ({toMarks(displayScore)}) और सही उत्तर ({displayScore})
                  आपकी श्रेणी में चयन के लिए पर्याप्त नहीं प्रतीत होते हैं।
                </p>
              </div>
            )}

            <div className="mt-5 flex justify-center gap-3">
              <button
                onClick={start}
                className="rounded-lg bg-blue-800 px-5 py-2 font-medium text-white hover:bg-blue-900"
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

            {/* Tiny disclaimer — this is an AI-based predictor. */}
            <p className="mt-5 text-xs text-slate-400">
              यह एक AI रिज़ल्ट प्रेडिक्टर है। यह स्कोर आधिकारिक उत्तर कुंजी पर
              आधारित एक अनुमान है, आपका अंतिम आधिकारिक परिणाम नहीं।
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
        name: userName.trim() || undefined,
        category: category ?? undefined,
        avatar: avatarId,
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
            className="font-medium text-blue-800 transition hover:text-blue-900"
          >
            {answeredCount} answered
            {flaggedCount > 0 && ` · ${flaggedCount} flagged`} ·{" "}
            {showPalette ? "Hide" : "All questions"}
          </button>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full bg-blue-800 transition-all"
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
              <span className="h-3 w-3 rounded bg-blue-800" /> Answered
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-slate-300 bg-white" />{" "}
              Not answered
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-amber-400" /> Flagged
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded ring-2 ring-blue-400" /> Current
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
                      ? "border-blue-800 bg-blue-800 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  } ${isCurrent ? "ring-2 ring-blue-400 ring-offset-1" : ""}`}
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
                    ? "border-blue-600 bg-blue-50 ring-2 ring-blue-200"
                    : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"
                }`}
              >
                <span
                  className={`mr-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    active
                      ? "border-blue-700 bg-blue-700"
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
            className="rounded-lg bg-blue-800 px-5 py-2 font-medium text-white transition hover:bg-blue-900 disabled:opacity-40"
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
