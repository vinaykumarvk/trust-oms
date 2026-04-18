/**
 * Real-time Subscription & Collaborative Workspace Service (Phase 6D)
 *
 * Manages real-time channel subscriptions, event broadcasting, workspace
 * presence, committee voting, and workspace chat. Designed as in-memory
 * stubs that mirror the Supabase Realtime API surface so the front-end
 * can be wired up immediately and the transport swapped later.
 *
 * Channels:
 *   POSITIONS, NAV_UPDATES, ORDER_STATUS, SETTLEMENT_EVENTS,
 *   AUM_UPDATES, COMMITTEE_WORKSPACE
 *
 * Workspace features:
 *   - Presence tracking (who is currently online)
 *   - 6-eyes committee voting (APPROVE / REJECT / ABSTAIN)
 *   - Real-time chat messaging
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChannelDescriptor {
  channel: string;
  description: string;
  category: 'MARKET_DATA' | 'OPERATIONS' | 'GOVERNANCE';
}

export interface RealtimeEvent {
  id: string;
  type: string;
  data: any;
  timestamp: string;
  channel: string;
}

export interface PresenceEntry {
  userId: string;
  userName: string;
  joinedAt: string;
  lastSeen: string;
  status: 'ONLINE' | 'IDLE';
}

export interface Vote {
  id: string;
  workspaceId: string;
  userId: string;
  decision: 'APPROVE' | 'REJECT' | 'ABSTAIN';
  comments: string | null;
  votedAt: string;
}

export interface WorkspaceMessage {
  id: string;
  workspaceId: string;
  userId: string;
  userName: string;
  message: string;
  sentAt: string;
}

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

/** channel -> Set<userId> */
const subscriptions = new Map<string, Set<string>>();

/** channel -> ring buffer of recent events (max 200 per channel) */
const eventBuffers = new Map<string, RealtimeEvent[]>();
const MAX_EVENT_BUFFER = 200;

/** workspaceId -> Map<userId, PresenceEntry> */
const presenceMap = new Map<string, Map<string, PresenceEntry>>();

/** workspaceId -> Vote[] */
const voteStore = new Map<string, Vote[]>();

/** workspaceId -> WorkspaceMessage[] */
const messageStore = new Map<string, WorkspaceMessage[]>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let eventSeq = 0;
function nextEventId(): string {
  eventSeq += 1;
  return `evt-${Date.now()}-${eventSeq}`;
}

let voteSeq = 0;
function nextVoteId(): string {
  voteSeq += 1;
  return `vote-${Date.now()}-${voteSeq}`;
}

let msgSeq = 0;
function nextMsgId(): string {
  msgSeq += 1;
  return `msg-${Date.now()}-${msgSeq}`;
}

function ensureSet(channel: string): Set<string> {
  if (!subscriptions.has(channel)) {
    subscriptions.set(channel, new Set());
  }
  return subscriptions.get(channel)!;
}

function ensureBuffer(channel: string): RealtimeEvent[] {
  if (!eventBuffers.has(channel)) {
    eventBuffers.set(channel, []);
  }
  return eventBuffers.get(channel)!;
}

function ensurePresence(workspaceId: string): Map<string, PresenceEntry> {
  if (!presenceMap.has(workspaceId)) {
    presenceMap.set(workspaceId, new Map());
  }
  return presenceMap.get(workspaceId)!;
}

function ensureVotes(workspaceId: string): Vote[] {
  if (!voteStore.has(workspaceId)) {
    voteStore.set(workspaceId, []);
  }
  return voteStore.get(workspaceId)!;
}

function ensureMessages(workspaceId: string): WorkspaceMessage[] {
  if (!messageStore.has(workspaceId)) {
    messageStore.set(workspaceId, []);
  }
  return messageStore.get(workspaceId)!;
}

// ---------------------------------------------------------------------------
// Channel Registry
// ---------------------------------------------------------------------------

