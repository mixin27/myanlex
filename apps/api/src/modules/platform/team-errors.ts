import { ConflictException } from '@nestjs/common';
import { TeamConflict } from './team.repository.js';

/** Maps repository state conflicts to 409 problem responses. */
export async function teamWrite<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof TeamConflict)
      throw new ConflictException(error.message);
    throw error;
  }
}
