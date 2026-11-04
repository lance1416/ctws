import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BUILD } from '../../platform/build/build'
import { BUTTON, GATED, ICON_BUTTON } from '../../platform/ui/buttonStyles'
import {
  GitHubIcon,
  KIND_ICON,
  KeyboardIcon,
  NewIcon,
  OnePersonIcon,
  OwnServerIcon,
  PLACE_ICON,
  type IconComponent,
  type Kind,
} from '../../platform/ui/icons'
import { KIND_TINT, KIND_TEXT } from '../../platform/ui/kinds'
import { ThemeSwitch, useShownScheme } from '../../platform/ui/ThemeSwitch'
import { DEPLOY_GUIDE, SignUpsClosed, useRegistrationOpen } from '../auth'

const REPOSITORY = 'https://github.com/lance1416/ctws'
const LICENCE = `${REPOSITORY}/blob/main/LICENSE`

/**
 * From 1024 up each section is one screen under the header, laid out its own way on one twelve
 * column grid; below that the page is one column with the phone's own screens.
 */
const SCREEN =
  'border-b border-line px-4 py-12 lg:relative lg:h-[calc(100dvh-3rem)] lg:min-h-[720px] lg:snap-start lg:overflow-hidden lg:px-16 lg:py-0'
/** The page's one line, then each section's: on the desk both take the largest step there is. */
const TITLE = 'text-title lg:text-hero'
const HEADING = 'text-subject lg:text-hero'
const PROSE = 'text-prose text-muted'
/** A screenshot is a window: panel ground, a line, the container's radius; a phone's is rounder. */
const WINDOW = 'overflow-hidden rounded-phone border border-line bg-panel lg:rounded-container'
/** A window that rises from the bottom edge of its screen, cut there. */
const RISING = 'lg:min-h-0 lg:flex-1 lg:rounded-b-none lg:border-b-0'
/**
 * The workbench sits on the bottom edge instead: shorter than the room left, the room goes above it,
 * where an empty frame would otherwise hang under it.
 */
const CUT = 'lg:rounded-b-none lg:border-b-0'
/** A window that runs off one side of the screen. */
const FILLED = 'lg:h-full lg:w-full lg:object-cover'

