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
