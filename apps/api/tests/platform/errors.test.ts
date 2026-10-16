import { describe, expect, it } from 'vitest'
import { NotFound } from '../../src/platform/errors'
import { problemOf } from '../../src/platform/http/errors'
import { InboxProtectedError } from '../../src/shell/projects/errors'
import {
  BothNeighboursError,
  DependencyCycleError,
  DepthLimitError,
  InvalidNeighbourError,
  MoveCycleError,
} from '../../src/modules/tasks/errors'
import { BadRuleError, OneOccurrenceLimitError } from '../../src/modules/meetings/errors'
import { ImpossibleBirthdayError } from '../../src/modules/people/errors'
import { WrongKindError } from '../../src/modules/reading/errors'
import {
  EmailTakenError,
  InvalidCredentialsError,
  RegistrationClosedError,
  SessionRequiredError,
} from '../../src/shell/auth/errors'
import { AdminRequiredError, LastAdminError } from '../../src/shell/admin/errors'

const plain = (status: number, title: string) => (detail: string) => ({
  type: 'about:blank',
  status,
  title,
  detail,
})
const invalid = plain(400, 'Bad Request')
const notFound = plain(404, 'Not Found')
const conflict = plain(409, 'Conflict')
const unprocessable = plain(422, 'Unprocessable Entity')
const named = (status: number, slug: string, title: string) => ({
  type: `urn:ctws:problem:${slug}`,
  status,
  title,
})

describe('every refusal sends exactly what it declares', () => {
  it.each([
    [new NotFound('Task'), notFound('Task not found')],
    [new NotFound('Reading item'), notFound('Reading item not found')],
    [new DependencyCycleError(), conflict('That would make two tasks wait for each other')],
    [new DepthLimitError(), conflict('Tasks can be nested at most 10 levels deep')],
    [
      new MoveCycleError(),
      conflict('A task cannot be moved under itself or one of its own descendants'),
    ],
    [new InboxProtectedError(), conflict('The inbox cannot be removed')],
    [
      new OneOccurrenceLimitError(),
      unprocessable(
        'Only the time or the length of a single occurrence can differ from its series',
      ),
    ],
    [new WrongKindError('url', 'book'), unprocessable('A book has no url')],
    [new BothNeighboursError(), invalid('Give at most one of beforeId and afterId')],
    [
      new InvalidNeighbourError(),
      unprocessable('The neighbour is not a live sibling at the destination'),
    ],
    [new ImpossibleBirthdayError('y'), unprocessable('y')],
    [new BadRuleError(), unprocessable('That repeat rule schedules nothing')],
    [new EmailTakenError(), named(409, 'email-taken', 'That email is already registered')],
    [new RegistrationClosedError(), named(403, 'registration-closed', 'Registration is closed')],
    [new InvalidCredentialsError(), named(401, 'invalid-credentials', 'Invalid email or password')],
    [new SessionRequiredError(), named(401, 'session-required', 'Authentication required')],
    [new LastAdminError(), named(409, 'last-admin', 'At least one enabled admin must remain')],
    [new AdminRequiredError(), named(403, 'admin-required', 'Admin role required')],
  ])('%s', (error, expected) => {
    expect(problemOf(error)).toEqual(expected)
  })
})
