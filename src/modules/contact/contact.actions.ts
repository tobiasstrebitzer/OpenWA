import { BadRequestException, Injectable, NotFoundException, UseGuards } from '@nestjs/common';
import { Action, Actions } from '@silkweave/nestjs';
import { z } from 'zod/v4';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { SessionService } from '../session/session.service';

const SessionInput = z.object({
  sessionId: z.string().describe('Session ID'),
});

const ContactInput = z.object({
  sessionId: z.string().describe('Session ID'),
  contactId: z.string().describe('Contact ID (e.g., 628xxx@c.us)'),
});

const CheckInput = z.object({
  sessionId: z.string().describe('Session ID'),
  number: z.string().describe('Phone number to check (e.g., 628123456789)'),
});

@Injectable()
@Actions({ prefix: 'contacts', transports: ['rest'] })
@UseGuards(ApiKeyGuard)
export class ContactActions {
  constructor(private readonly sessionService: SessionService) {}

  @Action({
    description: 'Get all contacts for a session',
    input: SessionInput,
    kind: 'query',
    method: 'GET',
    path: 'sessions/:sessionId/contacts',
  })
  list(input: z.infer<typeof SessionInput>) {
    const engine = this.getEngine(input.sessionId);
    return engine.getContacts();
  }

  @Action({
    description: 'Get a specific contact by ID',
    input: ContactInput,
    kind: 'query',
    method: 'GET',
    path: 'sessions/:sessionId/contacts/:contactId',
  })
  async get(input: z.infer<typeof ContactInput>) {
    const engine = this.getEngine(input.sessionId);
    const contact = await engine.getContactById(input.contactId);
    if (!contact) {
      throw new NotFoundException(`Contact ${input.contactId} not found`);
    }
    return contact;
  }

  @Action({
    description: 'Check if a phone number exists on WhatsApp',
    input: CheckInput,
    kind: 'query',
    method: 'GET',
    path: 'sessions/:sessionId/contacts/check/:number',
  })
  async check(input: z.infer<typeof CheckInput>) {
    const engine = this.getEngine(input.sessionId);
    const exists = await engine.checkNumberExists(input.number);
    return {
      number: input.number,
      exists,
      whatsappId: exists ? `${input.number}@c.us` : null,
    };
  }

  @Action({
    description: 'Get profile picture URL for a contact',
    input: ContactInput,
    kind: 'query',
    method: 'GET',
    path: 'sessions/:sessionId/contacts/:contactId/profile-picture',
  })
  async profilePicture(input: z.infer<typeof ContactInput>) {
    const engine = this.getEngine(input.sessionId);
    const url = await engine.getProfilePicture(input.contactId);
    return { url };
  }

  @Action({
    description: 'Block a contact',
    input: ContactInput,
    method: 'POST',
    path: 'sessions/:sessionId/contacts/:contactId/block',
  })
  async block(input: z.infer<typeof ContactInput>) {
    const engine = this.getEngine(input.sessionId);
    await engine.blockContact(input.contactId);
    return { success: true, message: 'Contact blocked' };
  }

  @Action({
    description: 'Unblock a contact',
    input: ContactInput,
    method: 'DELETE',
    path: 'sessions/:sessionId/contacts/:contactId/block',
  })
  async unblock(input: z.infer<typeof ContactInput>) {
    const engine = this.getEngine(input.sessionId);
    await engine.unblockContact(input.contactId);
    return { success: true, message: 'Contact unblocked' };
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
