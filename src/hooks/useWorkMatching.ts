import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/src/lib/api';
import { journey } from '@/src/lib/journey-runtime';
import type {
  MobileCreateWorkPostInput,
  MobileRole,
  MobileSessionResponse,
  MobileWorkApplication,
  MobileWorkApplicationInput,
  MobileWorkApplicationStatus,
  MobileWorkInvite,
  MobileWorkInviteStatus,
  MobileWorkMatchingResponse,
  MobileWorkPost,
} from '@/src/types';
import { queryKeys } from './queryKeys';
import { useAuth, useStoredToken } from './useAuth';

type TaskApiTask = {
  id: string;
  tenantId: string;
  agencyUserId?: string;
  agencyName: string;
  title: string;
  category: string;
  brief: string;
  budgetAmount: number;
  deadline: string | null;
  requiredSkills: string[];
  referenceLinks: string[];
  visibility: string;
  applicationDeadline: string | null;
  status: string;
  assignedFreelancerId?: string | null;
  acceptedApplicationId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

type TaskApiApplication = {
  id: string;
  taskId: string;
  tenantId: string;
  freelancerId: string;
  freelancerName: string;
  proposal: string;
  quotedAmount: number;
  estimatedTurnaround: string;
  portfolioReference: string;
  status: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

type TasksApiResponse = {
  ok: boolean;
  tasks?: TaskApiTask[];
  applications?: TaskApiApplication[];
};

type InviteEditorInput = {
  editorId: string;
  message?: string;
  workPostId: string;
};

type ApplyInput = MobileWorkApplicationInput & {
  workPostId: string;
};

type UpdateApplicationInput = {
  applicationId: string;
  status: MobileWorkApplicationStatus;
};

type UpdateInviteInput = {
  inviteId: string;
  status: Extract<MobileWorkInviteStatus, 'ACCEPTED' | 'REJECTED'>;
};

function splitList(value?: string) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberOrNull(value?: string) {
  const parsed = Number(String(value ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function createWorkPayload(input: MobileCreateWorkPostInput) {
  const budgetMax = numberOrNull(input.budgetMax);
  const budgetMin = numberOrNull(input.budgetMin);
  const referenceLinks = [...splitList(input.attachmentLinks), ...(input.sampleLink?.trim() ? [input.sampleLink.trim()] : [])];
  const budgetAmount = budgetMax ?? budgetMin ?? 1000;
  const visibility =
    input.visibility === 'AGENCY_TEAM' ? 'AGENCY_TEAM' : input.visibility === 'PRIVATE_INVITE' ? 'INVITED_ONLY' : 'PUBLIC';
  const brief = input.description?.trim() || input.expectedOutput?.trim() || `${input.title.trim()} editing project.`;

  return {
    applicationDeadline: input.deadline || undefined,
    brief,
    budgetAmount,
    category: input.category || 'Video Editing',
    deadline: input.deadline || undefined,
    priority: input.workType === 'URGENT' ? 'URGENT' : 'NORMAL',
    productionTags: splitList(input.tags),
    projectScope: input.expectedOutput || input.workType || '1 edited video + revisions',
    referenceLinks,
    requiredSkills: splitList(input.skills || input.niche),
    sampleLink: input.sampleLink || undefined,
    title: input.title,
    visibility,
  };
}

function applicationPayload(input: MobileWorkApplicationInput) {
  const linkedService = input.serviceId?.trim() ? `service:${input.serviceId.trim()}` : '';
  return {
    estimatedTurnaround: input.expectedDelivery || input.availability || 'To be confirmed',
    portfolioReference: linkedService || 'No published service attached',
    proposal: input.proposalMessage,
    quotedAmount: numberOrNull(input.expectedPayout) ?? 0,
  };
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function metadataList(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function mapTaskStatus(status: string): MobileWorkPost['status'] {
  const normalized = status.toUpperCase();
  if (normalized === 'ASSIGNED' || normalized === 'IN_PROGRESS') return 'FILLED';
  if (normalized === 'COMPLETED') return 'FILLED';
  if (normalized === 'CANCELLED' || normalized === 'APPLICATIONS_CLOSED') return 'CLOSED';
  if (normalized === 'PAUSED') return 'PAUSED';
  return 'OPEN';
}

function mapVisibility(visibility: string): MobileWorkPost['visibility'] {
  const normalized = visibility.toUpperCase();
  if (normalized === 'AGENCY_TEAM') return 'AGENCY_TEAM';
  if (normalized === 'INVITED_ONLY' || normalized === 'PRIVATE_INVITE') return 'PRIVATE_INVITE';
  return 'PUBLIC_MATCHED';
}

function mapApplicationStatus(status: string): MobileWorkApplicationStatus {
  const normalized = status.toUpperCase();
  if (normalized === 'APPLIED') return 'PENDING';
  if (normalized === 'SHORTLISTED' || normalized === 'ACCEPTED' || normalized === 'REJECTED' || normalized === 'WITHDRAWN') {
    return normalized as MobileWorkApplicationStatus;
  }
  return 'PENDING';
}

function applicationAction(status: MobileWorkApplicationStatus) {
  if (status === 'SHORTLISTED') return 'SHORTLIST';
  if (status === 'ACCEPTED') return 'ACCEPT';
  if (status === 'REJECTED') return 'REJECT';
  if (status === 'WITHDRAWN') return 'WITHDRAW';
  return status;
}

function mapTaskApplication(application: TaskApiApplication, task?: TaskApiTask): MobileWorkApplication {
  return {
    agencyId: task?.agencyUserId ?? task?.tenantId ?? application.tenantId,
    applicationId: application.id,
    availability: application.estimatedTurnaround,
    createdAt: application.createdAt,
    editorId: application.freelancerId,
    editorName: application.freelancerName,
    expectedDelivery: application.estimatedTurnaround,
    expectedPayout: application.quotedAmount || null,
    portfolioLinks: application.portfolioReference ? [application.portfolioReference] : [],
    proposalMessage: application.proposal,
    status: mapApplicationStatus(application.status),
    workPostId: application.taskId,
  };
}

function mapTaskToPost(task: TaskApiTask, applications: TaskApiApplication[] = []): MobileWorkPost {
  const metadata = metadataRecord(task.metadata);
  const productionTags = metadataList(metadata, 'productionTags');
  const projectScope = typeof metadata.projectScope === 'string' ? metadata.projectScope : '';
  const sampleLink = typeof metadata.sampleLink === 'string' && metadata.sampleLink.trim() ? metadata.sampleLink.trim() : task.referenceLinks[0] ?? null;

  return {
    agencyId: task.agencyUserId ?? task.tenantId,
    agencyName: task.agencyName,
    assignedFreelancerId: task.assignedFreelancerId,
    assignedFreelancerName: applications.find(application => application.id === task.acceptedApplicationId || (application.freelancerId === task.assignedFreelancerId && application.status === 'ACCEPTED'))?.freelancerName ?? null,
    recommendationsAvailable: false,
    taskStatus: task.status,
    applications: applications.map((application) => mapTaskApplication(application, task)),
    attachmentLinks: task.referenceLinks,
    budgetMax: task.budgetAmount || null,
    budgetMin: task.budgetAmount || null,
    category: task.category,
    createdAt: task.createdAt,
    deadline: task.deadline,
    description: task.brief,
    editorsNeeded: 1,
    experienceLevel: 'INTERMEDIATE',
    expectedOutput: projectScope,
    id: task.id,
    niche: '',
    recommendedEditors: undefined,
    sampleLink,
    skills: task.requiredSkills,
    status: mapTaskStatus(task.status),
    tags: productionTags,
    tenantId: task.tenantId,
    title: task.title,
    updatedAt: task.updatedAt,
    visibility: mapVisibility(task.visibility),
    workType: String(metadata.priority ?? '').toUpperCase() === 'URGENT' ? 'URGENT' : 'ONE_TIME',
  };
}

function toWorkMatchingPayload(response: TasksApiResponse, role: MobileRole): MobileWorkMatchingResponse {
  const tasks = response.tasks ?? [];
  const applications = response.applications ?? [];
  const applicationsByTask = new Map<string, TaskApiApplication[]>();
  for (const application of applications) {
    const current = applicationsByTask.get(application.taskId) ?? [];
    current.push(application);
    applicationsByTask.set(application.taskId, current);
  }

  if (isAgencyRole(role)) {
    const workPosts = tasks.map((task) => mapTaskToPost(task, applicationsByTask.get(task.id) ?? []));
    return {
      ok: true,
      mode: 'agency',
      totals: {
        acceptedApplications: applications.filter((item) => item.status === 'ACCEPTED').length,
        openPosts: workPosts.filter((post) => post.status === 'OPEN').length,
        pendingApplications: applications.filter((item) => item.status === 'APPLIED' || item.status === 'SHORTLISTED').length,
        recommendedEditors: 0,
      },
      workPosts,
      connections: [],
    };
  }

  return {
    ok: true,
    mode: 'editor',
    totals: {
      activeConnections: applications.filter((item) => item.status === 'ACCEPTED').length,
      availableWork: tasks.length,
      invites: 0,
      pendingApplications: applications.filter((item) => item.status === 'APPLIED' || item.status === 'SHORTLISTED').length,
    },
    matchedWork: tasks.map((task) => mapTaskToPost(task)),
    applications: applications.map((application) => mapTaskApplication(application, tasks.find((task) => task.id === application.taskId))),
    invites: [],
    connections: [],
  };
}

function isAgencyRole(role?: MobileRole | null) {
  return role === 'ADMIN' || role === 'MANAGER' || role === 'SUPER_ADMIN';
}

async function resolveRole(token: string, role?: MobileRole | null) {
  if (role) {
    return role;
  }
  const session = await apiRequest<MobileSessionResponse>('/mobile/session', { token });
  return session.session.role;
}

async function invalidateWorkMatching(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.workMatching }),
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
    queryClient.invalidateQueries({ queryKey: queryKeys.assignments }),
  ]);
}

export function useWorkMatching(role?: MobileRole | null) {
  const auth = useAuth();
  const token = auth.token;
  return useQuery({
    queryKey: [...queryKeys.workMatching, auth.session?.userId, auth.session?.tenantId, role ?? auth.session?.role],
    enabled: Boolean(token && auth.session),
    staleTime: 30_000,
    retry: 1,
    queryFn: async ({ signal }) => {
      if (!token) throw new Error('Sign in to load work.');
      const [resolvedRole, response] = await Promise.all([
        resolveRole(token, role ?? auth.session?.role),
        apiRequest<TasksApiResponse>('/tasks', { token, signal }),
      ]);
      return toWorkMatchingPayload(response, resolvedRole);
    },
  });
}

export function useCreateWorkPost() {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: (input: MobileCreateWorkPostInput) =>
      apiRequest<{ ok: boolean; task: TaskApiTask }>('/tasks', {
        method: 'POST',
        token: tokenQuery.data ?? null,
        body: createWorkPayload(input),
      }).then((payload) => ({ ok: true, workPost: mapTaskToPost(payload.task) })),
    onSuccess: async () => {
      await invalidateWorkMatching(queryClient);
    },
  });
}

export function useApplyToWorkPost() {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: ({ workPostId, ...input }: ApplyInput) =>
      apiRequest<{ ok: boolean; task?: TaskApiTask; application: TaskApiApplication }>(`/tasks/${encodeURIComponent(workPostId)}/applications`, {
        method: 'POST',
        token: tokenQuery.data ?? null,
        body: applicationPayload(input),
      }).then((payload) => {
        if (payload.ok) void journey.track('application.submission_acknowledged');
        return { ok: true, application: mapTaskApplication(payload.application, payload.task) };
      }),
    onSuccess: async () => {
      await invalidateWorkMatching(queryClient);
    },
  });
}

