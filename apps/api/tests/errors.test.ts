import { describe, expect, it } from 'vitest'
import { problemOf } from '../src/platform/http/errors'
import { InboxProtectedError, ProjectNotFoundError } from '../src/shell/projects/errors'
import {
  DependencyCycleError,
  DepthLimitError,
  InvalidCursorError,
  InvalidNeighbourError,
  ManualProgressOnParentError,
  MoveCycleError,
  TaskNotFoundError,
} from '../src/modules/tasks/errors'
import {
  BadRuleError,
  MeetingNotFoundError,
  OccurrenceNotFoundError,
  OneOccurrenceLimitError,
} from '../src/modules/meetings/errors'
import { ImpossibleBirthdayError, PersonNotFoundError } from '../src/modules/people/errors'
import { ReadingItemNotFoundError, WrongKindError } from '../src/modules/reading/errors'
import { LinkEndNotFoundError, UnknownLinkError } from '../src/shell/links/errors'
import {
  EmailTakenError,
  InvalidCredentialsError,
  RegistrationClosedError,
  SessionRequiredError,
} from '../src/shell/auth/errors'
import { AdminRequiredError, LastAdminError, UserNotFoundError } from '../src/shell/admin/errors'

const notFound = { status: 404, title: 'Not Found' }
const conflict = (detail: string) => ({ status: 409, title: 'Conflict', detail })

describe('every refusal keeps its wire form', () => {
  it.each([
    [new TaskNotFoundError(), notFound],
    [new ProjectNotFoundError(), notFound],
    [new MeetingNotFoundError(), notFound],
    [new OccurrenceNotFoundError(), notFound],
    [new PersonNotFoundError(), notFound],
    [new ReadingItemNotFoundError(), notFound],
    [new LinkEndNotFoundError(), notFound],
    [new DependencyCycleError(), conflict('That would make two tasks wait for each other')],
    [new DepthLimitError(), conflict('Tasks can be nested at most 10 levels deep')],
    [
      new ManualProgressOnParentError(),
      conflict('Manual progress can only be set on a task without children'),
    ],
    [
      new MoveCycleError(),
      conflict('A task cannot be moved under itself or one of its own descendants'),
    ],
    [new InboxProtectedError(), conflict('The inbox cannot be removed')],
    [
      new OneOccurrenceLimitError(),
      conflict('Only the time or the length of a single occurrence can differ from its series'),
    ],
    [new WrongKindError('url', 'book'), conflict('A book has no url')],
    [new InvalidNeighbourError('x'), { status: 400, title: 'Bad Request', detail: 'x' }],
    [new InvalidCursorError(), { status: 400, title: 'Bad Request', detail: 'Invalid cursor' }],
    [new ImpossibleBirthdayError('y'), { status: 400, title: 'Bad Request', detail: 'y' }],
    [
      new UnknownLinkError(),
      { status: 400, title: 'Bad Request', detail: 'that is not a kind of link' },
    ],
    [
      new BadRuleError(),
      { status: 422, title: 'Unprocessable Entity', detail: 'That repeat rule schedules nothing' },
    ],
    [new EmailTakenError(), { status: 409, title: 'That email is already registered' }],
    [new RegistrationClosedError('closed'), { status: 403, title: 'Registration is closed' }],
    [
      new RegistrationClosedError('invite'),
      { status: 403, title: 'A valid invite code is required' },
    ],
    [new InvalidCredentialsError(), { status: 401, title: 'Invalid email or password' }],
    [new SessionRequiredError(), { status: 401, title: 'Authentication required' }],
    [new UserNotFoundError(), { status: 404, title: 'User not found' }],
    [new LastAdminError(), { status: 409, title: 'At least one enabled admin must remain' }],
    [new AdminRequiredError(), { status: 403, title: 'Admin role required' }],
  ])('%s', (error, expected) => {
    expect(problemOf(error)).toEqual(expected)
  })
})
