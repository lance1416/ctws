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

Five kinds of thing, each with a page of its own.

**Projects** are the crossing points. A project page carries its tasks, its meetings, its people
and its reading, all at once. Each project gets one of six identity colours, and that colour
appears as a 3px bar anywhere the project is mentioned — the rail, a task row, a person's card. The
colour belongs to the project, so filtering or reordering never repaints it. One project, the
Inbox, always exists and cannot be deleted. Projects can be archived.

**Tasks** have a title, a body in Markdown, a status, a day they are planned for, a moment they are
due, a project and a parent. The five statuses are backlog (just written down), to do, in progress,
done and cancelled; new tasks start as to do.

**People** have a name, a company, a title, a hometown, a city they live in, a gender, a circle
(family, friends, work) and notes in Markdown. Ways to reach them are a repeatable set: each one is
an email, a phone number or a link, with an optional label of your own — "the one for interviews"
is more use than anything a fixed list would offer. Birthdays are below.

**Meetings** have a title, a local start time with its time zone, a duration, a repeat rule, a
place, a note, a project and the people in the room.

**Reading** comes in two shapes: a link, with a web address and a title, or a book, with an author.
It is to read, being read, finished or dropped. No page numbers — nobody keeps those up to date.

**Links between them.** Any two things can be joined by an edge that means something: belongs to a
project, attends a meeting, recommended this article, is about that. An edge reads from both ends.
The meeting page lists who is coming; that person's page lists the meetings they came to. Neither
side is kept in step by hand.

## What each one does

### Tasks

Tasks nest. Drag to reorder, to change a parent, or to move one to another project. There is a
depth limit, and a task cannot be dropped inside its own descendants — that is refused on the spot,
with a reason, and the fold it opened is put back.

A task can wait on another. A blocked task says in the list what it is waiting for.

A parent shows the whole subtree rolled up: progress, how many tasks are in progress and how many
are overdue. Backlog and cancelled tasks are left out of progress — "not counted" and "nothing
done" are different answers.

A project's tasks can be read as a tree or as a board by status. Which view you chose is in the
address, so a reload and a shared link both land where you were. New tasks are typed straight into
the tree; nothing opens a dialog to add a line.

### People and birthdays

A birthday is entered once, in the calendar it was given in, and both calendars follow. Solar or
lunar, leap months included; the year may be left out, because knowing the day and not the year is
the normal case; the hour can be recorded too. Each person carries how early to be told: a week,
three days, a day, or the day itself.

Birthdays is a view of People that answers whose birthday is coming, nearest first. Birthdays also
show up in the calendar.

A date that does not exist is refused before it is stored, and the refusal says why — "there is no
leap fourth month this year", not "invalid input". Hometown and city are chosen from a real list of
cities and stored in their standard spelling, so a misspelt city cannot be saved.

### Meetings

A change to a repeating meeting always asks what it applies to: this one, this one and everything
after it, or the whole series. Splitting from here leaves the past as it was.

Cancelling one occurrence and deleting the series are two different things.

### Reading

Paste a link and the title is fetched for you. When it cannot be read, the row shows the readable
form of the address — host and path, never the bare domain, because "x.com" does not say which
post. Finished reading folds away, and the count stays visible: it is the way back to it.

## The pages that cut across

**Getting around.** The header says where you are, and holds what works from every page: search,
the capture box, the list of keys and the account. The rail on the left holds the pages that cut
across every kind (Workbench, Today, Calendar, Review), then Things, then your projects. A kind of
thing never gets a row of its own there, so the project list is the only part of the rail that
grows. On a phone, five tabs at the bottom take the rail's place: Workbench, Today, Projects,
Calendar and Search.

**Things** lists every kind of thing, one row each, with how many there are, what is current, and
the key that goes straight there. A kind with nothing in it is listed all the same.

**One capture box.** Everything is written down in the same place. A link lands in Reading, a
sentence lands in the Inbox, and the box says where it went. It sits in the header of every page.

**One search box.** One query across everything, and each result says what kind of thing it is.
Before anything is typed it lists what was opened lately and every place you can go.

**Today** answers what to move next. Three parts: what is in progress, what is planned for today,
and what is overdue. When one thing is in progress it is the focus of the page; when several are,
they are a list. Overdue work is re-dated in place, without opening anything. Beside it: how much
each project moved this week, and which one has gone quiet.

**Review** steps back a week at a time — what was finished, what was started, what was dropped,
grouped by project. Dropping something is a decision, so it belongs in the account.

**Calendar** is a month at a time, with meetings, deadlines and birthdays in the same squares, and
the lunar day in the corner of each one.

**The workbench** is the front page, and it answers what is in front of you. Every kind of thing
contributes one card. The arrangement is fixed: one person has one taste, and a grid you can drag
around only moves the design decision onto the person using the tool.

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

There are five kinds of thing today and there will be more. Adding one means it takes a row in
Things, takes a captured line, turns up in search, hangs a block on a project page, hands its dates
to the calendar and puts a card on the workbench — without the kinds already there being touched,
and without the header, the rail or the phone's tabs changing.

The other direction holds too: none of those shared surfaces may serve one kind of thing only. A
design that works only because the thing is a task has mistaken a part for the whole.

## Accounts

Sign in with an email and a password. An admin can create accounts and disable them;
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
