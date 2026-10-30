import datetime as dt
from tag_rules import apply_rules, ET

T0 = dt.datetime(2026, 10, 30, 9, 0, tzinfo=ET)
iso = lambda t: t.isoformat()


def story(**kw):
    s = {'published_at': iso(T0), 'tags': ['Local']}; s.update(kw); return s


def test_breaking_kept_within_24h():
    s = apply_rules(story(breaking=True), T0 + dt.timedelta(hours=23, minutes=59))
    assert s['tags'][0] == 'Breaking' and s['breaking']


def test_breaking_removed_after_24h():
    s = apply_rules(story(breaking=True), T0 + dt.timedelta(hours=24))
    assert 'Breaking' not in s['tags'] and s['breaking'] is False and 'Local' in s['tags']


def req(**kw):
    r = {'source': 'Brevard County', 'requested_at': iso(T0), 'deadline': iso(T0 + dt.timedelta(days=1)), 'status': 'open'}
    r.update(kw); return r


def test_developing_while_request_open():
    s = apply_rules(story(comment_requests=[req()]), T0 + dt.timedelta(hours=2))
    assert 'Developing' in s['tags'] and s['comment_notes'] == []


def test_answered_adds_quote_and_removes_developing():
    s = apply_rules(story(comment_requests=[req(status='answered', response='We are reviewing it.')]), T0 + dt.timedelta(hours=3))
    assert 'Developing' not in s['tags']
    assert s['comment_notes'] == ['Brevard County said: "We are reviewing it."']


def test_deadline_passed_unanswered():
    s = apply_rules(story(comment_requests=[req()]), T0 + dt.timedelta(days=1, minutes=1))
    assert 'Developing' not in s['tags'] and s['comment_requests'][0]['status'] == 'unanswered'
    assert s['comment_notes'] == ['Requests for comment were unanswered as of Oct. 31, 2026, 9:00 AM ET.']


def test_declined():
    s = apply_rules(story(comment_requests=[req(status='declined')]), T0)
    assert s['comment_notes'] == ['Brevard County declined to comment.'] and 'Developing' not in s['tags']


def test_one_open_request_keeps_developing():
    s = apply_rules(story(comment_requests=[req(status='declined'), req(source='FDLE')]), T0)
    assert 'Developing' in s['tags'] and s['comment_notes'] == ['Brevard County declined to comment.']


def test_idempotent_rebuild():
    s = story(comment_requests=[req()]); later = T0 + dt.timedelta(days=2)
    apply_rules(s, later); apply_rules(s, later)
    assert len(s['comment_notes']) == 1
