import type { LearningCatalogSummary, LearningPlaylist } from '../hooks/useLearningCatalog';

export type LearningDestination = { playlistId: string; chapterId?: string; lessonId?: string };

// A completed course opens its chapter-by-chapter report, never an unrelated lesson.
export function learningDestination(playlist: LearningPlaylist, target?: LearningCatalogSummary['continueLearning']): LearningDestination {
  if (playlist.completionPercent >= 100) return { playlistId: playlist.id };
  if (target?.playlistId === playlist.id && playlist.chapters.some(chapter => chapter.id === target.chapterId && chapter.lessons.some(lesson => lesson.id === target.lessonId))) return { ...target };
  for (const chapter of playlist.chapters) {
    const lesson = chapter.lessons.find(item => item.progress?.status !== 'COMPLETED');
    if (lesson) return { playlistId: playlist.id, chapterId: chapter.id, lessonId: lesson.id };
  }
  return { playlistId: playlist.id };
}
