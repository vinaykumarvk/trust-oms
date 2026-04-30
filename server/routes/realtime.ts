/**
 * Real-time Subscription & Collaborative Workspace API Routes (Phase 6D)
 *
 * Provides endpoints for channel subscription management, event broadcasting,
 * workspace presence tracking, committee voting (6-eyes), and workspace chat.
 *
 *   GET  /channels                          -- Available real-time channels
 *   POST /subscribe                         -- Subscribe user to channel
 *   POST /unsubscribe                       -- Unsubscribe user from channel
 *   GET  /channels/:channel/subscribers     -- Active subscribers for channel
 *   POST /publish                           -- Publish event to channel
 *   GET  /channels/:channel/events          -- Recent events for channel
 *   GET  /workspace/:workspaceId/presence   -- Workspace presence list
 *   POST /workspace/:workspaceId/join       -- Join workspace (presence)
 *   POST /workspace/:workspaceId/leave      -- Leave workspace (presence)
 *   POST /workspace/:workspaceId/vote       -- Cast committee vote
 *   GET  /workspace/:workspaceId/votes      -- Get all votes & resolution
 *   POST /workspace/:workspaceId/chat       -- Send chat message
 *   GET  /workspace/:workspaceId/messages   -- Get chat history
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { realtimeService } from '../services/realtime-service';

const router = Router();

// =============================================================================
// Channel Registry
// =============================================================================

router.get(
  '/channels',
  asyncHandler(async (_req, res) => {
    const data = realtimeService.getChannelRegistry();
    res.json({ data });
  }),
);

// =============================================================================
// Subscription Management
// =============================================================================

router.post(
  '/subscribe',
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    const { channel } = req.body;
    if (!userId || !channel) {
      return res.status(400).json({ error: { message: 'channel is required' } });
    }
    const result = realtimeService.subscribe(userId, channel);
    res.json({ data: result });
  }),
);

router.post(
  '/unsubscribe',
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    const { channel } = req.body;
    if (!userId || !channel) {
      return res.status(400).json({ error: { message: 'channel is required' } });
    }
    const result = realtimeService.unsubscribe(userId, channel);
    res.json({ data: result });
  }),
);

router.get(
  '/channels/:channel/subscribers',
  asyncHandler(async (req, res) => {
    const { channel } = req.params;
    const data = realtimeService.getSubscribers(channel);
    res.json({ data });
  }),
);

// =============================================================================
// Event Broadcasting
// =============================================================================

router.post(
  '/publish',
  asyncHandler(async (req, res) => {
    const { channel, event } = req.body;
    if (!channel || !event) {
      return res.status(400).json({ error: { message: 'channel and event are required' } });
    }
    const { type, data, timestamp } = event;
    if (!type) {
      return res.status(400).json({ error: { message: 'event.type is required' } });
    }
    const result = realtimeService.publishEvent(channel, {
      type,
      data: data ?? {},
      timestamp: timestamp ?? new Date().toISOString(),
    });
    res.json({ data: result });
  }),
);

router.get(
  '/channels/:channel/events',
  asyncHandler(async (req, res) => {
    const { channel } = req.params;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const data = realtimeService.getRecentEvents(channel, limit);
    res.json({ data });
  }),
);

// =============================================================================
// Workspace Presence
// =============================================================================

router.get(
  '/workspace/:workspaceId/presence',
  asyncHandler(async (req, res) => {
    const { workspaceId } = req.params;
    const data = realtimeService.getPresence(workspaceId);
    res.json({ data });
  }),
);

router.post(
  '/workspace/:workspaceId/join',
  asyncHandler(async (req, res) => {
    const { workspaceId } = req.params;
    const userId = req.userId ?? '';
    const { userName } = req.body;
    if (!userId || !userName) {
      return res.status(400).json({ error: { message: 'userName is required' } });
    }
    const data = realtimeService.joinWorkspace(workspaceId, userId, userName);
    res.json({ data });
  }),
);

router.post(
  '/workspace/:workspaceId/leave',
  asyncHandler(async (req, res) => {
    const { workspaceId } = req.params;
    const userId = req.userId ?? '';
    if (!userId) {
      return res.status(401).json({ error: { message: 'Authentication required' } });
    }
    const data = realtimeService.leaveWorkspace(workspaceId, userId);
    res.json({ data });
  }),
);

// =============================================================================
// Committee Voting (6-eyes)
// =============================================================================

router.post(
  '/workspace/:workspaceId/vote',
  asyncHandler(async (req, res) => {
    const { workspaceId } = req.params;
    const userId = req.userId ?? '';
    const { decision, comments } = req.body;
    if (!userId || !decision) {
      return res.status(400).json({ error: { message: 'decision is required' } });
    }
    const data = realtimeService.castVote(workspaceId, userId, decision, comments);
    res.json({ data });
  }),
);

router.get(
  '/workspace/:workspaceId/votes',
  asyncHandler(async (req, res) => {
    const { workspaceId } = req.params;
    const data = realtimeService.getVotes(workspaceId);
    res.json({ data });
  }),
);

// =============================================================================
// Workspace Chat
// =============================================================================

router.post(
  '/workspace/:workspaceId/chat',
  asyncHandler(async (req, res) => {
    const { workspaceId } = req.params;
    const userId = req.userId ?? '';
    const { userName, message } = req.body;
    if (!userId || !userName || !message) {
      return res
        .status(400)
        .json({ error: { message: 'userName and message are required' } });
    }
    const data = realtimeService.sendWorkspaceMessage(workspaceId, userId, userName, message);
    res.json({ data });
  }),
);

router.get(
  '/workspace/:workspaceId/messages',
  asyncHandler(async (req, res) => {
    const { workspaceId } = req.params;
    const data = realtimeService.getWorkspaceMessages(workspaceId);
    res.json({ data });
  }),
);

export default router;
