export interface AudioFile {
  id: string;
  title: string;
  url: string;
  duration?: number;
  bookId: string;
  lessonNumber: number;
  level: "beginner" | "intermediate" | "advanced";
  category: "streamline" | "1000-lessons" | "grammar" | "vocabulary";
  description?: string;
  thumbnail?: string;
  isPremium?: boolean;
  tags?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AudioBook {
  id: string;
  title: string;
  description: string;
  coverImage: string;
  totalLessons: number;
  category: "streamline" | "1000-lessons" | "grammar" | "vocabulary";
  level: "beginner" | "intermediate" | "advanced";
  isPremium: boolean;
  audioFiles: AudioFile[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AudioPlaylist {
  id: string;
  name: string;
  description: string;
  audioFiles: AudioFile[];
  isPublic: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AudioProgress {
  audioId: string;
  userId: string;
  currentTime: number;
  duration: number;
  isCompleted: boolean;
  lastPlayedAt: Date;
  playCount: number;
}
