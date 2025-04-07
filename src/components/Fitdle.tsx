"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface Exercise {
  name: string;
  muscle: "CORE" | "LEGS" | "UPPER BODY";
  difficulty: "EASY" | "HARD";
}

interface HistoryEntry {
  guess: string;
  letterFeedback: string[];
  muscleFeedback: string;
}

const allExercises: Exercise[] = [
  { name: "PLANK", muscle: "CORE", difficulty: "EASY" },
  { name: "SQUAT", muscle: "LEGS", difficulty: "EASY" },
  { name: "LUNGE", muscle: "LEGS", difficulty: "EASY" },
  { name: "CURLS", muscle: "UPPER BODY", difficulty: "EASY" },
  { name: "PRESS", muscle: "UPPER BODY", difficulty: "EASY" },
  { name: "DIPSB", muscle: "UPPER BODY", difficulty: "HARD" },
  { name: "VUPPS", muscle: "CORE", difficulty: "HARD" },
  { name: "DEADS", muscle: "LEGS", difficulty: "HARD" },
];

const getRandomExercise = (pool: Exercise[]) =>
  pool[Math.floor(Math.random() * pool.length)];

export default function Fitdle() {
  const [guess, setGuess] = useState<string>("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [streak, setStreak] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(0);
  const [hardMode, setHardMode] = useState<boolean>(false);
  const [exercisePool, setExercisePool] = useState<Exercise[]>(allExercises);
  const [targetExercise, setTargetExercise] = useState<Exercise>(() =>
    getRandomExercise(allExercises)
  );
  const [gameStatus, setGameStatus] = useState<"playing" | "won" | "lost">(
    "playing"
  );

  const progress = (history.length / 6) * 100;

  const suggestions = useMemo(() => {
    return exercisePool
      .filter((ex) => ex.name.startsWith(guess.toUpperCase()))
      .map((ex) => ex.name);
  }, [guess, exercisePool]);

  const resetGame = () => {
    const pool = hardMode
      ? allExercises.filter((ex) => ex.difficulty === "HARD")
      : allExercises;
    const newTarget = getRandomExercise(pool);
    setExercisePool(pool);
    setTargetExercise(newTarget);
    setHistory([]);
    setGuess("");
    setGameStatus("playing");
  };

  const checkGuess = () => {
    if (guess.length !== 5 || gameStatus !== "playing") return;

    const guessUpper = guess.toUpperCase();
    const found = exercisePool.find((ex) => ex.name === guessUpper);

    if (!found) {
      alert("Invalid Exercise!");
      return;
    }

    const letterFeedback = guessUpper.split("").map((char, i) =>
      char === targetExercise.name[i]
        ? "🟩"
        : targetExercise.name.includes(char)
        ? "🟨"
        : "⬜"
    );

    let muscleFeedback = "🔴";
    if (found.muscle === targetExercise.muscle) muscleFeedback = "🟢";
    else if (
      ["CORE", "UPPER BODY"].includes(found.muscle) &&
      ["CORE", "UPPER BODY"].includes(targetExercise.muscle)
    )
      muscleFeedback = "🟡";

    const newHistory = [
      ...history,
      { guess: guessUpper, letterFeedback, muscleFeedback },
    ];

    setHistory(newHistory);
    setGuess("");

    if (guessUpper === targetExercise.name) {
      const newStreak = streak + 1;
      setStreak(newStreak);
      setHighScore(Math.max(highScore, newStreak));
      setGameStatus("won");
    } else if (newHistory.length === 6) {
      setStreak(0);
      setGameStatus("lost");
    }
  };

  useEffect(() => {
    if (gameStatus !== "playing") {
      const timeout = setTimeout(() => {
        resetGame();
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [gameStatus]);

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <h1 className="text-2xl font-bold">Fitdle 🏋️‍♂️</h1>
      <p className="text-center">Guess the 5-letter workout!</p>

      <motion.div className="w-full max-w-sm bg-gray-200 rounded-full h-2 overflow-hidden">
        <motion.div
          className="bg-green-500 h-2"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5 }}
        />
      </motion.div>

      <div className="flex justify-between w-full max-w-sm text-sm">
        <p>🔥 Streak: {streak}</p>
        <p>🏅 High Score: {highScore}</p>
      </div>

      <div className="flex items-center gap-2">
        <input
          className="border p-2 text-center uppercase"
          value={guess}
          onChange={(e) =>
            setGuess(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))
          }
          maxLength={5}
          disabled={gameStatus !== "playing"}
        />
        <Button onClick={checkGuess} disabled={gameStatus !== "playing"}>
          Submit
        </Button>
      </div>

      {/* Suggestions */}
      {guess && suggestions.length > 0 && (
        <div className="text-sm text-gray-600">
          Suggestions: {suggestions.join(", ")}
        </div>
      )}

      {/* Game status */}
      <AnimatePresence>
        {gameStatus === "won" && (
          <motion.p
            className="text-green-600 font-bold"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            🎉 You crushed it! Resetting...
          </motion.p>
        )}
        {gameStatus === "lost" && (
          <motion.p
            className="text-red-600 font-bold"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            ❌ The word was <b>{targetExercise.name}</b>. Try again!
          </motion.p>
        )}
      </AnimatePresence>

      <div className="flex gap-4 mt-2">
        <Button variant="outline" onClick={resetGame}>
          🔁 New Game
        </Button>
        <Button
          variant={hardMode ? "default" : "outline"}
          onClick={() => {
            setHardMode((prev) => !prev);
            resetGame();
          }}
        >
          🧠 Hard Mode: {hardMode ? "On" : "Off"}
        </Button>
      </div>

      <div className="flex flex-col gap-2 w-full max-w-sm mt-4">
        {history.map((entry, i) => (
          <motion.div
            key={i}
            className="flex justify-between items-center p-2 border rounded"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.1 }}
          >
            <span className="font-mono">{entry.guess}</span>
            <span className="text-xl">{entry.letterFeedback.join("")}</span>
            <span>{entry.muscleFeedback}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
