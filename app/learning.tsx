import { useLocalSearchParams } from 'expo-router';
import { LearningView } from '@/src/components/learning/LearningScreen';

export default function Learning() {
  const params = useLocalSearchParams<{ playlistId?: string; chapterId?: string; lessonId?: string }>();
  return <LearningView initialPlaylistId={params.playlistId} initialChapterId={params.chapterId} initialLessonId={params.lessonId} />;
}
