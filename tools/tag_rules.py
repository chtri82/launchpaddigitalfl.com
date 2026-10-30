"""Story tag rules applied on every (daily) rebuild.

Story metadata fields (all optional):
  breaking: bool, published_at: ISO time
  comment_requests: list of {"source": str, "requested_at": ISO, "deadline": ISO,
                             "status": "open"|"answered"|"declined"|"unanswered",
                             "response": str (exact quote, when answered), "answered_at": ISO}
Rules:
  * Breaking tag is removed 24 hours after published_at.
  * Developing tag stays while any comment request is open and its deadline has not passed.
  * Answered: the response is appended to the story update text and Developing is removed.
  * Deadline passed with no answer: status becomes "unanswered" and the line
    "Requests for comment were unanswered as of <deadline>." is added; "declined" adds
    "<source> declined to comment." Developing is then removed.
"""
import datetime as dt
from zoneinfo import ZoneInfo

ET = ZoneInfo('America/New_York')
BREAKING_HOURS = 24


def parse(s):
    t = dt.datetime.fromisoformat(s)
    return t if t.tzinfo else t.replace(tzinfo=ET)


def fmt_et(t):
    t = t.astimezone(ET)
    return f"{t.strftime('%b')}. {t.day}, {t.year}, {t.strftime('%I:%M %p').lstrip('0')} ET"


def apply_rules(story, now):
    """Mutates and returns story. Sets story['tags'] (list) and story['comment_notes'] (list of lines)."""
    tags = [t for t in story.get('tags', []) if t not in ('Breaking', 'Developing')]
    notes = story.setdefault('comment_notes', [])
    if story.get('breaking') and story.get('published_at'):
        if now < parse(story['published_at']) + dt.timedelta(hours=BREAKING_HOURS):
            tags.insert(0, 'Breaking')
        else:
            story['breaking'] = False
    developing = False
    for r in story.get('comment_requests', []):
        st = r.get('status', 'open')
        if st == 'open' and r.get('deadline') and now >= parse(r['deadline']):
            st = r['status'] = 'unanswered'
        if st == 'open':
            developing = True
            continue
        if st == 'answered' and r.get('response'):
            line = f'{r["source"]} said: "{r["response"]}"'
        elif st == 'declined':
            line = f'{r["source"]} declined to comment.'
        elif st == 'unanswered':
            line = f'Requests for comment were unanswered as of {fmt_et(parse(r["deadline"]))}.'
        else:
            continue
        if line not in notes:
            notes.append(line)
    if developing:
        tags.append('Developing')
    story['tags'] = tags
    story['developing'] = developing
    return story
