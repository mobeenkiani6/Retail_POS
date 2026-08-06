"""Shared helpers for admin routes."""
from datetime import datetime, timedelta, time
from flask import request


def parse_branch_id():
    """Optional branch filter for HQ queries (None = all branches)."""
    raw = (request.args.get('branch_id') or '').strip()
    return raw or None


def period_bounds(period='today', tz_offset_hours=5, start_date=None, end_date=None):
    """Return (start, end) UTC datetimes for common periods or a custom range.

    start_date / end_date: 'YYYY-MM-DD' strings (local calendar days when period=custom).
    """
    now = datetime.utcnow()
    tz = timedelta(hours=tz_offset_hours)
    local_now = now + tz
    local_date = local_now.date()

    if period == 'custom' and start_date and end_date:
        try:
            d0 = datetime.strptime(str(start_date)[:10], '%Y-%m-%d').date()
            d1 = datetime.strptime(str(end_date)[:10], '%Y-%m-%d').date()
            if d1 < d0:
                d0, d1 = d1, d0
            start_local = datetime.combine(d0, time.min)
            end_local = datetime.combine(d1, time.max)
            return start_local - tz, end_local - tz
        except ValueError:
            pass

    if period == 'today':
        start_local = datetime.combine(local_date, time.min)
        end_local = datetime.combine(local_date, time.max)
    elif period == 'week':
        start_local = datetime.combine(local_date - timedelta(days=local_date.weekday()), time.min)
        end_local = datetime.combine(local_date, time.max)
    elif period == 'month':
        start_local = datetime.combine(local_date.replace(day=1), time.min)
        end_local = datetime.combine(local_date, time.max)
    elif period == 'year':
        start_local = datetime.combine(local_date.replace(month=1, day=1), time.min)
        end_local = datetime.combine(local_date, time.max)
    elif period == 'quarter':
        q_month = ((local_date.month - 1) // 3) * 3 + 1
        start_local = datetime.combine(local_date.replace(month=q_month, day=1), time.min)
        end_local = datetime.combine(local_date, time.max)
    else:
        start_local = datetime.combine(local_date, time.min)
        end_local = datetime.combine(local_date, time.max)

    return start_local - tz, end_local - tz


def apply_branch_filter(query, model, branch_id):
    if branch_id and hasattr(model, 'branch_id'):
        return query.filter(model.branch_id == branch_id)
    return query