/** Who is not signed in sees this at `/`: what CTWS is, and the way in. */
export function Landing() {
  const scheme = useShownScheme()
  const open = useRegistrationOpen()
  const shot = (name: string) => `/landing/${name}-${scheme}.webp`
  useSnapToSections()

  return (
    <div className="min-h-dvh bg-ground text-ink">
      <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-line bg-chrome px-4 lg:px-6">
        <Mark />
        <ThemeSwitch />
        <a
          href={REPOSITORY}
          aria-label="CTWS on GitHub"
          title="CTWS on GitHub"
          className={ICON_BUTTON}
        >
          <GitHubIcon aria-hidden="true" />
        </a>
        <Link to="/login" className={BUTTON.primary}>
          Sign in
        </Link>
      </header>

      <main>
        <section
          className={`${SCREEN} pt-10 lg:flex lg:flex-col lg:items-center lg:pt-[min(12vh,128px)] lg:text-center`}
        >
          <h1 className={TITLE}>
            One place for your work, your life
            <br className="max-lg:hidden" /> and the things you think of.
          </h1>
          <p className={`${PROSE} mt-3 lg:mt-5 lg:max-w-[620px]`}>
            CTWS is a personal hub for someone running several things at once. Projects, tasks,
            people, organisations, meetings, messages, reading and notes go in one place, and once
            they are in, they know about each other.
          </p>
          <WayIn open={open} id="landing-closed" centred />
          <div aria-hidden="true" className="lg:h-[min(8vh,80px)] lg:shrink-0" />
          <Shot
            desk={shot('workbench')}
            phone={shot('phone-workbench')}
            alt="The workbench: what is running, the next meetings, who to answer, what to launch"
            className={`mt-8 lg:mt-auto lg:w-full lg:max-w-[1800px] lg:shrink-0 ${CUT}`}
            eager
          />
        </section>

        <section className={`${SCREEN} lg:flex lg:flex-col lg:pt-[min(10vh,112px)]`}>
          <div className="lg:grid lg:grid-cols-12 lg:items-end lg:gap-x-8">
            <div className="lg:col-span-6">
              <KindMark tint="task" Icon={PLACE_ICON.today} label="Today" />
              <h2 className={HEADING}>Start the day knowing what to move next.</h2>
            </div>
            <p className={`${PROSE} mt-3 lg:col-span-5 lg:col-start-8 lg:mt-0`}>
              What is in progress, what is planned, what is overdue, which messages are due a
              follow-up and what is ready to start. Overdue work is re-dated where it stands,
              without opening anything.
            </p>
          </div>
          <Shot
            desk={shot('today')}
            phone={shot('phone-today')}
            alt="Today"
            className={`mt-6 lg:mt-16 ${RISING}`}
          />
        </section>

        {/* Words in a third, the page running off the right edge. */}
        <section className={`${SCREEN} lg:grid lg:grid-cols-12 lg:items-center lg:gap-x-8 lg:pr-0`}>
          <Blurb
            className="lg:col-span-4"
            mark={<KindMark tint="project" Icon={KIND_ICON.project} label="Projects" />}
            title="A project holds everything that belongs to it."
          >
            Its tasks, meetings, people, organisations, messages and reading sit on one page. Read
            the tasks as a tree, or as a board by status or by stage.
          </Blurb>
          <Shot
            desk={shot('project')}
            phone={shot('phone-project')}
            alt="The Job hunt project as a board by stage"
            className="mt-6 lg:col-span-8 lg:col-start-5 lg:mt-0 lg:h-[78%] lg:rounded-r-none lg:border-r-0"
            imgClassName={`${FILLED} lg:object-left-top`}
          />
        </section>

        {/* The two panels on their own, as they float over any page, stepped so neither covers the other. */}
        <section className={`${SCREEN} lg:grid lg:grid-cols-12 lg:content-center lg:gap-x-8`}>
          <Blurb
            className="lg:col-span-4 lg:self-center"
            mark={<KindMark tint="communication" Icon={NewIcon} label="Capture and search" />}
            title="Write it down from any page."
          >
            Press C. A link becomes reading, a sentence becomes a task in the Inbox, and the box
            says where it went. One search covers everything, and every result says what kind of
            thing it is.
          </Blurb>
          <div className="lg:relative lg:col-span-8 lg:col-start-5 lg:h-[min(70vh,860px)]">
            <Panel
              src={shot('search')}
              alt="Search results for stripe"
              className="max-lg:hidden lg:absolute lg:top-0 lg:right-0 lg:w-[63%]"
            />
            <Panel
              src={shot('capture')}
              alt="The capture box with a link in it"
              className="mt-6 lg:absolute lg:bottom-0 lg:left-0 lg:mt-0 lg:w-[35%]"
            />
          </div>
        </section>

        {/* The other way about: the page comes in from the left edge. */}
        <section className={`${SCREEN} lg:grid lg:grid-cols-12 lg:items-center lg:gap-x-8 lg:pl-0`}>
          <Blurb
            className="lg:col-span-4 lg:col-start-9 lg:row-start-1"
            mark={<KindMark tint="person" Icon={KIND_ICON.person} label="People" />}
            title="People, as you actually know them."
          >
            Ways to reach someone carry labels of your own. A birthday is entered once, solar or
            lunar, and both calendars follow. Log a message you sent and it waits for the reply; if
            nothing has come back by the follow-up day, it turns up in Today.
          </Blurb>
          <Shot
            desk={shot('person')}
            phone={shot('phone-person')}
            alt="Mira Chen's page"
            className="mt-6 lg:col-span-8 lg:col-start-1 lg:row-start-1 lg:mt-0 lg:h-[78%] lg:rounded-l-none lg:border-l-0"
            imgClassName={`${FILLED} lg:object-right-top`}
          />
        </section>

        {/* The note on the desk, and the same note on a phone in front of it. */}
        <section
          className={`${SCREEN} lg:grid lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:gap-x-8 lg:pt-[min(10vh,112px)]`}
        >
          <Blurb
            className="lg:col-span-4"
            mark={<KindMark tint="note" Icon={KIND_ICON.note} label="Notes" />}
            title="Notes in Markdown, with Vim keys if you want them."
          >
            Markdown, shown as it will read: tables, code, maths and boxes you tick by clicking.
            Type @ to mention anything, and its page shows the sentence that mentioned it.
          </Blurb>
          <Shot
            desk={shot('note')}
            phone={shot('phone-note')}
            alt="A note being written"
            className={`mt-6 lg:col-span-8 lg:col-start-5 lg:row-span-2 lg:row-start-1 lg:mt-0 ${RISING}`}
            imgClassName={`${FILLED} lg:object-left-top`}
          />
          <figure
            className="z-[1] overflow-hidden rounded-phone shadow-float max-lg:hidden lg:absolute lg:-bottom-30 lg:w-[min(340px,30vh)]"
            // Its left edge sits 160 into the fourth column's end, so it overlaps the desk's corner.
            style={{ left: 'calc(4rem + 4 * ((100% - 30rem) / 12 + 2rem) - 10rem)' }}
          >
            <img
              src={shot('phone-note')}
              alt="The same note on a phone"
              loading="lazy"
              className="block w-full"
            />
          </figure>
        </section>

        <section
          className={`${SCREEN} border-b-0 pb-0 lg:flex lg:flex-col lg:items-center lg:justify-center lg:pb-[72px] lg:text-center`}
        >
          <h2 className={HEADING}>Built for one person.</h2>
          <WayIn open={open} id="landing-closed-end" centred />
          <ul
            aria-label="What it holds"
            className="mt-8 flex flex-wrap gap-2 lg:mt-[min(9vh,96px)] lg:justify-center lg:gap-3"
          >
            {KINDS.map(([kind, label]) => {
              const Icon = KIND_ICON[kind]
              return (
                <li
                  key={kind}
                  className="flex h-9 items-center gap-2 rounded-container border border-line bg-panel pr-3 pl-1 text-ui font-medium lg:h-11 lg:gap-2.5 lg:pr-4 lg:pl-2"
                >
                  <span
                    className={`grid size-7 place-items-center rounded-control ${KIND_TINT[kind]} ${KIND_TEXT[kind]}`}
                  >
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  {label}
                </li>
              )
            })}
          </ul>
          <div className="lg:mt-[min(6vh,64px)] lg:grid lg:w-full lg:max-w-[1400px] lg:grid-cols-3 lg:gap-6 lg:text-left">
            <Reason Icon={OnePersonIcon} title="No teams">
              Nobody to assign to, notify or wait on. Everything in it is yours.
            </Reason>
            <Reason Icon={OwnServerIcon} title="Your own server">
              It runs from one Docker image, and your data stays where you put it.
            </Reason>
            <Reason Icon={KeyboardIcon} title="Every page from the keyboard">
              Every key is listed in one place, and the theme follows yours, light or dark.
            </Reason>
          </div>
          <footer className="-mx-4 mt-12 border-t border-line bg-chrome lg:absolute lg:inset-x-0 lg:bottom-0 lg:mx-0 lg:mt-0">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-5 text-ui lg:flex-nowrap lg:gap-6 lg:px-16">
              <span className="flex items-center gap-2.5 max-lg:w-full lg:mr-auto">
                <MarkTile />
                <span className="font-medium">CTWS</span>
              </span>
              <Link to="/login" className="text-muted hover:text-ink">
                Sign in
              </Link>
              <a href={REPOSITORY} className="text-muted hover:text-ink">
                GitHub
              </a>
              <a href={DEPLOY_GUIDE} className="text-muted hover:text-ink">
                Deploy guide
              </a>
              <a href={LICENCE} className="text-muted hover:text-ink">
                MIT licence
              </a>
              <span className="font-mono text-meta text-muted">{BUILD.version}</span>
            </div>
          </footer>
        </section>
      </main>
    </div>
  )
}

