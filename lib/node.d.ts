import type { IncomingMessage, ServerResponse } from 'node:http';
export function lantern(options?: { root?: string }): (req: IncomingMessage & { originalUrl?: string }, res: ServerResponse) => void;
