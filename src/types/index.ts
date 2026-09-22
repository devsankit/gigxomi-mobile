export type UserRoleOption = 'Freelancer' | 'Agency';

export type MobileRole = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'FREELANCER';

export type MobileSession = {
  userId: string;
  role: MobileRole;
  assignedRole: MobileRole;
  tenantId: string | null;
  displayName: string;
  email: string | null;
  phone: string;
  packageId: string | null;
  packageName: string | null;
  packageAudience: 'FREELANCER' | 'AGENCY' | null;
  packageStatus: 'ACTIVE' | 'PAUSED' | 'EXPIRED' | null;
  packageExpiresAt: string | null;
  workspaceMode: 'AGENCY' | 'FREELANCER' | null;
  expiresAt: number;
};

export type MobileLoginResponse = {
  ok: boolean;
  token: string;
  session: MobileSession;
};

export type MobileOtpRequestResponse = {
  ok: boolean;
  challengeId: string;
  intentId?: string;
  deliveryMode: 'whatsapp-sent' | 'local-only' | 'preconfigured-code';
  expiresAt: string;
  testCode?: string;
  message: string;
  otpFallback?: 'whatsapp-command';
  otpCommand?: string;
  otpChannelLabel?: string;
  whatsappHref?: string | null;
};

export type MobileOtpChannelResponse = {
  ok: boolean;
  command: string;
  label: string;
  whatsappHref: string | null;
  isConfigured: boolean;
};

export type MobileSessionResponse = {
  ok: boolean;
  session: MobileSession;
};

export type MobileRegistrationPackage = {
  id: string;
  slug: string;
  name: string;
  audience: 'FREELANCER' | 'AGENCY';
  packageType?: 'FREELANCER' | 'AGENCY' | 'BOTH';
  shortSubtitle?: string | null;
  description?: string | null;
  badgeText?: string | null;
  ctaLabel?: string | null;
  billingType: 'FREE' | 'ONE_TIME_PAID' | 'RECURRING';
  billingInterval?: 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'ONE_TIME' | 'CUSTOM' | null;
  currency: string;
  amount: number;
  priceMonthly?: number | null;
  priceYearly?: number | null;
  isFree: boolean;
  isRecommended?: boolean;
  paymentRequired?: boolean;
  autoRenewEnabled?: boolean;
  priceLabel: string;
  billingLabel: string;
  statusLabel?: string | null;
  featureBullets: string[];
  compareHighlights?: string[];
  durationDays?: number | null;
  teamMemberLimit?: number | null;
  editorFreelancerLimit?: number | null;
  sortOrder?: number;
};

export type MobilePackagesResponse = {
  ok: boolean;
  audience: 'AGENCY' | 'FREELANCER';
  session: Pick<
    MobileSession,
    'userId' | 'role' | 'packageId' | 'packageName' | 'packageAudience' | 'packageStatus' | 'packageExpiresAt' | 'workspaceMode'
  > | null;
  packages: MobileRegistrationPackage[];
};

export type MobileSubscriptionStatusResponse = {
  ok: boolean;
  active: boolean;
  reason: 'ACTIVE' | 'PACKAGE_REQUIRED' | 'SUPER_ADMIN_BYPASS';
  packageStatus: MobileSession['packageStatus'];
  packageName?: string | null;
  packageAudience?: MobileSession['packageAudience'];
  packageExpiresAt?: string | null;
  audience?: 'AGENCY' | 'FREELANCER';
  entitlementState?: 'NONE' | 'FREE_ACTIVE' | 'MANDATE_PENDING' | 'PREMIUM_ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';
  onboardingState?: { stage: string; profileDoneAt: string | null; completedAt: string | null } | null;
  subscription: {
    id: string;
    status: string;
    paymentStatus: string;
    billingType: string;
    billingInterval: string;
    amount: number;
    currency: string;
    startsAt: string | null;
    expiresAt: string | null;
    renewsAt: string | null;
    package: {
      id: string;
      name: string;
      slug: string;
      packageType: string;
      audience: string;
      priceLabel: string | null;
      billingLabel: string | null;
    } | null;
  } | null;
};

export type MobileSubscribeResponse = {
  ok: boolean;
  nextAction: 'tabs' | 'payment' | 'agency-profile' | 'freelancer-services';
  token: string;
  session: MobileSession;
  transactionId?: string;
  paymentPath?: string;
  paymentUrl?: string;
};

