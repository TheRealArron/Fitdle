Fitdle Master Specification: Pro Edition
1. Project Overview
Fitdle is a professional-grade fitness-themed word game.
Goal: Guess the 5-letter exercise in 6 tries.
Core Loop: Daily deterministic words, persistent streaks, and fitness education.
UI/UX: Wordle-style 5x6 grid, animated tile flips, virtual keyboard, and muscle-group feedback.
Security: Checksum-verified LocalStorage to prevent streak tampering.
2. Technical Stack
Framework: Next.js 15 (App Router) + TypeScript
State: Zustand (Centralized game logic)
Styles: Tailwind CSS 4
Animations: Framer Motion
Icons: Lucide React
3. Data Schema & Dictionary
code
TypeScript
// src/data/dictionary.ts
export interface Exercise {
  name: string;
  muscle: 'Core' | 'Legs' | 'Chest' | 'Back' | 'Arms' | 'Full';
  difficulty: 'Easy' | 'Hard';
}

export const DICTIONARY: Exercise[] = [
  { name: "PLANK", muscle: "Core", difficulty: "Easy" },
  { name: "SQUAT", muscle: "Legs", difficulty: "Easy" },
  { name: "PRESS", muscle: "Chest", difficulty: "Easy" },
  { name: "LUNGE", muscle: "Legs", difficulty: "Easy" },
  { name: "CURLS", muscle: "Arms", difficulty: "Easy" },
  { name: "DEADS", muscle: "Legs", difficulty: "Hard" },
  { name: "BURPE", muscle: "Full", difficulty: "Hard" },
  { name: "ROWSR", muscle: "Back", difficulty: "Hard" },
  { name: "CRUNC", muscle: "Core", difficulty: "Easy" },
  { name: "DIPSB", muscle: "Arms", difficulty: "Hard" },
  { name: "STEPS", muscle: "Legs", difficulty: "Easy" },
  { name: "VUPPS", muscle: "Core", difficulty: "Hard" },
  { name: "HIITS", muscle: "Full", difficulty: "Hard" },
  { name: "CLEAN", muscle: "Full", difficulty: "Hard" },
  { name: "YOGAS", muscle: "Full", difficulty: "Easy" },
];
4. Game Logic & Security (Zustand Store)
code
TypeScript
// src/store/useGameStore.ts
import { create } from 'zustand';
import { DICTIONARY, Exercise } from '@/data/dictionary';

// Security: Deterministic Daily Word
const getDailyIndex = () => {
  const now = new Date();
  const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  return seed % DICTIONARY.length;
};

// Security: Persistence with Checksum
const generateHash = (val: string) => {
  return val.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0).toString(16);
};

interface GameState {
  target: Exercise;
  guesses: string[];
  currentGuess: string;
  status: 'playing' | 'won' | 'lost';
  streak: number;
  initGame: () => void;
  addLetter: (char: string) => void;
  removeLetter: () => void;
  submitGuess: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  target: DICTIONARY[0],
  guesses: [],
  currentGuess: '',
  status: 'playing',
  streak: 0,

  initGame: () => {
    const dailyIndex = getDailyIndex();
    const saved = localStorage.getItem('fitdle-data');
    let streak = 0;
    if (saved) {
      const { v, h } = JSON.parse(saved);
      if (generateHash(v) === h) streak = parseInt(v);
    }
    set({ target: DICTIONARY[dailyIndex], streak, guesses: [], status: 'playing' });
  },

  addLetter: (char) => {
    if (get().currentGuess.length < 5 && get().status === 'playing') {
      set({ currentGuess: get().currentGuess + char.toUpperCase() });
    }
  },

  removeLetter: () => set({ currentGuess: get().currentGuess.slice(0, -1) }),

  submitGuess: () => {
    const { currentGuess, target, guesses, streak, status } = get();
    if (currentGuess.length !== 5 || status !== 'playing') return;
    
    if (!DICTIONARY.some(e => e.name === currentGuess)) return; // Invalid word

    const newGuesses = [...guesses, currentGuess];
    let newStatus = 'playing';
    let newStreak = streak;

    if (currentGuess === target.name) {
      newStatus = 'won';
      newStreak++;
    } else if (newGuesses.length === 6) {
      newStatus = 'lost';
      newStreak = 0;
    }

    const v = newStreak.toString();
    localStorage.setItem('fitdle-data', JSON.stringify({ v, h: generateHash(v) }));
    set({ guesses: newGuesses, currentGuess: '', status: newStatus as any, streak: newStreak });
  }
}));
5. Components UI Requirement
5.1 Grid (components/Grid.tsx)
Render 6 rows.
Each row contains 5 tiles.
Tile Animation: On submission, tiles flip sequentially (delay i * 0.1s).
Colors:
Correct Position: #22c55e (Green 500)
Wrong Position: #eab308 (Yellow 500)
Not in Word: #4b5563 (Gray 600)
5.2 Keyboard (components/Keyboard.tsx)
Layout: QWERTY.
Keys should dynamically update colors based on the game state (Green/Yellow/DarkGray).
Special Keys: "ENTER" (wide) and "BACKSPACE" (icon).
5.3 Victory/Loss Modal
Victory: Show exercise "How-To," the muscle group targeted, and a "Share to Extension" button.
Loss: Reveal the target word and provide a link to a form video for that exercise.
6. CSS (Tailwind 4)
code
CSS
/* globals.css */
@import "tailwindcss";

@theme {
  --color-app-bg: #0f172a;
  --color-tile-empty: #1e293b;
  --font-game: 'Geist Mono', monospace;
}

body {
  background-color: var(--color-app-bg);
  color: white;
  overflow: hidden;
  touch-action: manipulation;
}
7. Extension Configuration (manifest.json)
Instructions for porting:
Build the Next.js app using output: 'export'.
Wrap the out/ folder with this manifest.json:
code
JSON
{
  "manifest_version": 3,
  "name": "Fitdle Quickplay",
  "version": "1.0.0",
  "action": { "default_popup": "index.html" },
  "permissions": ["storage"]
}
8. Development Prompt for AI
"Build the Fitdle Pro app based on the Claude.md spec provided. Use Next.js 15 and Zustand. Focus on the Tile Flip animations in the Grid and ensure the 'Daily Word' logic matches the specification exactly so every user gets the same word today. Implement the secure persistence layer to prevent streak hacking."
