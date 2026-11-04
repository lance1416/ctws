# CTWS: Cheesy Toast Work Space

One person's hub. Your work, your life and the things you think of all go in here, and once they
are in they know about each other.

It is also where the working day starts and ends. In the morning it tells you what to move next;
during the day whatever comes to mind goes straight back into it; in the evening it shows what the
day closed. Every feature is measured by whether it makes that loop shorter.

## Who it is for

One person — no teams, no assigning, no approvals, nobody to notify.

Someone running several unrelated things at once: a few software projects, a job hunt, some open
source. The only thing those have in common is the person doing them, so the job is not to manage
one of them well. It is to keep all of them present at once without any of them drowning out the
rest.

## What it holds

Eight kinds of thing, each with a colour, an icon and a page of its own.

**Projects** are the crossing points. A project page carries its tasks, its meetings, its people,
its organisations, its communication and its reading, all at once. Each project wears a filled tile with
its initials in one of eight colours, everywhere it is mentioned. The colour belongs to the
project, so filtering or reordering never repaints it. One project, the Inbox, always exists and
cannot be deleted. Projects can be archived.

**Tasks** have a title, a body in Markdown, a status, a day they are planned for, a moment they are
due, a project and a parent. A task with no children has a status of its own: backlog (just written
down), to do, in progress, done or cancelled; new tasks start as to do. A task with children does
not: its status is worked out from theirs, so a folder such as "Amazon" is never "in progress" by
hand while nothing under it has started. Any task may carry a stage — Applied, Onsite, Spec review —
which is where it has got to, kept apart from its status.

**People** have a name in three parts (given, middle, family) shown in the order their script
expects, other names with labels of your own, the roles they hold at organisations with when they
started and stopped, a hometown, a city they live in and its time zone, a gender, any of the circles
you keep, and notes in Markdown. Ways to reach them are a repeatable set: each one is an email, a
phone number or a link, with an optional label of your own — "the one for interviews" is more use
than anything a fixed list would offer. Birthdays are below.

**Organisations** are the companies, firms and schools people work at and projects deal with.

**Communication** is the exchanges you log by hand: a message sent or received, by which channel,
with whom, about what.

**Meetings** have a title, a local start time with its time zone, a duration, a repeat rule, a
place or a link to join, notes, a project and the people in the room.

**Reading** comes in two shapes: a link, with a web address and a title, or a book, with an author.
It is to read, being read, finished or dropped. No page numbers — nobody keeps those up to date.

**Notes** are written in Markdown. They stand alone, in folders of your own, or hang on any other
thing: meeting notes are notes hung on a meeting.

**Links between them.** Some links are fields with a fixed meaning: a meeting's people, a thing's
project, a person's roles, who recommended a book. Every other link just says the two are related,
and the reason comes from where it was made: mention something with @ in a note, a task or a
message, and its page shows the sentence that mentioned it. A link reads from both ends; neither
side is kept in step by hand.

## What each one does

### Tasks

Tasks nest. Drag to reorder, to change a parent, or to move one to another project. There is a
depth limit, and a task cannot be dropped inside its own descendants — that is refused on the spot,
with a reason, and the fold it opened is put back.

A task can wait on another. A blocked task says in the list what it is waiting for. One that is
neither blocked nor started is ready to start, and only those are offered as what to do next.

A parent shows the whole subtree rolled up: progress, how many tasks are in progress and how many
are overdue. Backlog and cancelled tasks are left out of progress — "not counted" and "nothing
done" are different answers.

A project's tasks can be read as a tree, as a board by status, or — once anything in it has a
stage — as a board by stage, where dragging a card moves it to the next step. Which view you chose
is in the address, so a reload and a shared link both land where you were. New tasks are typed
straight into the tree; nothing opens a dialog to add a line.

### People and birthdays

A birthday is entered once, in the calendar it was given in, and both calendars follow. Solar or
lunar, leap months included; the year may be left out, because knowing the day and not the year is
the normal case; the hour can be recorded too. Each person carries how early to be told: a week,
three days, a day, or the day itself — counted at midnight where they live, so a greeting can land
on the stroke of their day.

The people overview answers whose birthday is coming, nearest first, and who you have or have not
been in touch with. Birthdays also show up in the calendar.

A date that does not exist is refused before it is stored, and the refusal says why — "There is no
闰四月 in 2027.", not "invalid input". Hometown and city are chosen from a real list of
cities and stored in their standard spelling, so a misspelt city cannot be saved.

### Organisations and communication

A person can hold several roles at once, and several at the same place; a role with no end date is
current. An organisation's page lists who is there now and who was there before.

A sent message can wait for a reply, with a day to follow up. When that day comes and nothing has
come back, it turns up in Today; logging the reply closes it. The communication page keeps one row
per organisation — the last exchange and what is next — which is how a search for a lawyer, a job
hunt or a supplier is followed through.

### Meetings

A change to a repeating meeting always asks what it applies to: this one, this one and everything
after it, or the whole series. Splitting from here leaves the past as it was.

Cancelling one occurrence and deleting the series are two different things.

A meeting's page carries this time's notes and every earlier one in the series, readable in place,
and the tasks that came out of them.

### Reading

Paste a link and the title is fetched for you. When it cannot be read, the row shows the readable
form of the address — host and path, never the bare domain, because "x.com" does not say which
post. Finished reading folds away, and the count stays visible: it is the way back to it.