export type MobileSignupResponse = {
  ok: boolean;
  challengeId: string;
  intentId: string;
  phone: string;
  deliveryMode: 'whatsapp-sent' | 'local-only' | 'preconfigured-code';
  expiresAt: string;
  testCode?: string;
  message: string;
  otpFallback?: 'whatsapp-command';
  otpCommand?: string;
  otpChannelLabel?: string;
  whatsappHref?: string | null;
};

export type MobileSignupConflict = {
  kind: 'same-package' | 'package-change';
  existingPackageId?: string;
  existingPackageName?: string;
  existingPackageAudience?: 'FREELANCER' | 'AGENCY' | null;
  requestedPackageId?: string;
  requestedPackageName?: string;
  requestedPackageAudience?: 'FREELANCER' | 'AGENCY' | null;
};

export type ConnectedSignupStartResponse = {
  ok: boolean;
  intentId: string;
  challengeId: string;
  phone: string;
  role: 'AGENCY' | 'FREELANCER';
  deliveryMode: 'whatsapp-sent' | 'local-only' | 'preconfigured-code';
  expiresAt: string;
  testCode?: string;
  usesStaticOtp?: boolean;
  otpFallback?: 'whatsapp-command';
  otpCommand?: string;
  otpChannelLabel?: string;
  whatsappHref?: string | null;
  message: string;
  packages?: MobileRegistrationPackage[];
};

export type ConnectedSignupVerifyResponse = MobileLoginResponse & {
  nextAction: 'package';
  packages: Array<MobileRegistrationPackage & { zeroCommission?: boolean; commissionOverridePercent?: number }>;
};

export type ConnectedSignupActivateResponse = MobileLoginResponse & {
  nextAction: 'payment' | 'agency-profile' | 'freelancer-services';
  paymentUrl?: string | null;
  pricing: { originalAmount: number; discountAmount: number; finalAmount: number };
};

export type FreelancerDashboardResponse = {
  ok: boolean;
  stats: {
    projectsDone: number;
    workingWithAgencies: number;
    serviceViews: number;
  };
};

