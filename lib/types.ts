// Shared types for the quiz client UI. These mirror the Prisma models as
// serialized over the API (dates become ISO strings).

export type QuizOption = {
  id: string;
  text: string;
  isCorrect: boolean;
  questionId: string;
};

export type Question = {
  id: string;
  text: string;
  createdAt: string;
  options: QuizOption[];
};

export type Submission = {
  id: string;
  code: string;
  score: number;
  total: number;
  // questionId -> selected optionId, and the order questions were shown in.
  // Stored so the result (with per-question review) can be rebuilt later.
  answers: Record<string, string>;
  order: string[];
  createdAt: string;
};
