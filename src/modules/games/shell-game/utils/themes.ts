export interface GameTheme {
  id: string;
  name: string;
  tableBg: string;
  cupColor: string;
  cupHighlight: string;
  cupCap: string;
  ballStyle: string;
  ballGlow: string;
  feltColor: string;
}

export const GAME_THEMES: GameTheme[] = [
  {
    id: "royal",
    name: "Hoàng Gia Sáng",
    tableBg: "from-amber-50 via-orange-50 to-amber-100",
    feltColor: "bg-amber-100/60 border-amber-300/50",
    cupColor:
      "bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 border-amber-200 text-amber-900",
    cupHighlight:
      "border-amber-100/70 bg-gradient-to-r from-transparent via-white/70 to-transparent",
    cupCap: "bg-amber-600 border-amber-200",
    ballStyle: "bg-gradient-to-br from-rose-400 via-rose-500 to-rose-700",
    ballGlow: "shadow-rose-400/50",
  },
];
