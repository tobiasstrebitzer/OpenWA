import { BadRequestException, Injectable, NotFoundException, UseGuards } from '@nestjs/common';
import { Action, Actions } from '@silkweave/nestjs';
import { z } from 'zod/v4';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { SessionService } from '../session/session.service';

const SessionInput = z.object({
  sessionId: z.string().describe('Session ID'),
});

const GroupInput = z.object({
  sessionId: z.string().describe('Session ID'),
  groupId: z.string().describe('Group ID (e.g., 120363xxx@g.us)'),
});

const CreateInput = z.object({
  sessionId: z.string().describe('Session ID'),
  name: z.string().min(1).describe('Group subject/name'),
  participants: z.array(z.string()).min(1).describe('Participant WhatsApp IDs (e.g. 628123456789@c.us)'),
});

const ParticipantsInput = z.object({
  sessionId: z.string().describe('Session ID'),
  groupId: z.string().describe('Group ID'),
  participants: z.array(z.string()).min(1).describe('Participant WhatsApp IDs (e.g. 628123456789@c.us)'),
});

const SubjectInput = z.object({
  sessionId: z.string().describe('Session ID'),
  groupId: z.string().describe('Group ID'),
  subject: z.string().min(1).describe('New group subject/name'),
});

const DescriptionInput = z.object({
  sessionId: z.string().describe('Session ID'),
  groupId: z.string().describe('Group ID'),
  description: z.string().describe('New group description (may be empty to clear it)'),
});

@Injectable()
@Actions('groups')
@UseGuards(ApiKeyGuard)
export class GroupActions {
  constructor(private readonly sessionService: SessionService) {}

  @Action({
    description: 'Get all groups for a session',
    method: 'GET',
    path: 'sessions/:sessionId/groups',
    input: SessionInput,
    kind: 'query',
  })
  list(input: z.infer<typeof SessionInput>) {
    const engine = this.getEngine(input.sessionId);
    return engine.getGroups();
  }

  @Action({
    description: 'Get detailed group info',
    method: 'GET',
    path: 'sessions/:sessionId/groups/:groupId',
    input: GroupInput,
    kind: 'query',
  })
  async get(input: z.infer<typeof GroupInput>) {
    const engine = this.getEngine(input.sessionId);
    const group = await engine.getGroupInfo(input.groupId);
    if (!group) {
      throw new NotFoundException(`Group ${input.groupId} not found`);
    }
    return group;
  }

  @Action({
    description: 'Get group invite code/link',
    method: 'GET',
    path: 'sessions/:sessionId/groups/:groupId/invite-code',
    input: GroupInput,
    kind: 'query',
  })
  async inviteCode(input: z.infer<typeof GroupInput>) {
    const engine = this.getEngine(input.sessionId);
    const inviteCode = await engine.getGroupInviteCode(input.groupId);
    return {
      inviteCode,
      inviteLink: `https://chat.whatsapp.com/${inviteCode}`,
    };
  }

  @Action({
    description: 'Create a new group',
    method: 'POST',
    path: 'sessions/:sessionId/groups',
    input: CreateInput,
  })
  create(input: z.infer<typeof CreateInput>) {
    const engine = this.getEngine(input.sessionId);
    return engine.createGroup(input.name, input.participants);
  }

  @Action({
    description: 'Add participants to a group',
    method: 'POST',
    path: 'sessions/:sessionId/groups/:groupId/participants',
    input: ParticipantsInput,
  })
  async addParticipants(input: z.infer<typeof ParticipantsInput>) {
    const engine = this.getEngine(input.sessionId);
    await engine.addParticipants(input.groupId, input.participants);
    return { success: true, message: 'Participants added' };
  }

  @Action({
    description: 'Remove participants from a group',
    method: 'DELETE',
    path: 'sessions/:sessionId/groups/:groupId/participants',
    input: ParticipantsInput,
  })
  async removeParticipants(input: z.infer<typeof ParticipantsInput>) {
    const engine = this.getEngine(input.sessionId);
    await engine.removeParticipants(input.groupId, input.participants);
    return { success: true, message: 'Participants removed' };
  }

  @Action({
    description: 'Promote participants to admin',
    method: 'POST',
    path: 'sessions/:sessionId/groups/:groupId/participants/promote',
    input: ParticipantsInput,
  })
  async promoteParticipants(input: z.infer<typeof ParticipantsInput>) {
    const engine = this.getEngine(input.sessionId);
    await engine.promoteParticipants(input.groupId, input.participants);
    return { success: true, message: 'Participants promoted to admin' };
  }

  @Action({
    description: 'Demote participants from admin',
    method: 'POST',
    path: 'sessions/:sessionId/groups/:groupId/participants/demote',
    input: ParticipantsInput,
  })
  async demoteParticipants(input: z.infer<typeof ParticipantsInput>) {
    const engine = this.getEngine(input.sessionId);
    await engine.demoteParticipants(input.groupId, input.participants);
    return { success: true, message: 'Participants demoted from admin' };
  }

  @Action({
    description: 'Change group name/subject',
    method: 'PUT',
    path: 'sessions/:sessionId/groups/:groupId/subject',
    input: SubjectInput,
  })
  async setSubject(input: z.infer<typeof SubjectInput>) {
    const engine = this.getEngine(input.sessionId);
    await engine.setGroupSubject(input.groupId, input.subject);
    return { success: true, message: 'Group subject updated' };
  }

  @Action({
    description: 'Change group description',
    method: 'PUT',
    path: 'sessions/:sessionId/groups/:groupId/description',
    input: DescriptionInput,
  })
  async setDescription(input: z.infer<typeof DescriptionInput>) {
    const engine = this.getEngine(input.sessionId);
    await engine.setGroupDescription(input.groupId, input.description);
    return { success: true, message: 'Group description updated' };
  }

  @Action({
    description: 'Leave a group',
    method: 'POST',
    path: 'sessions/:sessionId/groups/:groupId/leave',
    input: GroupInput,
  })
  async leave(input: z.infer<typeof GroupInput>) {
    const engine = this.getEngine(input.sessionId);
    await engine.leaveGroup(input.groupId);
    return { success: true, message: 'Left the group' };
  }

  @Action({
    description: 'Revoke group invite code and generate new one',
    method: 'POST',
    path: 'sessions/:sessionId/groups/:groupId/invite-code/revoke',
    input: GroupInput,
  })
  async revokeInviteCode(input: z.infer<typeof GroupInput>) {
    const engine = this.getEngine(input.sessionId);
    const newCode = await engine.revokeGroupInviteCode(input.groupId);
    return {
      inviteCode: newCode,
      inviteLink: `https://chat.whatsapp.com/${newCode}`,
      message: 'Invite code revoked and new one generated',
    };
  }

  /** Resolve the running engine for a session, mirroring the old controller. */
  private getEngine(sessionId: string) {
    const engine = this.sessionService.getEngine(sessionId);
    if (!engine) {
      throw new BadRequestException('Session is not started');
    }
    return engine;
  }
}
