export * from "./audioManager";
export * from "./useAudioManager";

export type { UseAudioManagerReturn } from "./useAudioManager";

export {
  AUDIO_CATEGORIES,
  AUDIO_FORMATS,
  AUDIO_LEVELS,
  AUDIO_QUALITIES,
} from "./audioManager";

export {
  audioFileExists,
  createAudioFile,
  createAudioFilesForBook,
  createPlaylist,
  generateAudioUrl,

  // Audio Manager Functions
  getAllAudioBooks,
  getAudioBookById,
  getAudioBooksByCategory,
  getAudioBooksByLevel,
  getAudioFileById,
  getAudioFilesByBookId,
  getAudioFilesByCategory,
  getAudioFilesByLevel,
  getAudioStats,
  getFavoriteAudioFiles,
  getRecentAudioFiles,
  searchAudioFiles,
} from "./audioManager";

export {
  useAudioBook,
  useAudioByCategory,
  useAudioByLevel,
  useAudioManager,
} from "./useAudioManager";

export { default as AudioManager } from "./audioManager";
