import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '@/src/lib/api';

export type LearningLessonProgress = {
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  progressPercent: number;
  watchedSeconds: number;
  durationSeconds: number;
  lastPositionSeconds: number;
};

export type LearningLesson = {
  id: string;
  title: string;
  youtubeVideoId?: string | null;
  progress?: LearningLessonProgress | null;
};

export type LearningChapter = {
  id: string;
  title: string;
  thumbnailUrl?: string | null;
  lessons: LearningLesson[];
};

export type LearningPlaylist = {
  id: string;
  title: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  completionPercent: number;
  lessonCount: number;
  chapters: LearningChapter[];
};

export type LearningCatalogSummary = {
  audience: 'AGENCY' | 'FREELANCER' | 'CRM';
  playlists: LearningPlaylist[];
  continueLearning?: { playlistId: string; chapterId: string; lessonId: string } | null;
};

export function useLearningCatalog(scope: string, token?: string | null) {
  return useQuery({
    queryKey: ['connected-lms', scope],
    enabled: Boolean(token),
    staleTime: 0,
    queryFn: ({ signal }) => apiRequest<LearningCatalogSummary>('/mobile/v2/lms', { token, signal }),
  });
}