export type FreelancerServiceRecord = {
  id: string;
  slug?: string;
  ownerId?: string;
  ownerName?: string;
  ownerAlias?: string;
  title: string;
  sampleVideoUrl?: string;
  sampleVideoEmbedUrl?: string;
  summary: string;
  category: 'Video Editing' | 'Graphic Design' | string;
  specialty?: string;
  description?: string;
  targetAudience?: string;
  deliveryTime?: string;
  revisions?: string;
  basePrice: number;
  currency: 'INR' | string;
  tags?: string[];
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string[];
  deliverables?: string[];
  faq?: Array<{ question: string; answer: string }>;
  media?: Array<{
    id: string;
    kind: 'image' | 'video';
    title: string;
    accent?: string;
    sourceUrl?: string;
    embedUrl?: string;
  }>;
  status?: string;
  listingEnabled?: boolean;
  availability?: 'ACTIVE' | 'PAUSED';
  reviewNote?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type FreelancerServicesResponse = {
  ok: boolean;
  services: FreelancerServiceRecord[];
};

export type MobileUserProfileResponse = {
  ok: boolean;
  profile: {
    userId?: string;
    fullName?: string;
    displayName?: string;
    phone?: string;
    profession?: string;
    languages?: string[];
    englishLevel?: string;
    bio?: string;
    email?: string | null;
    availability?: string;
    niche?: string;
    profileImageUrl?: string;
    skills?: string[];
    socialLinks?: string[];
    tags?: string[];
    status?: 'DRAFT' | 'COMPLETED';
  };
};

export type MobileOrdersResponse = {
  ok: boolean;
  assets: Array<{
    id: string;
    conversationId: string;
    title: string;
    status: string;
    assignedFreelancerName?: string | null;
    uploadedByName?: string | null;
    createdAt?: string;
  }>;
  publishJobs?: Array<{ id: string; assetId: string; status: string }>;
};

export type MobileNotificationsResponse = {
  ok: boolean;
  unread?: number;
  notifications: Array<{
    id: string;
    title: string;
    body?: string;
    message?: string;
    status?: string;
    entityType?: string | null;
    entityId?: string | null;
    createdAt: string;
    readAt?: string | null;
  }>;
};

export type MobileNotificationReadResponse = {
  ok: boolean;
  notification: MobileNotificationsResponse['notifications'][number];
};

export type MobilePushTestResponse = {
  ok: boolean;
  targetUserId?: string;
  sent?: number;
  error?: string;
  detail?: string;
  diagnostics?: {
    fcmTokenCount?: number;
    firebaseAdminAvailable?: boolean;
    [key: string]: unknown;
  };
};

export type MobilePushDebugResponse = {
  ok: boolean;
  user?: {
    id: string;
    role: MobileRole;
  };
  push?: {
    activeTokenCount: number;
    channels?: Record<string, string>;
    chatChannelId?: string;
    global?: Record<string, unknown>;
    tokens?: Array<Record<string, unknown>>;
  };
  inboundDispatch?: Record<string, unknown>;
  assignmentDispatch?: {
    last?: {
      assignmentId: string;
      attempted: number;
      failed: number;
      recordedAt: string;
      sent: number;
      status: string;
    } | null;
  };
  firebaseAdmin?: Record<string, unknown>;
  latestNotificationLog?: {
    id: string;
    type: string;
    status: string;
    failureReason?: string | null;
    createdAt: string;
  } | null;
  notificationLogs?: Array<Record<string, unknown>>;
  error?: string;
  message?: string;
  stage?: string;
};

export type MobileOnboardingStep = {
  id: string;
  title: string;
  description: string;
  route: string;
  ctaLabel: string;
  completionHint?: string;
  manualCompleteAllowed?: boolean;
  tourTarget?: string;
};

export type MobileOnboardingChecklist = {
  key: string;
  role: MobileRole;
  title: string;
  steps: MobileOnboardingStep[];
};

export type MobileOnboardingProgress = {
  id: string;
  userId: string;
  role: MobileRole;
  checklistKey: string;
  completedSteps: string[];
  skippedSteps: string[];
  dismissed: boolean;
  completedAt: string | null;
  lastSeenStep: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MobileOnboardingResponse = {
  ok: boolean;
  checklist: MobileOnboardingChecklist;
  progress: MobileOnboardingProgress;
};

export type MobileIntegrationStatusResponse = {
  ok: boolean;
  tenantId?: string;
  connection?: Record<string, unknown> | null;
  config?: Record<string, unknown> | null;
  uploads?: Array<Record<string, unknown>>;
  vapidKey?: string;
  error?: string;
};

export type MobileSystemHealthResponse = {
  ok: boolean;
  health: {
    ok: boolean;
    provider?: string;
    databaseUrlConfigured?: boolean;
    checkedAt?: string;
    latencyMs?: number;
    message?: string;
    error?: string;
    [key: string]: unknown;
  };
};

export type MobileFreelancerDashboardResponse = {
  ok: boolean;
  trust?: { score: number; band: string; provisional: boolean; nextAction: string };
  stats: {
    activeAssignments?: number;
    pendingPaymentRequests?: number;
    projectsDone: number;
    revisionRequests?: number;
    walletAvailable?: number;
    workingWithAgencies: number;
    serviceViews: number;
  };
};

export type MobileGenericDashboardResponse = {
  ok: boolean;
  snapshot?: Record<string, unknown>;
  channels?: Record<string, unknown>;
  [key: string]: unknown;
};

export type MobileWalletResponse = {
  ok: boolean;
  wallet: {
    grossEarned: number;
    commissionDeducted: number;
    pendingClearance: number;
    availableForWithdrawal: number;
  };
  ledger: Array<{
    id: string;
    assignmentId: string;
    commission: number;
    commissionPercent: number;
    conversationId: string;
    gross: number;
    net: number;
    paymentRequestId: string;
    status: string;
    title: string;
    createdAt: string;
  }>;
};

export type MobilePaymentDetailsResponse = {
  ok: boolean;
  paymentDetails: Record<string, unknown> | null;
};

export type MobilePayoutRequestsResponse = {
  ok: boolean;
  payoutRequests: Array<Record<string, unknown>>;
  payoutRequest?: Record<string, unknown>;
};

export type MobileAccountingRequestsResponse = {
  ok: boolean;
  audience: 'agency' | 'editor';
  summary: {
    total: number;
    pending: number;
    paid: number;
    credited: number;
    pendingAmount: number;
    paidAmount: number;
    walletCreditedAmount: number;
    platformCommissionAmount: number;
  };
  records: Array<{
    id: string;
    assignmentId: string;
    conversationId: string;
    customerName: string;
    projectTitle?: string;
    title: string;
    amount: number;
    commissionAmount: number;
    freelancerAmount: number;
    freelancerName: string;
    status: string;
    rawStatus: string;
    createdAt: string;
    paymentLink?: string | null;
  }>;
};

export type MobileManagersResponse = {
  ok: boolean;
  managers: Array<Record<string, unknown>>;
};

export type MobileTeamRequestsResponse = {
  ok: boolean;
  requests: Array<Record<string, unknown>>;
  memberships: Array<Record<string, unknown>>;
};

export type MobileContactsResponse = {
  ok: boolean;
  contacts: Array<Record<string, unknown>>;
  statuses?: Array<Record<string, unknown>>;
  managers?: Array<Record<string, unknown>>;
};

export type MobileTeamMembershipStatus = 'INVITED' | 'REQUESTED' | 'ACTIVE' | 'SUSPENDED' | 'DECLINED' | 'REMOVED';

export type MobileTeamEditor = {
  id: string;
  userId: string;
  name: string;
  alias?: string | null;
  specialty?: string | null;
  phone?: string | null;
  title: string;
  category: string;
  bio: string;
  avatarUrl?: string | null;
  verificationStatus: string;
  karmaScore: number;
  trustScore?: number | null;
  trustProvisional?: boolean | null;
  trustUpdatedAt?: string | null;
  workload?: { activeProjects: number; activeChats: number } | null;
  invitation?: { id: string; status: string; updatedAt: string; direction?: string } | null;
  skills?: string[];
  workloadBand?: string | null;
  isOnline?: boolean;
  acceptingProjects?: boolean | null;
  presenceUpdatedAt?: string | null;
  startingPrice?: number | null;
  deliveryTime?: string | null;
  portfolioLinks: string[];
  services: Array<{
    id: string;
    slug: string;
    title: string;
    category?: string | null;
    price?: number | null;
    deliveryTime?: string | null;
    portfolioUrl?: string | null;
  }>;
  membership: {
    id: string;
    status: MobileTeamMembershipStatus;
    assignmentEligible: boolean;
    updatedAt: string;
  } | null;
  offerEligible?: boolean;
  directAssignmentEligible?: boolean;
};

export type MobileAgencyTeamMembership = {
  requestKind?: 'TEAM' | 'WORK';
  id: string;
  agencyId: string;
  agencyName: string;
  agencySlug: string;
  agencyBrief: string;
  invitedByName?: string | null;
  direction: 'AGENCY_TO_FREELANCER' | 'FREELANCER_TO_AGENCY';
  status: MobileTeamMembershipStatus;
  assignmentEligible: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MobileAgencyDirectoryProfile = {
  id: string;
  ownerUserId: string;
  tenantId: string;
  publicName: string;
  slug: string;
  logoUrl?: string | null;
  coverUrl?: string | null;
  tagline: string;
  description: string;
  niche: string;
  categories: string[];
  specialties: string[];
  hiringStatus: string;
  office: {
    city: string;
    state: string;
    country: string;
    hasOffice: boolean;
    officeVerified: boolean;
    isAddressPublic: boolean;
    publicOfficeAddress: string;
    officeHours: string;
  };
  stats: {
    completedOrders: number;
    averageRating: number;
    reviewCount: number;
    repeatClientPercent: number;
    responseSlaMinutes: number;
    activeEditors: number;
    openOpportunities: number;
  };
  reputation: { score: number; band: string };
  reviews: Array<{ id: string; rating: number; authorLabel: string; projectType: string; comment: string; verified: boolean }>;
  serviceOffers: Array<{ id: string; title: string; priceLabel: string; summary: string }>;
};

export type MobileAgencyDirectoryResponse = {
  ok: boolean;
  mode: 'FREELANCER';
  agencies: MobileAgencyDirectoryProfile[];
  requests: Array<Record<string, unknown>>;
  memberships: Array<Record<string, unknown>>;
};

export type MobileEditorDirectoryResponse =
  | {
      ok: boolean;
      mode: 'agency';
      scope?: 'team' | 'general';
      agency?: { id: string; name: string; slug: string } | null;
      editors: MobileTeamEditor[];
      totals?: { general: number; active: number; pending: number };
      invitations?: Array<{ id: string; editorId: string; editorName: string; status: string; direction?: string; updatedAt: string }>;
      pageInfo?: { total: number; nextCursor: string | null };
    }
  | {
      ok: boolean;
      mode: 'freelancer';
      requests: MobileAgencyTeamMembership[];
      memberships: MobileAgencyTeamMembership[];
      history: MobileAgencyTeamMembership[];
    };

export type DashboardStat = {
  label: string;
  value: string;
};

export type ServiceSummary = {
  id: string;
  title: string;
  category: string;
  price: string;
  status: string;
};

export type OrderSummary = {
  id: string;
  title: string;
  client: string;
  status: 'Active' | 'Pending' | 'Review';
  amount: string;
};

export type MobileConversationRole = 'customer' | 'manager' | 'admin' | 'freelancer';

export type MobileConversationLane = 'customer' | 'internal';

export type MobileConversationReadKey = MobileConversationRole | `${MobileConversationRole}:${MobileConversationLane}`;

export type MobileInboxAudience = 'admin' | 'manager' | 'freelancer';

export type MobileLeadStatusTone = 'neutral' | 'accent' | 'warning' | 'success';

export type MobileLeadStatus = {
  id: string;
  label: string;
  tone: MobileLeadStatusTone;
  order: number;
  active: boolean;
};

export type MobileAssignableEditor = {
  id: string;
  name: string;
  specialties: string[];
  workloadBand: string;
  karmaScore: number;
  onlineStatus?: 'online' | 'offline';
  acceptingProjects?: boolean;
  lastOnlineAt?: string;
  isTeamMember?: boolean;
  offerEligible?: boolean;
  directAssignmentEligible?: boolean;
  verificationStatus?: string;
  startingPrice?: number | null;
  portfolioLinks?: string[];
};

export type MobileConversationTemplate = {
  id: string;
  title: string;
  category: string;
  content: string;
};

export type MobilePaymentStatus = 'Draft' | 'Sent' | 'Viewed' | 'Paid' | 'Failed' | 'Cancelled';

export type MobilePaymentRequest = {
  id: string;
  assignmentId?: string;
  projectId?: string;
  projectTitle?: string;
  title: string;
  note: string;
  amount: number;
  dueLabel?: string;
  lane: MobileConversationLane;
  payerRole: 'client' | 'agency';
  payeeRole: 'agency' | 'freelancer';
  status: MobilePaymentStatus;
  paymentProvider?: string;
  paymentOrderId?: string;
  paymentConfigurationName?: string;
  paymentLink?: string;
  upiUrl?: string;
  upiId?: string;
  payeeName?: string;
  proofSubmittedAt?: string;
  paidConfirmedByRole?: MobileConversationRole;
  paidConfirmedByName?: string;
  paidConfirmedAt?: string;
  createdAt: string;
  split?: {
    planLabel: string;
    platformPercentage: number;
    editorPercentage: number;
    grossAmount: number;
    platformAmount: number;
    editorAmount: number;
  };
};

export type MobileConversationAttachment = {
  id: string;
  kind: 'file' | 'image' | 'video' | 'audio' | 'voice-note' | 'youtube-upload' | 'payment-request';
  target?: 'local' | 'youtube';
  name: string;
  mimeType?: string;
  sizeLabel?: string;
  note?: string;
  durationLabel?: string;
  collectionName?: string;
  externalUrl?: string;
  paymentRequestId?: string;
};

export type MobileFreelancerCustomerLanePermission = {
  enabled: boolean;
  grantedByRole?: 'manager' | 'admin';
  grantedByName?: string;
  grantedAt?: string;
  transportState?: 'ready' | 'demo' | 'blocked';
  transportNote?: string;
};

export type MobileConversationMessage = {
  id: string;
  clientMessageId?: string;
  lane: MobileConversationLane;
  senderRole: MobileConversationRole;
  senderLabel: string;
  body: string;
  attachments?: MobileConversationAttachment[];
  visibility?: 'client_private';
  externalMessageId?: string;
  deliveryStatus?: 'failed' | 'sent' | 'delivered' | 'read';
  deliveryError?: string;
  deletedAt?: string;
  deletedByRole?: MobileConversationRole;
  deletedByUserId?: string;
  deletedScope?: 'everyone';
  deleteMetaSynced?: boolean;
  deleteMetaSupported?: boolean;
  deleteMetaNote?: string;
  createdAt?: string;
};

export type MobileConversationAssignmentOffer = {
  id: string;
  freelancerId: string;
  freelancerName: string;
  projectDetails: string;
  status: 'PENDING' | 'ACCEPTED' | 'PASSED' | 'EXPIRED';
  offeredByRole: 'manager' | 'admin';
  offeredByName: string;
  createdAt: string;
  respondedAt?: string;
  expiresAt?: string;
  expiredReason?: 'timeout' | 'accepted_by_other' | 'manual' | 'fallback';
  source?: 'manual' | 'targeted' | 'fallback';
  category?: string;
};

export type MobileConversation = {
  id: string;
  contactId?: string;
  serviceId?: string;
  serviceSlug?: string;
  serviceTitle: string;
  customerDisplayName: string;
  clientAlias?: string;
  customerPhoneDisplay?: string;
  customerProfileImageUrl?: string;
  status: string;
  leadStatusId?: string;
  leadStatusLabel?: string;
  leadStatusTone?: MobileLeadStatusTone;
  summary?: string;
  assignedFreelancerName?: string;
  assignedFreelancerId?: string;
  ownerName?: string;
  ownerRole?: 'manager' | 'admin';
  unreadCount: number;
  unreadCountByLane: Record<MobileConversationLane, number>;
  readStateByAudience?: Partial<Record<MobileConversationReadKey, string>>;
  latestMessageLane: MobileConversationLane;
  preferredLane: MobileConversationLane;
  visibleLanes: MobileConversationLane[];
  messages: MobileConversationMessage[];
  typing?: Array<{ role: MobileConversationRole; label: string; lane: MobileConversationLane; active?: boolean; updatedAt?: string }>;
  laneCounts?: Record<MobileConversationLane, number>;
  internalNotes?: string;
  isInAppCustomerThread?: boolean;
  lastCustomerActivityAt?: string;
  agencyContext?: {
    tenantId: string;
    agencyName: string;
    agencySlug: string;
    agencyProfilePath: string;
    location: string;
    hiringStatus: string;
    specialties: string[];
    trustScore: number;
    trustBand: string;
    membershipRole: string;
    membershipStatus: string;
    responseSlaLabel: string;
    payoutTrustLabel: string;
    repeatClientLabel: string;
  };
  agencySummary?: {
    tenantId: string;
    agencyName: string;
    agencySlug: string;
    agencyProfilePath: string;
    location: string;
  };
  assignmentSummary: {
    assignedFreelancerId?: string;
    assignedFreelancerName?: string;
    ownerName?: string;
    ownerRole?: 'manager' | 'admin';
    offers?: MobileConversationAssignmentOffer[];
    pendingOfferCount?: number;
    myOffer?: MobileConversationAssignmentOffer;
  };
  assignmentOffers?: MobileConversationAssignmentOffer[];
  myAssignmentOffer?: MobileConversationAssignmentOffer;
  laneCapabilities: Record<MobileConversationLane, { visible: boolean; writable: boolean; reason?: string }>;
  capabilities?: {
    canViewConversation: boolean;
    canViewCustomerLane: boolean;
    canViewInternalLane: boolean;
    canViewPrivateMessages: boolean;
    canSendCustomerMessage: boolean;
    canSendInternalMessage: boolean;
    canManageParticipants: boolean;
  };
  freelancerCustomerLanePermission?: MobileFreelancerCustomerLanePermission;
  latestPaymentRequest?: MobilePaymentRequest;
  paymentRequests?: MobilePaymentRequest[];
  sourceChannel?: 'whatsapp' | 'instagram' | 'in-app';
  channelConnectionId?: string;
  channelConnectionName?: string;
  businessPhoneDisplay?: string;
};

export type MobileConversationsResponse = {
  ok: boolean;
  conversations: MobileConversation[];
  assignableEditors?: MobileAssignableEditor[];
  leadStatuses?: MobileLeadStatus[];
  templates?: MobileConversationTemplate[];
  supportDataIncluded?: boolean;
};

export type MobileProjectOpportunity = {
  id: string;
  agencyId: string;
  agencyName: string;
  title: string;
  specialty: string;
  budgetRange: string;
  turnaround: string;
  urgency: string;
  experienceTag: string;
  minimumKarma: number;
  preferredWorkload: string;
  shortlistCount: number;
  openStatus: string;
  visibility: string;
  teamMembershipRequired: boolean;
  applicationStatus?: string | null;
  agencyTrust?: {
    score: number;
    band: string;
    responseSla: string;
    repeatClients: string;
    location: string;
  } | null;
};

export type MobileProjectsResponse = {
  ok: boolean;
  projects: MobileProjectOpportunity[];
};

export type MobileWorkPostStatus = 'OPEN' | 'PAUSED' | 'FILLED' | 'CLOSED';
export type MobileWorkVisibility = 'PUBLIC_MATCHED' | 'PRIVATE_INVITE' | 'AGENCY_TEAM';
export type MobileWorkType = 'ONE_TIME' | 'RECURRING' | 'MONTHLY' | 'URGENT';
export type MobileWorkExperienceLevel = 'BEGINNER' | 'INTERMEDIATE' | 'EXPERT';
export type MobileWorkApplicationStatus = 'PENDING' | 'SHORTLISTED' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
export type MobileWorkInviteStatus = 'INVITED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export type MobileEditorMatch = {
  bio: string;
  category: string;
  editorId: string;
  experienceLevel: MobileWorkExperienceLevel;
  matchPercentage: number;
  matchedReasons: string[];
  matchedSkills: string[];
  matchedTags: string[];
  name: string;
  phoneMasked: string;
  portfolioLinks: string[];
  serviceCount: number;
  services: Array<{
    basePrice: number;
    category: string;
    id: string;
    slug: string;
    specialty: string;
    status: string;
    tags: string[];
    title: string;
  }>;
  skills: string[];
};

export type MobileWorkApplication = {
  agencyId: string;
  applicationId: string;
  availability: string;
  createdAt: string;
  editor?: MobileEditorMatch;
  editorId: string;
  editorName?: string;
  expectedDelivery: string;
  expectedPayout: number | null;
  portfolioLinks: string[];
  proposalMessage: string;
  status: MobileWorkApplicationStatus;
  workPostId: string;
};

export type MobileWorkInvite = {
  agencyId: string;
  createdAt: string;
  editor?: MobileEditorMatch;
  editorId: string;
  expiresAt: string | null;
  inviteId: string;
  message: string;
  status: MobileWorkInviteStatus;
  workPostId: string;
};

export type MobileWorkPost = {
  taskStatus?: string;
  agencyId: string;
  agencyName: string;
  assignedFreelancerId?: string | null;
  assignedFreelancerName?: string | null;
  recommendationsAvailable?: boolean;
  applications?: MobileWorkApplication[];
  attachmentLinks: string[];
  budgetMax: number | null;
  budgetMin: number | null;
  category: string;
  createdAt: string;
  deadline: string | null;
  description: string;
  editorsNeeded: number;
  experienceLevel: MobileWorkExperienceLevel;
  expectedOutput: string;
  id: string;
  invites?: MobileWorkInvite[];
  match?: {
    experienceLevel: MobileWorkExperienceLevel;
    matchPercentage: number;
    matchedReasons: string[];
    matchedSkills: string[];
    matchedTags: string[];
    skills: string[];
  };
  niche: string;
  recommendedEditors?: MobileEditorMatch[];
  sampleLink: string | null;
  skills: string[];
  status: MobileWorkPostStatus;
  tags: string[];
  tenantId: string;
  title: string;
  updatedAt: string;
  visibility: MobileWorkVisibility;
  workType: MobileWorkType;
};

export type MobileWorkConnection = {
  agencyId: string;
  connectionId: string;
  createdAt: string;
  editor?: MobileEditorMatch;
  editorId: string;
  sourceId: string;
  sourceType: string;
  status: string;
  workPost?: MobileWorkPost;
  workPostId: string;
};

export type MobileWorkMatchingResponse =
  | {
      ok: boolean;
      mode: 'agency';
      totals: {
        acceptedApplications: number;
        openPosts: number;
        pendingApplications: number;
        recommendedEditors: number;
      };
      workPosts: MobileWorkPost[];
      connections: MobileWorkConnection[];
    }
  | {
      ok: boolean;
      mode: 'editor';
      totals: {
        activeConnections: number;
        availableWork: number;
        invites: number;
        pendingApplications: number;
      };
      matchedWork: MobileWorkPost[];
      applications: MobileWorkApplication[];
      invites: MobileWorkInvite[];
      connections: MobileWorkConnection[];
    };

export type MobileCreateWorkPostInput = {
  attachmentLinks?: string;
  budgetMax?: string;
  budgetMin?: string;
  category: string;
  deadline?: string;
  description: string;
  editorsNeeded?: string;
  experienceLevel: MobileWorkExperienceLevel;
  expectedOutput?: string;
  niche: string;
  sampleLink?: string;
  skills?: string;
  tags?: string;
  title: string;
  visibility: MobileWorkVisibility;
  workType: MobileWorkType;
};

export type MobileWorkApplicationInput = {
  availability?: string;
  expectedDelivery?: string;
  expectedPayout?: string;
  portfolioLinks?: string;
  proposalMessage: string;
  serviceId?: string;
};

export type MobileAssignmentStatus =
  | 'DRAFT'
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'REVISION_REQUESTED'
  | 'COMPLETED'
  | 'PAYMENT_REQUESTED'
  | 'CANCELLED'
  | string;

export type MobileAssignmentRecord = {
  id: string;
  tenantId: string;
  agencyUserId: string;
  agencyName: string;
  freelancerId: string;
  freelancerName: string;
  managerId?: string | null;
  clientContactId?: string | null;
  taskId?: string | null;
  applicationId?: string | null;
  title: string;
  brief: string;
  category: string;
  deadline?: string | null;
  budgetAmount: number;
  priority: string;
  status: MobileAssignmentStatus;
  revisionStatus?: string | null;
  deliveryLinks: string[];
  notes: string;
  chatThreadId?: string | null;
  acceptedAt?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  source?: 'CHAT' | 'MARKETPLACE';
  conversationId?: string | null;
  offerId?: string | null;
  offerExpiresAt?: string | null;
};

export type MobileDeliverySubmission = {
  id: string;
  assignmentId: string;
  tenantId: string;
  freelancerId: string;
  freelancerName: string;
  version: number;
  deliveryLinks: string[];
  notes: string;
  status: string;
  reviewedById?: string | null;
  reviewedByRole?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  createdAt?: string;
  submittedAt?: string | null;
  updatedAt?: string;
};

export type MobileRevisionRequest = {
  id: string;
  assignmentId: string;
  submissionId?: string | null;
  tenantId: string;
  freelancerId: string;
  reason: string;
  notes: string;
  dueDate?: string | null;
  status: string;
  requestedById: string;
  requestedByRole: string;
  resolvedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type MobileAssignmentsResponse = {
  ok: boolean;
  assignments: MobileAssignmentRecord[];
};

export type MobileAssignmentDetailResponse = {
  ok: boolean;
  assignment: MobileAssignmentRecord;
  submissions: MobileDeliverySubmission[];
  revisions: MobileRevisionRequest[];
};

export type MobileAssignmentMutationResponse = {
  ok: boolean;
  assignment: MobileAssignmentRecord;
};

export type MobileDeliverySubmissionResponse = MobileAssignmentMutationResponse & {
  submission: MobileDeliverySubmission;
};

export type MobileDeliveryReviewResponse = MobileDeliverySubmissionResponse & {
  revision: MobileRevisionRequest | null;
};

export type MobileAssignmentPaymentRequestResponse = MobileAssignmentMutationResponse & {
  duplicate: boolean;
  paymentRequest: MobilePaymentRequest | null;
};

export type MobileFreelancerAssessmentQuestion = {
  id: string;
  competency: string;
  prompt: string;
  options: Array<{
    id: string;
    label: string;
  }>;
};

export type MobileFreelancerOnboardingState = {
  version?: number;
  status?: string;
  currentStep: number;
  completed: boolean;
  categories: string[];
  selectedCategories: {
    primary: string | null;
    secondary: string[];
  };
  service: Record<string, unknown> | null;
  assessment: {
    submitted: boolean;
    score: number | null;
    questions: MobileFreelancerAssessmentQuestion[];
  };
  profile: Record<string, unknown>;
  drafts: {
    service: Record<string, unknown>;
    profile: Record<string, unknown>;
    answers: Record<string, string>;
  };
  identity: {
    status: string;
    verified: boolean;
    skipped: boolean;
    verifiedName: string | null;
    documentType: string | null;
  };
  trust: {
    score: number;
    provisional: boolean;
    nextAction?: string | null;
  };
};

export type MobileFreelancerOnboardingResponse = {
  ok: boolean;
  onboarding: MobileFreelancerOnboardingState;
};

export type MobileFreelancerAssessmentResponse = {
  ok: boolean;
  assessment: MobileFreelancerOnboardingState['assessment'];
};

export type MobileReferredAgencyItem = {
  id: string;
  agencyName: string;
  registeredAt: string;
  hasSubscribed: boolean;
  packageName?: string | null;
  commissionEarned: number;
  status: string;
};

export type MobileFreelancerReferralResponse = {
  ok: boolean;
  referralCode: string;
  shareUrl: string;
  playStoreUrl: string;
  commissionRate: number;
  metrics: {
    clicks: number;
    registeredAgencies: number;
    activeSubscribers: number;
    totalCommissionEarned: number;
    pendingCommission: number;
    paidCommission: number;
  };
  commissionPlan: {
    monthlyCommissionPercent: number;
    yearlyCommissionPercent: number;
    description: string;
  };
  referredAgencies: MobileReferredAgencyItem[];
  salesAttribution?: {
    referredBySalesAgent: string;
    salesCommissionRate: number;
  } | null;
};

