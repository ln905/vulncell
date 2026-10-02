import { Link } from 'react-router-dom';
import { StaffBadge, StateBadge } from './badges';
import Avatar from './Avatar';
import Markdown from './Markdown';
import { formatUtc } from '../lib/format';
import { isDisclosed } from '../lib/stateMachine';

// Màu chấm trên timeline: update state = xanh da trời, award = xanh lá
export function eventDotClass(type) {
  switch (type) {
    case 'STATE_CHANGE':
      return 'bg-sky-400';
    case 'BOUNTY':
      return 'bg-emerald-500';
    case 'SUBMITTED':
      return 'bg-zinc-200';
    default:
      return 'bg-zinc-500';
  }
}

function UserLink({ username, role }) {
  if (!username) return <span className="text-zinc-300">unknown</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Avatar username={username} sizeClass="h-5 w-5" />
      <Link to={`/u/${username}`} className="font-semibold text-zinc-200 hover:text-gold-300">
        {username}
      </Link>
      {role === 'ADMIN' ? <StaffBadge /> : null}
    </span>
  );
}

export default function TimelineBlock({ event, report }) {
  const actor = event.actor;

  let headline = null;
  let body = null;

  if (event.type === 'SUBMITTED') {
    headline = (
      <>
        <UserLink username={actor?.username} role={actor?.role} /> submitted a report
      </>
    );
    body = event.content;
  } else if (event.type === 'COMMENT') {
    headline = (
      <>
        <UserLink username={actor?.username} role={actor?.role} /> posted a comment
      </>
    );
    body = event.content;
  } else if (event.type === 'STATE_CHANGE') {
    headline = (
      <>
        <UserLink username={actor?.username} role={actor?.role} />{' '}
        {isDisclosed(event.toState) ? 'closed the report and changed the status to' : 'changed the status to'}{' '}
        <StateBadge value={event.toState} />
      </>
    );
    body = event.content;
  } else if (event.type === 'BOUNTY') {
    headline = (
      <>
        <UserLink username={actor?.username} role={actor?.role} /> rewarded{' '}
        <UserLink username={report?.reporter?.username} role={report?.reporter?.role} /> with a{' '}
        <span className="font-semibold text-emerald-400">${Number(event.bountyAmount).toLocaleString('en-US')}</span> bounty
      </>
    );
  } else {
    headline = <>{event.type}</>;
  }

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
        <span className="flex flex-wrap items-center gap-1.5">{headline}</span>
        <span className="text-zinc-500">{formatUtc(event.createdAt)}</span>
      </div>

      {body ? (
        <div className="mt-3 border-t border-zinc-800 pt-3">
          <Markdown>{body}</Markdown>
        </div>
      ) : null}
    </div>
  );
}
