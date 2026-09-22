import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { AppCard } from '@/src/components/AppCard';
import { GigxomiHeader } from '@/src/components/GigxomiHeader';
import { Screen } from '@/src/components/Screen';
import { theme } from '@/src/constants/theme';
import { useAuth } from '@/src/hooks/useAuth';
import { apiRequest } from '@/src/lib/api';

type Detail = { member: { freelancer?: { displayName?: string; freelancerTrustSnapshot?: { score: number } } }; accounting: { paid: number; unpaid: number; total: number; currency: string }; projectSummary: { completed: number; active: number }; projects: Array<{ id: string; title: string; status: string }> };
export default function TeamMemberDetail() {
  const { id } = useLocalSearchParams<{ id: string }>(); const auth = useAuth();
  const query = useQuery({ queryKey: ['team-member', id], enabled: Boolean(id && auth.token), queryFn: () => apiRequest<Detail>(`/mobile/v2/team/${encodeURIComponent(id)}`, { token: auth.token }) });
  const detail = query.data;
  const money = (value: number) => `INR ${Math.round(value || 0).toLocaleString('en-IN')}`;
  return <Screen><GigxomiHeader /><Text style={s.title}>{detail?.member.freelancer?.displayName || 'Team member'}</Text><Text style={s.copy}>Trust score {detail?.member.freelancer?.freelancerTrustSnapshot?.score ?? 0}/100</Text>
    <View style={s.metrics}><AppCard style={s.metric}><Text style={s.value}>{detail?.projectSummary.completed ?? 0}</Text><Text style={s.copy}>Completed</Text></AppCard><AppCard style={s.metric}><Text style={s.value}>{detail?.projectSummary.active ?? 0}</Text><Text style={s.copy}>Active</Text></AppCard></View>
    <AppCard style={s.card}><Text style={s.heading}>Accounting</Text><Text style={s.copy}>Paid: {money(detail?.accounting.paid ?? 0)}</Text><Text style={s.copy}>Unpaid: {money(detail?.accounting.unpaid ?? 0)}</Text><Text style={s.total}>Total due: {money(detail?.accounting.unpaid ?? 0)}</Text></AppCard>
    <AppCard style={s.card}><Text style={s.heading}>Projects</Text>{detail?.projects.map((item) => <View key={item.id} style={s.project}><Text style={s.name}>{item.title}</Text><Text style={s.status}>{item.status}</Text></View>)}{!detail?.projects.length ? <Text style={s.copy}>No project records yet.</Text> : null}</AppCard>{query.isError ? <Text style={s.error}>{query.error.message}</Text> : null}
  </Screen>;
}
const s = StyleSheet.create({ title: { color: theme.colors.text, fontSize: 28, fontWeight: '900' }, copy: { color: theme.colors.textSecondary, lineHeight: 20 }, metrics: { flexDirection: 'row', gap: 10 }, metric: { flex: 1 }, value: { color: theme.colors.accent, fontSize: 24, fontWeight: '900' }, card: { gap: 10 }, heading: { color: theme.colors.text, fontSize: 17, fontWeight: '900' }, total: { color: theme.colors.accent, fontWeight: '900' }, project: { alignItems: 'center', borderTopColor: theme.colors.borderSubtle, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10 }, name: { color: theme.colors.text, fontWeight: '800' }, status: { color: theme.colors.accent, fontSize: 11, fontWeight: '900' }, error: { color: theme.colors.danger } });