/**
 * The document scrolls, not a box inside it, so a phone's address bar folds away as it would on
 * any page; on the desk it settles at a section's top, below the header, when a scroll ends near one.
 */
const SNAP = ['scroll-pt-12', 'lg:snap-y', 'lg:snap-proximity']
function useSnapToSections() {
  useEffect(() => {
    const root = document.documentElement
    root.classList.add(...SNAP)
    return () => root.classList.remove(...SNAP)
  }, [])
}

const KINDS: [Kind, string][] = [
  ['project', 'Projects'],
  ['task', 'Tasks'],
  ['person', 'People'],
  ['organisation', 'Organisations'],
  ['meeting', 'Meetings'],
  ['communication', 'Communication'],
  ['reading', 'Reading'],
  ['note', 'Notes'],
]

function MarkTile() {
  return (
    <span className="inline-grid size-7 place-items-center rounded-control bg-ink text-meta font-medium text-on-ink">
      CT
    </span>
  )
}

function Mark() {
  return (
    <span className="mr-auto flex items-center gap-2.5">
      <MarkTile />
      <span className="text-ui font-medium">CTWS</span>
    </span>
  )
}

/** Sign in, and Create an account, greyed with the reason under it while sign-ups are closed. */
function WayIn({ open, id, centred }: { open: boolean; id: string; centred?: boolean }) {
  return (
    <>
      <div className={`mt-6 flex gap-3 lg:mt-8 ${centred ? 'lg:justify-center' : ''}`}>
        <Link to="/login" className={`${BUTTON.primary} justify-center max-lg:flex-1`}>
          Sign in
        </Link>
        {open ? (
          <Link to="/login" className={`${BUTTON.secondary} justify-center max-lg:flex-1`}>
            Create an account
          </Link>
        ) : (
          <button
            type="button"
            aria-disabled="true"
            aria-describedby={id}
            className={`${BUTTON.secondary} ${GATED} justify-center max-lg:flex-1`}
          >
            Create an account
          </button>
        )}
      </div>
      {!open && <SignUpsClosed id={id} className="mt-3" />}
    </>
  )
}

