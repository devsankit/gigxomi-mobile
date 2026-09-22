import { router, useLocalSearchParams } from 'expo-router';
import { EditorProfileContent } from '@/src/components/team/EditorProfile';
export default function EditorProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EditorProfileContent editorId={id} onClose={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />;
}