### Notes

Everything written in CTWS is written in one editor: a note, a meeting's notes, a task's body, a
message. It is Markdown, shown as it will read. The line the cursor is on shows its marks; the rest
is already set — headings, lists, boxes you tick by clicking, tables, code highlighted as you type,
maths and diagrams. Paste a web address over selected words and they become a link. Type @ to
mention anything, and it shows as a tag with that kind's icon. Vim keys are a switch in the
account.

A note's page fills the screen, with its outline beside it; the outline can be put away. One key
turns the whole note into plain source, every mark showing, and back again. A note can be
downloaded as a .md file.

A note that stands alone can go in a folder, folders can hold folders, three levels deep at most,
and a note can be pinned: pinned notes are listed at the top and stay in their folder as well.
Deleting a folder deletes no notes; what was in it moves up a level. Notes hung on a meeting, a
person or a project go where that thing goes.

### What changed, and when

Everything keeps a record of what happened to it: created, changed, moved to a new stage, linked,
deleted. Each page reads it back as a timeline, together with the messages, meetings and notes
about that thing. An old link to something deleted still says when it went and where it was.

## The pages that cut across

**Getting around.** The header says where you are, and holds what works from every page: search,
the capture box, the list of keys and the account. The activity bar on the left holds the pages
that cut across every kind (Workbench, Today, Calendar, Review), then one icon for each kind of
thing. Each kind's side panel is its list; picking something opens its page beside the list, and
something linked from that page opens to the right without leaving it. On a phone, five tabs at the
bottom take their place: Today, Calendar, capture, People and More.

**One capture box.** Everything is written down in the same place. A link becomes reading, a
sentence becomes a task in the Inbox, and the box says which it picked and where it went; switch it
if it guessed wrong. It sits in the header of every page, and in the middle of the phone's tabs.

**One search box.** One query across everything, and each result says what kind of thing it is.
Before anything is typed it lists what was opened lately and every place you can go.

**Today** answers what to move next: what is in progress, what is planned for today, what is
overdue, which messages are due a follow-up, and what is ready to start. A strip across the top
shows the day's meetings and deadlines against the clock, and how long until the next one. Overdue
work is re-dated in place, without opening anything. Beside it: how much each project moved this
week, and which one has gone quiet.

**Review** steps back a week at a time — what was finished, what was started, what was dropped,
grouped by project, and which things changed stage. Dropping something is a decision, so it
belongs in the account.

**Calendar** is a month at a time, with meetings, deadlines, follow-ups and birthdays in the same
squares, and the lunar day in each one.

**The workbench** is the front page, and it answers what is in front of you: what you came back
from, what is running, what to launch, who to answer. It is made of widgets of a few fixed sizes.
For now they sit in one arrangement chosen for each screen width; moving, resizing, adding and
removing them come later.

## Rules the interface keeps

1. **Reading and editing are two states.** Opening anything shows a page you can read and one Edit
   button, not a screen of fields that give no sign they can be clicked.
2. **Delete is always in the same place**: the bottom of the screen, below everything, separated
   from the body. It always asks once, and the question names what will be lost. Nothing else is
   reached by passing over it.
3. **Opening a thing does not leave the list.** It opens beside it and has an address of its own,
   so a link you send yourself opens that list with that thing open.
4. **Write it any way; it is shown one way.** Phone numbers, cities and dates are typed however is
   convenient and always displayed in the same tidy form. The same number looks identical in a list
   and on a page.
5. **No complaints while you are still typing.** The field speaks when you leave it, and it says
   which rule is missing — "start with the country code", not "invalid format". Start typing again
   and it takes the message back.
6. **An empty screen says what the place is for**, and never carries a button that exists because
   the layout looked bare.
7. **Every page is reachable from the keyboard**, and every key is listed in one place.
8. **It holds up where it is narrow.** The same block has to render inside a 310px pane and across
   a full page, and read correctly in both. At phone width nothing scrolls sideways.
9. **Light and dark**, following the system or set by hand, remembered, and never flashing the
   wrong one on the way in.
10. **The words are a product's words**: plain English, a verb that says what pressing it does, and
    the same word for the same action all the way through.

## Room for the next kind of thing

There are eight kinds of thing today and there will be more. Adding one means it takes an icon in
the activity bar, takes a captured line, turns up in search, hangs a block on a project page, hands
its dates to the calendar and can offer a widget to the workbench — without the kinds already there
being touched, and without the header or the phone's tabs changing.

The other direction holds too: none of those shared surfaces may serve one kind of thing only. A
design that works only because the thing is a task has mistaken a part for the whole.

## Accounts

Someone who is not signed in sees a page that says what CTWS is, and the way in. Sign in with an
email and a password. An admin can create accounts and disable them;
everyone else is a member. One person's data is never visible to another.

Each account has its own time zone, and every "today", "this week" and date is counted in it rather
than the server's. When the server cannot be reached the app says so and says your session is fine,
instead of returning you to the sign-in page, which reads as though your password had stopped
working.

## Running it

Developer setup and the local stack are in [CONTRIBUTING.md](CONTRIBUTING.md); deployment is in
[DEPLOY.md](DEPLOY.md).

## Licence

MIT — see [LICENSE](LICENSE). Bundled third-party data and fonts are credited in
[NOTICE](NOTICE).
