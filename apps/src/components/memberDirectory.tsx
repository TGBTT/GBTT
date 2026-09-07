import type { LiveMember } from '@gbtt/shared/studio/firebase/liveMembers'

/** The letter a member files under. Anything not A–Z files under '#'. */
export function initialOf(member: LiveMember): string {
  const first = member.name.trim().charAt(0).toUpperCase()
  return first >= 'A' && first <= 'Z' ? first : '#'
}

/** Name or email, so a half-remembered address finds someone too. */
export function matchesQuery(member: LiveMember, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return member.name.toLowerCase().includes(q) || member.email.toLowerCase().includes(q)
}

/**
 * The initials present in a list, in alphabetical order.
 *
 * Built from what is actually there rather than a fixed A–Z: a letter nobody
 * files under is a button that can only ever empty the list.
 */
export function initialsOf(members: LiveMember[]): string[] {
  return [...new Set(members.map(initialOf))].sort()
}

export function compareMembersByName(a: LiveMember, b: LiveMember): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

/** A–Z narrowing for an already alphabetical list. */
export function AlphabetFilter({
  members,
  active,
  onChange,
}: {
  members: LiveMember[]
  active: string
  onChange: (letter: string) => void
}) {
  const letters = initialsOf(members)
  if (letters.length < 2) return null

  return (
    <div className="alpha-filter" role="group" aria-label="Filter by first letter">
      <button
        type="button"
        className={`chip${active ? '' : ' selected'}`}
        onClick={() => onChange('')}
      >
        All
      </button>
      {letters.map((letter) => (
        <button
          key={letter}
          type="button"
          className={`chip${active === letter ? ' selected' : ''}`}
          aria-pressed={active === letter}
          // Tapping the active letter again clears it, so narrowing never
          // becomes a dead end that needs the All button to escape.
          onClick={() => onChange(active === letter ? '' : letter)}
        >
          {letter}
        </button>
      ))}
    </div>
  )
}