/** What the section is about: its kind's tinted icon and name, as a block's head wears it. */
function KindMark({ tint, Icon, label }: { tint: Kind; Icon: IconComponent; label: string }) {
  return (
    <div className="mb-3 flex items-center gap-2.5 text-ui font-medium lg:mb-4">
      <span
        className={`grid size-7 place-items-center rounded-control ${KIND_TINT[tint]} ${KIND_TEXT[tint]}`}
      >
        <Icon size={16} aria-hidden="true" />
      </span>
      {label}
    </div>
  )
}

function Blurb({
  mark,
  title,
  children,
  className,
}: {
  mark: ReactNode
  title: string
  children: ReactNode
  className: string
}) {
  return (
    <div className={className}>
      {mark}
      <h2 className={HEADING}>{title}</h2>
      <p className={`${PROSE} mt-3 lg:mt-4 lg:max-w-[520px]`}>{children}</p>
    </div>
  )
}

/** A page of the app: the desk's screenshot, and the phone's below 1024. */
function Shot({
  desk,
  phone,
  alt,
  className,
  imgClassName = '',
  eager,
}: {
  desk: string
  phone: string
  alt: string
  className: string
  imgClassName?: string
  eager?: boolean
}) {
  return (
    <figure className={`${WINDOW} max-lg:max-h-[620px] ${className}`}>
      <picture>
        <source media="(max-width: 1023px)" srcSet={phone} />
        <img
          src={desk}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          className={`block w-full ${imgClassName}`}
        />
      </picture>
    </figure>
  )
}

/** A floating panel, shown as it floats: no frame of its own but the float's shadow. */
function Panel({ src, alt, className }: { src: string; alt: string; className: string }) {
  return (
    <figure className={`overflow-hidden rounded-container bg-float shadow-float ${className}`}>
      <img src={src} alt={alt} loading="lazy" className="block w-full" />
    </figure>
  )
}

function Reason({
  Icon,
  title,
  children,
}: {
  Icon: IconComponent
  title: string
  children: ReactNode
}) {
  return (
    <div className="mt-7 lg:mt-0 lg:rounded-container lg:border lg:border-line lg:bg-panel lg:px-8 lg:pt-7 lg:pb-8">
      <Icon size={20} aria-hidden="true" className="text-muted" />
      <h3 className="mt-3 text-subject lg:mt-4">{title}</h3>
      <p className={`${PROSE} mt-2`}>{children}</p>
    </div>
  )
}