export function useUpdateWorkApplication() {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: ({ applicationId, status }: UpdateApplicationInput) =>
      apiRequest<{ ok: boolean; application: TaskApiApplication }>(`/task-applications/${encodeURIComponent(applicationId)}`, {
        method: 'PATCH',
        token: tokenQuery.data ?? null,
        body: { action: applicationAction(status) },
      }).then((payload) => ({ ok: true, application: mapTaskApplication(payload.application) })),
    onSuccess: async () => {
      await invalidateWorkMatching(queryClient);
    },
  });
}

export function useInviteEditorToWorkPost() {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: ({ workPostId, editorId, message }: InviteEditorInput) =>
      apiRequest<{ ok: boolean; invite: MobileWorkInvite }>(`/work-posts/${encodeURIComponent(workPostId)}/invites`, {
        method: 'POST',
        token: tokenQuery.data ?? null,
        body: { editorId, message },
      }),
    onSuccess: async () => {
      await invalidateWorkMatching(queryClient);
    },
  });
}

export function useUpdateWorkInvite() {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: ({ inviteId, status }: UpdateInviteInput) =>
      apiRequest<{ ok: boolean; invite: MobileWorkInvite }>(`/work-invites/${encodeURIComponent(inviteId)}`, {
        method: 'PATCH',
        token: tokenQuery.data ?? null,
        body: { status },
      }),
    onSuccess: async () => {
      await invalidateWorkMatching(queryClient);
    },
  });
}
