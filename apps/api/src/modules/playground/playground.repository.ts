import type { Run } from '@myanlex/playground';

export const PLAYGROUND_REPOSITORY = Symbol('PLAYGROUND_REPOSITORY');
export interface SavedRunMetadata {
  id: string;
  title: string;
  projectId: string;
  createdAt: Date;
  expiresAt: Date;
  payloadSize: number;
}
export interface SavedRun extends SavedRunMetadata {
  snapshot: Run;
}
export interface SaveInput {
  id: string;
  title: string;
  snapshot: Run;
}
export interface RunListQuery {
  after?: string | undefined;
  limit: number;
}
export interface PlaygroundRepository {
  save(
    userId: string,
    projectId: string,
    input: SaveInput,
    size: number,
  ): Promise<SavedRun>;
  list(
    userId: string,
    projectId: string,
    query: RunListQuery,
  ): Promise<{ items: SavedRunMetadata[]; nextCursor: string | null }>;
  get(userId: string, projectId: string, id: string): Promise<SavedRun | null>;
  rename(
    userId: string,
    projectId: string,
    id: string,
    title: string,
  ): Promise<SavedRunMetadata | null>;
  delete(userId: string, projectId: string, id: string): Promise<boolean>;
  cleanup(): Promise<number>;
}
export class SaveConflict extends Error {}
export class SaveLimit extends Error {}
