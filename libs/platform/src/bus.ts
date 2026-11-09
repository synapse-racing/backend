import Redis from 'ioredis';

const BUS_CHANNEL = 'synapse:events';

export const BUS_EVENTS = {
  sessionLogout: 'auth.session.logout',
} as const;

export type BusEventType = (typeof BUS_EVENTS)[keyof typeof BUS_EVENTS];

export interface SessionLogoutEvent {
  userId: string;
  sessionId: string;
}

export type BusEventPayload<TEvent extends BusEventType> =
  TEvent extends typeof BUS_EVENTS.sessionLogout
    ? SessionLogoutEvent
    : Record<string, unknown>;

export interface BusMessage {
  type: string;
  payload: unknown;
  emittedAt: number;
}

function debug(message: string): void {
  if (process.env.NODE_ENV !== 'production') console.debug(message);
}

function resolveUrl(): string | undefined {
  const url = process.env.REDIS_URL;
  if (!url || url.trim().length === 0) return undefined;
  return url;
}

class SynapseBus {
  private publisher?: Redis;
  private subscriber?: Redis;
  private readonly handlers = new Map<string, Set<(payload: never) => void>>();

  publish<TEvent extends BusEventType>(
    type: TEvent,
    payload: BusEventPayload<TEvent>,
  ): void {
    const url = resolveUrl();
    if (!url) return;
    try {
      void this.connectPublisher(url).publish(
        BUS_CHANNEL,
        JSON.stringify({ type, payload, emittedAt: Date.now() }),
      );
    } catch (error) {
      debug(
        `Synapse event bus publish failed for ${type}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  subscribe<TEvent extends BusEventType>(
    type: TEvent,
    handler: (payload: BusEventPayload<TEvent>) => void,
  ): () => void {
    const url = resolveUrl();
    if (!url) return () => undefined;
    this.registerHandler(type, handler);
    const subscriber = this.connectSubscriber(url);
    void subscriber.subscribe(BUS_CHANNEL).catch(() => undefined);
    return () => {
      const handlers = this.handlers.get(type);
      if (!handlers) return;
      handlers.delete(handler);
      if (handlers.size === 0) this.handlers.delete(type);
      if (this.handlers.size === 0) this.releaseSubscriber();
    };
  }

  private registerHandler(
    type: string,
    handler: (payload: never) => void,
  ): void {
    const handlers = this.handlers.get(type) ?? new Set();
    handlers.add(handler);
    this.handlers.set(type, handlers);
  }

  private connectPublisher(url: string): Redis {
    if (this.publisher) return this.publisher;
    const publisher = new Redis(url, { maxRetriesPerRequest: 2 });
    publisher.on('error', (error) => {
      debug(`Synapse bus publisher error: ${error.message}`);
    });
    this.publisher = publisher;
    return publisher;
  }

  private connectSubscriber(url: string): Redis {
    if (this.subscriber) return this.subscriber;
    const subscriber = new Redis(url, { maxRetriesPerRequest: null });
    subscriber.on('error', (error) => {
      debug(`Synapse bus subscriber error: ${error.message}`);
    });
    subscriber.on('message', (channel, message) => {
      if (channel !== BUS_CHANNEL) return;
      let parsed: BusMessage;
      try {
        parsed = JSON.parse(message) as BusMessage;
      } catch {
        return;
      }
      for (const handler of this.handlers.get(parsed.type) ?? []) {
        try {
          handler(parsed.payload as never);
        } catch (error) {
          debug(
            `Synapse bus handler for ${parsed.type} failed: ${
              error instanceof Error ? error.message : error
            }`,
          );
        }
      }
    });
    this.subscriber = subscriber;
    return subscriber;
  }

  private releaseSubscriber(): void {
    const subscriber = this.subscriber;
    this.subscriber = undefined;
    if (!subscriber) return;
    subscriber.unsubscribe().catch(() => undefined);
    subscriber.quit().catch(() => undefined);
  }
}

export const synapseBus = new SynapseBus();
