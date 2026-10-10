import { Difficulty } from "@/types";

export function difficultyLabel(difficulty: Difficulty | string): string {
  switch (difficulty) {
    case Difficulty.SemiPro: return "Semi-Pro";
    case Difficulty.WorldClass: return "World Class";
    case Difficulty.Legend:
    case Difficulty.Legendary: return "Legendary";
    default: return String(difficulty);
  }
}
