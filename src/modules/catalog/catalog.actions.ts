import { Injectable, UseGuards } from '@nestjs/common';
import { Action, Actions } from '@silkweave/nestjs';
import { z } from 'zod/v4';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { CatalogService } from './catalog.service';

const SessionInput = z.object({
  sessionId: z.string().describe('Session ID'),
});

const ProductsInput = z.object({
  sessionId: z.string().describe('Session ID'),
  page: z.coerce.number().int().min(1).optional().default(1).describe('Page number'),
  limit: z.coerce.number().int().min(1).optional().default(20).describe('Items per page'),
});

const ProductInput = z.object({
  sessionId: z.string().describe('Session ID'),
  productId: z.string().describe('Product ID'),
});

const SendProductInput = z.object({
  sessionId: z.string().describe('Session ID'),
  chatId: z.string().describe('Chat ID to send the product to'),
  productId: z.string().describe('Product ID to send'),
  body: z.string().optional().describe('Optional message body'),
});

const SendCatalogInput = z.object({
  sessionId: z.string().describe('Session ID'),
  chatId: z.string().describe('Chat ID to send the catalog link to'),
  body: z.string().optional().describe('Optional message body'),
});

@Injectable()
@Actions('catalog')
@UseGuards(ApiKeyGuard)
export class CatalogActions {
  constructor(private readonly catalogService: CatalogService) {}

  @Action({
    description: 'Get business catalog info for a session',
    input: SessionInput,
    kind: 'query',
    method: 'GET',
    path: 'sessions/:sessionId/catalog',
  })
  get(input: z.infer<typeof SessionInput>) {
    return this.catalogService.getCatalog(input.sessionId);
  }

  @Action({
    description: 'List catalog products for a session',
    input: ProductsInput,
    kind: 'query',
    method: 'GET',
    path: 'sessions/:sessionId/catalog/products',
  })
  products(input: z.infer<typeof ProductsInput>) {
    return this.catalogService.getProducts(input.sessionId, input.page, input.limit);
  }

  @Action({
    description: 'Get a specific catalog product',
    input: ProductInput,
    kind: 'query',
    method: 'GET',
    path: 'sessions/:sessionId/catalog/products/:productId',
  })
  product(input: z.infer<typeof ProductInput>) {
    return this.catalogService.getProduct(input.sessionId, input.productId);
  }

  @Action({
    description: 'Send a product message to a chat',
    input: SendProductInput,
    method: 'POST',
    path: 'sessions/:sessionId/messages/send-product',
  })
  sendProduct(input: z.infer<typeof SendProductInput>) {
    return this.catalogService.sendProduct(input.sessionId, input.chatId, input.productId, input.body);
  }

  @Action({
    description: 'Send a catalog link to a chat',
    input: SendCatalogInput,
    method: 'POST',
    path: 'sessions/:sessionId/messages/send-catalog',
  })
  sendCatalog(input: z.infer<typeof SendCatalogInput>) {
    return this.catalogService.sendCatalog(input.sessionId, input.chatId, input.body);
  }
}
