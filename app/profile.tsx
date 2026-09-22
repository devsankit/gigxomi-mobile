import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { AppCard } from '@/src/components/AppCard';
import { GigxomiHeader } from '@/src/components/GigxomiHeader';
import { Screen } from '@/src/components/Screen';
import { StableAvatar } from '@/src/components/StableAvatar';
import { theme } from '@/src/constants/theme';
import { useAuth } from '@/src/hooks/useAuth';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { useUpdateDisplayName, useUpdateUserProfile, useUserProfile } from '@/src/hooks/useUserProfile';
import { apiRequest } from '@/src/lib/api';

const MAX_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024;

function splitList(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

async function readAssetAsDataUrl(asset: DocumentPicker.DocumentPickerAsset) {
  const mimeType = asset.mimeType || 'image/jpeg';
  if (Platform.OS !== 'web') {
    const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    return `data:${mimeType};base64,${base64}`;
  }

  const file = (asset as DocumentPicker.DocumentPickerAsset & { file?: File }).file;
  if (!file) {
    return asset.uri;
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Profile image read failed.'));
    reader.readAsDataURL(file);
  });
}

export default function ProfileScreen() {
  const auth = useAuth();
  const session = auth.session;
  const profileQuery = useUserProfile();
  const updateProfile = useUpdateUserProfile();
  const updateDisplayName = useUpdateDisplayName();
  const profile = profileQuery.data?.profile;
  const [agencyName, setAgencyName] = useState(session?.displayName ?? '');
  const [bio, setBio] = useState('');
  const [niche, setNiche] = useState('');
  const [skills, setSkills] = useState('');
  const [availability, setAvailability] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState('');
  const [status, setStatus] = useState('');
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const canEditFreelancerProfile = session?.role === 'FREELANCER' || session?.role === 'SUPER_ADMIN';

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedNameRef = useRef<string>(session?.displayName ?? '');
  const lastSavedFreelancerRef = useRef<string>('');
  const isHydratedRef = useRef(false);

  useRefreshOnFocus(auth.sessionQuery.refetch);
  useRefreshOnFocus(profileQuery.refetch, canEditFreelancerProfile);

  useEffect(() => {
    if (session?.displayName) {
      setAgencyName(session.displayName);
      lastSavedNameRef.current = session.displayName.trim();
    }
    if (session) {
      isHydratedRef.current = true;
    }
  }, [session]);

  useEffect(() => {
    if (!profile) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      setBio(profile.bio ?? '');
      setNiche(profile.niche ?? profile.profession ?? '');
      setSkills((profile.skills ?? []).join(', '));
      setAvailability(profile.availability ?? '');
      setProfileImageUrl(profile.profileImageUrl ?? '');
      lastSavedFreelancerRef.current = JSON.stringify({
        bio: profile.bio ?? '',
        niche: profile.niche ?? profile.profession ?? '',
        skills: (profile.skills ?? []).join(', '),
        availability: profile.availability ?? '',
        profileImageUrl: profile.profileImageUrl ?? '',
      });
      isHydratedRef.current = true;
    });

    return () => cancelAnimationFrame(frame);
  }, [profile]);

  async function handleLogout() {
    await auth.logout();
    router.replace('/login');
  }

  const name = session?.displayName ?? 'Gigxomi Freelancer';
  const email = session?.email ?? session?.phone ?? 'Login to sync profile';

  const executeSave = useCallback(
    async (isAuto = false, newImageUrl?: string) => {
      const activeImageUrl = typeof newImageUrl === 'string' ? newImageUrl : profileImageUrl;
      const trimmedName = agencyName.trim();
      const currentFreelancerState = JSON.stringify({
        bio,
        niche,
        skills,
        availability,
        profileImageUrl: activeImageUrl,
      });

      const nameChanged = trimmedName && trimmedName !== lastSavedNameRef.current;
      const freelancerChanged =
        canEditFreelancerProfile && currentFreelancerState !== lastSavedFreelancerRef.current;

      if (!nameChanged && !freelancerChanged) {
        if (!isAuto) setStatus('No changes to save.');
        return;
      }

      if (isAuto) {
        setAutosaveStatus('saving');
      } else {
        setStatus('');
      }

      try {
        const tasks: Promise<unknown>[] = [];
        if (nameChanged) {
          tasks.push(updateDisplayName.mutateAsync(trimmedName));
          if (session?.role === 'ADMIN' && auth.token) {
            tasks.push(
              apiRequest('/mobile/v2/onboarding/profile', {
                method: 'POST',
                token: auth.token,
                body: { organizationName: trimmedName },
              }).catch(() => null),
            );
          }
        }
        if (freelancerChanged) {
          tasks.push(
            updateProfile.mutateAsync({
              bio,
              niche,
              profession: niche,
              skills: splitList(skills),
              tags: splitList(skills),
              availability,
              profileImageUrl: activeImageUrl,
            }),
          );
        }

        await Promise.all(tasks);
        lastSavedNameRef.current = trimmedName;
        lastSavedFreelancerRef.current = currentFreelancerState;

        if (isAuto) {
          setAutosaveStatus('saved');
          setTimeout(() => {
            setAutosaveStatus((curr) => (curr === 'saved' ? 'idle' : curr));
          }, 2500);
        } else {
          setStatus('Profile updated successfully.');
        }
      } catch (error) {
        if (isAuto) {
          setAutosaveStatus('error');
        } else {
          setStatus(error instanceof Error ? error.message : 'Profile update failed.');
        }
      }
    },
    [
      agencyName,
      auth.token,
      availability,
      bio,
      canEditFreelancerProfile,
      niche,
      profileImageUrl,
      session?.role,
      skills,
      updateDisplayName,
      updateProfile,
    ],
  );

  useEffect(() => {
    if (!isHydratedRef.current) return;

    const trimmedName = agencyName.trim();
    const currentFreelancerState = JSON.stringify({
      bio,
      niche,
      skills,
      availability,
      profileImageUrl,
    });

    const nameChanged = trimmedName && trimmedName !== lastSavedNameRef.current;
    const freelancerChanged =
      canEditFreelancerProfile && currentFreelancerState !== lastSavedFreelancerRef.current;

    if (!nameChanged && !freelancerChanged) return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    setAutosaveStatus('saving');
    autosaveTimerRef.current = setTimeout(() => {
      void executeSave(true);
    }, 650);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [
    agencyName,
    bio,
    niche,
    skills,
    availability,
    profileImageUrl,
    canEditFreelancerProfile,
    executeSave,
  ]);

  async function pickProfileImage() {
    setStatus('');
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: 'image/*',
    });
    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = result.assets[0];
    if (typeof asset.size === 'number' && asset.size > MAX_PROFILE_IMAGE_BYTES) {
      setStatus('Profile image must be under 2 MB.');
      return;
    }

    const dataUrl = await readAssetAsDataUrl(asset);
    setProfileImageUrl(dataUrl);
    void executeSave(true, dataUrl);
  }

  async function saveProfile() {
    await executeSave(false);
  }

  return (
    <Screen>
      <GigxomiHeader />

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Account</Text>
        <Text style={styles.title}>Profile</Text>
        {auth.sessionQuery.error ? <Text style={styles.error}>{auth.sessionQuery.error.message}</Text> : null}
      </View>

      <AppCard style={styles.profileCard}>
        <StableAvatar imageUrl={profileImageUrl || profile?.profileImageUrl} label={profile?.displayName || name} size={76} />
        <View style={styles.profileText}>
          <Text style={styles.name}>{profile?.displayName || name}</Text>
          <Text style={styles.email}>{email}</Text>
          <Text style={styles.session}>{auth.token ? 'Secure session active' : 'Session pending'}</Text>
        </View>
        <AppButton
          title="Upload profile picture"
          variant="secondary"
          icon={<Feather name="image" size={17} color={theme.colors.text} />}
          onPress={() => {
            pickProfileImage().catch((error) => setStatus(error instanceof Error ? error.message : 'Profile image upload failed.'));
          }}
        />
      </AppCard>

      <AppCard style={styles.formCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>{session?.role === 'ADMIN' ? 'Agency details' : 'Profile details'}</Text>
          {autosaveStatus === 'saving' ? (
            <View style={styles.autosaveIndicator}>
              <ActivityIndicator size="small" color={theme.colors.accent} />
              <Text style={styles.autosaveSavingText}>Autosaving...</Text>
            </View>
          ) : autosaveStatus === 'saved' ? (
            <View style={styles.autosaveIndicator}>
              <Feather name="check" size={13} color="#4ade80" />
              <Text style={styles.autosaveSuccessText}>Saved automatically</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.fieldLabel}>{session?.role === 'ADMIN' ? 'Agency Name' : 'Display Name'}</Text>
        <TextInput
          value={agencyName}
          onChangeText={setAgencyName}
          placeholder={session?.role === 'ADMIN' ? 'Agency public name' : 'Your full name'}
          placeholderTextColor={theme.colors.mutedText}
          selectionColor={theme.colors.accent}
          style={styles.input}
        />
        {canEditFreelancerProfile ? (
          <>
            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Freelancer essentials</Text>
            <TextInput
              value={niche}
              onChangeText={setNiche}
              placeholder="Niche / category"
              placeholderTextColor={theme.colors.mutedText}
              selectionColor={theme.colors.accent}
              style={styles.input}
            />
            <TextInput
              value={skills}
              onChangeText={setSkills}
              placeholder="Skills and tags"
              placeholderTextColor={theme.colors.mutedText}
              selectionColor={theme.colors.accent}
              style={styles.input}
            />
            <TextInput
              value={availability}
              onChangeText={setAvailability}
              placeholder="Availability"
              placeholderTextColor={theme.colors.mutedText}
              selectionColor={theme.colors.accent}
              style={styles.input}
            />
            <TextInput
              value={bio}
              onChangeText={setBio}
              placeholder="Short bio"
              placeholderTextColor={theme.colors.mutedText}
              selectionColor={theme.colors.accent}
              multiline
              style={[styles.input, styles.textArea]}
            />
          </>
        ) : null}
        {status || updateProfile.error || updateDisplayName.error ? (
          <Text style={styles.status}>
            {status || updateProfile.error?.message || updateDisplayName.error?.message}
          </Text>
        ) : null}
        <AppButton
          title={autosaveStatus === 'saved' ? 'Saved ✓' : 'Save profile'}
          loading={updateProfile.isPending || updateDisplayName.isPending}
          icon={<Feather name="save" size={17} color={theme.colors.background} />}
          onPress={() => {
            void saveProfile();
          }}
        />
      </AppCard>

      <View style={styles.actions}>
        <AppButton
          title="Logout"
          variant="danger"
          icon={<Feather name="log-out" size={17} color={theme.colors.text} />}
          onPress={handleLogout}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.xl,
  },
  eyebrow: {
    color: theme.colors.accent,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.hero,
    fontWeight: '800',
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.small,
  },
  profileCard: {
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  profileText: {
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  name: {
    color: theme.colors.text,
    fontSize: theme.typography.title,
    fontWeight: '800',
  },
  email: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.small,
  },
  session: {
    color: theme.colors.accent,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  actions: {
    marginTop: theme.spacing.lg,
  },
  formCard: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '900',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  autosaveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  autosaveSavingText: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  autosaveSuccessText: {
    color: '#4ade80',
    fontSize: 11,
    fontWeight: '700',
  },
  fieldLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small,
    fontWeight: '700',
    marginTop: 4,
  },
  input: {
    minHeight: 46,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.typography.body,
  },
  textArea: {
    minHeight: 92,
    paddingTop: theme.spacing.sm,
    textAlignVertical: 'top',
  },
  status: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small,
  },
});