const CHANNEL_REGISTRY: ChannelDescriptor[] = [
  {
    channel: 'POSITIONS',
    description: 'Real-time position updates across all portfolios',
    category: 'MARKET_DATA',
  },
  {
    channel: 'NAV_UPDATES',
    description: 'NAVpu / NAV per-share computation updates',
    category: 'MARKET_DATA',
  },
  {
    channel: 'ORDER_STATUS',
    description: 'Order lifecycle status changes (DRAFT -> FILLED -> SETTLED)',
    category: 'OPERATIONS',
  },
  {
    channel: 'SETTLEMENT_EVENTS',
    description: 'Settlement instruction state transitions and confirmations',
    category: 'OPERATIONS',
  },
  {
    channel: 'AUM_UPDATES',
    description: 'Aggregate AUM changes from inflows, outflows, and market moves',
    category: 'MARKET_DATA',
  },
  {
    channel: 'COMMITTEE_WORKSPACE',
    description: 'Committee decision workspace events (votes, chat, presence)',
    category: 'GOVERNANCE',
  },
];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const realtimeService = {
  // =========================================================================
  // Channel Registry
  // =========================================================================

  getChannelRegistry(): ChannelDescriptor[] {
    return CHANNEL_REGISTRY;
  },

  // =========================================================================
  // Subscription Management
  // =========================================================================

  subscribe(userId: string, channel: string): { subscribed: boolean; channel: string; userId: string } {
    const valid = CHANNEL_REGISTRY.find((c: ChannelDescriptor) => c.channel === channel);
    if (!valid) {
      throw new Error(`Unknown channel: ${channel}`);
    }
    const set = ensureSet(channel);
    set.add(userId);

    // Emit a synthetic event
    this.publishEvent(channel, {
      type: 'USER_SUBSCRIBED',
      data: { userId },
      timestamp: new Date().toISOString(),
    });

    return { subscribed: true, channel, userId };
  },

  unsubscribe(userId: string, channel: string): { unsubscribed: boolean; channel: string; userId: string } {
    const set = ensureSet(channel);
    set.delete(userId);

    this.publishEvent(channel, {
      type: 'USER_UNSUBSCRIBED',
      data: { userId },
      timestamp: new Date().toISOString(),
    });

    return { unsubscribed: true, channel, userId };
  },

  getSubscribers(channel: string): { channel: string; subscribers: string[]; count: number } {
    const set = ensureSet(channel);
    const subscribers = Array.from(set);
    return { channel, subscribers, count: subscribers.length };
  },

  // =========================================================================
  // Event Broadcasting
  // =========================================================================

  publishEvent(
    channel: string,
    event: { type: string; data: any; timestamp: string },
  ): RealtimeEvent {
    const buffer = ensureBuffer(channel);

    const realtimeEvent: RealtimeEvent = {
      id: nextEventId(),
      type: event.type,
      data: event.data,
      timestamp: event.timestamp,
      channel,
    };

    buffer.push(realtimeEvent);

    // Trim ring buffer
    if (buffer.length > MAX_EVENT_BUFFER) {
      buffer.splice(0, buffer.length - MAX_EVENT_BUFFER);
    }

    return realtimeEvent;
  },

  getRecentEvents(channel: string, limit?: number): RealtimeEvent[] {
    const buffer = ensureBuffer(channel);
    const n = Math.min(limit ?? 50, buffer.length);
    return buffer.slice(-n);
  },

  // =========================================================================
  // Workspace Presence
  // =========================================================================

  getPresence(workspaceId: string): PresenceEntry[] {
    const map = ensurePresence(workspaceId);
    const now = Date.now();

    // Mark anyone not seen in 30 seconds as IDLE
    map.forEach((entry: PresenceEntry) => {
      const lastSeen = new Date(entry.lastSeen).getTime();
      entry.status = now - lastSeen > 30_000 ? 'IDLE' : 'ONLINE';
    });

    return Array.from(map.values());
  },

  joinWorkspace(
    workspaceId: string,
    userId: string,
    userName: string,
  ): PresenceEntry {
    const map = ensurePresence(workspaceId);
    const now = new Date().toISOString();

    const entry: PresenceEntry = {
      userId,
      userName,
      joinedAt: now,
      lastSeen: now,
      status: 'ONLINE',
    };

    map.set(userId, entry);

    // Broadcast join event to the COMMITTEE_WORKSPACE channel
    this.publishEvent('COMMITTEE_WORKSPACE', {
      type: 'PRESENCE_JOIN',
      data: { workspaceId, userId, userName },
      timestamp: now,
    });

    return entry;
  },

  leaveWorkspace(workspaceId: string, userId: string): { left: boolean; workspaceId: string; userId: string } {
    const map = ensurePresence(workspaceId);
    map.delete(userId);

    this.publishEvent('COMMITTEE_WORKSPACE', {
      type: 'PRESENCE_LEAVE',
      data: { workspaceId, userId },
      timestamp: new Date().toISOString(),
    });

    return { left: true, workspaceId, userId };
  },

  // =========================================================================
  // Committee Voting (6-eyes authorization)
  // =========================================================================

  castVote(
    workspaceId: string,
    userId: string,
    decision: string,
    comments?: string,
  ): Vote {
    const validDecisions = ['APPROVE', 'REJECT', 'ABSTAIN'];
    if (!validDecisions.includes(decision)) {
      throw new Error(`Invalid decision: ${decision}. Must be one of ${validDecisions.join(', ')}`);
    }

    const votes = ensureVotes(workspaceId);

    // Check if user already voted — replace if so
    const existingIdx = votes.findIndex((v: Vote) => v.userId === userId);

    const vote: Vote = {
      id: nextVoteId(),
      workspaceId,
      userId,
      decision: decision as Vote['decision'],
      comments: comments ?? null,
      votedAt: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      votes[existingIdx] = vote;
    } else {
      votes.push(vote);
    }

    // Broadcast vote event
    this.publishEvent('COMMITTEE_WORKSPACE', {
      type: 'VOTE_CAST',
      data: { workspaceId, userId, decision, voteId: vote.id },
      timestamp: vote.votedAt,
    });

    return vote;
  },

  getVotes(workspaceId: string): {
    workspaceId: string;
    votes: Vote[];
    summary: {
      total: number;
      approve: number;
      reject: number;
      abstain: number;
    };
    resolution: 'PENDING' | 'APPROVED' | 'REJECTED';
    requiredApprovals: number;
  } {
    const votes = ensureVotes(workspaceId);

    const approve = votes.filter((v: Vote) => v.decision === 'APPROVE').length;
    const reject = votes.filter((v: Vote) => v.decision === 'REJECT').length;
    const abstain = votes.filter((v: Vote) => v.decision === 'ABSTAIN').length;
    const total = votes.length;

    // 6-eyes → need at least 3 approvals for resolution
    const requiredApprovals = 3;

    let resolution: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING';
    if (approve >= requiredApprovals) {
      resolution = 'APPROVED';
    } else if (reject >= requiredApprovals) {
      resolution = 'REJECTED';
    }

    return {
      workspaceId,
      votes,
      summary: { total, approve, reject, abstain },
      resolution,
      requiredApprovals,
    };
  },

  // =========================================================================
  // Workspace Chat
  // =========================================================================

  sendWorkspaceMessage(
    workspaceId: string,
    userId: string,
    userName: string,
    message: string,
  ): WorkspaceMessage {
    const messages = ensureMessages(workspaceId);

    const msg: WorkspaceMessage = {
      id: nextMsgId(),
      workspaceId,
      userId,
      userName,
      message,
      sentAt: new Date().toISOString(),
    };

    messages.push(msg);

    // Also refresh presence lastSeen
    const presence = ensurePresence(workspaceId);
    const entry = presence.get(userId);
    if (entry) {
      entry.lastSeen = msg.sentAt;
      entry.status = 'ONLINE';
    }

    // Broadcast chat event
    this.publishEvent('COMMITTEE_WORKSPACE', {
      type: 'CHAT_MESSAGE',
      data: { workspaceId, userId, userName, messageId: msg.id },
      timestamp: msg.sentAt,
    });

    return msg;
  },

  getWorkspaceMessages(workspaceId: string): WorkspaceMessage[] {
    return ensureMessages(workspaceId);
  },
};
