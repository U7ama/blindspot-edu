"""Opt-in completion email outbox. Delivery failures never change lesson readiness."""
import logging
import os
import time
from functools import lru_cache
from urllib.parse import urlsplit
import boto3
from botocore.config import Config
from sqlalchemy import text
from backend.app.core.db import SessionLocal
from .models import EmailNotice, Recording

logger = logging.getLogger(__name__)


def enabled():
    url = urlsplit(os.getenv('PUBLIC_APP_URL', ''))
    return (os.getenv('NOTIFICATION_EMAIL_PROVIDER', 'disabled') == 'ses'
            and bool(os.getenv('SES_FROM_EMAIL')) and url.scheme == 'https' and bool(url.hostname)
            and not url.username and not url.password and not url.query and not url.fragment)


@lru_cache(maxsize=1)
def client():
    return boto3.client('sesv2', region_name=os.getenv('SES_REGION') or os.getenv('AWS_REGION'),
                        config=Config(connect_timeout=5, read_timeout=15,
                                      retries={'total_max_attempts': 1, 'mode': 'standard'}))


def send(email, rid):
    url = os.environ['PUBLIC_APP_URL'].rstrip('/') + '/workspace/' + rid
    params = {
        'FromEmailAddress': os.environ['SES_FROM_EMAIL'],
        'Destination': {'ToAddresses': [email]},
        'Content': {'Simple': {
            'Subject': {'Data': 'Your Blindspot lesson is ready', 'Charset': 'UTF-8'},
            'Body': {'Text': {'Data': 'Your recording has finished processing. Open your lesson:\n\n'
                + url + '\n\nUse the same browser where you uploaded the recording. '
                'This notification does not grant access to private recordings.\n'
                'You requested this one-time notification in Blindspot Edu.', 'Charset': 'UTF-8'}}
        }}
    }
    reply_to = os.getenv('SES_REPLY_TO_EMAIL')
    if reply_to:
        params['ReplyToAddresses'] = [reply_to]
    return client().send_email(**params)


def deliver_one():
    if not enabled():
        return False
    with SessionLocal() as db:
        db.execute(text('BEGIN IMMEDIATE'))
        # A crash after the last delivery claim must not leave 'sending' forever.
        db.query(EmailNotice).filter(EmailNotice.status == 'sending',
            EmailNotice.attempts >= 3, EmailNotice.next_attempt <= time.time()).update(
                {'status': 'failed', 'email': ''})
        notice = db.query(EmailNotice).join(Recording, Recording.id == EmailNotice.recording_id).filter(
            Recording.status == 'ready', EmailNotice.attempts < 3,
            EmailNotice.next_attempt <= time.time(),
            EmailNotice.status.in_(('pending', 'sending'))).order_by(EmailNotice.created_at).first()
        if not notice:
            db.commit()
            return False
        rid, email = notice.recording_id, notice.email
        notice.status, notice.next_attempt = 'sending', time.time() + 180
        notice.attempts += 1
        attempt = notice.attempts
        db.commit()
    try:
        send(email, rid)
    except Exception as exc:
        # Service errors are retried by this outbox; omit recipient and provider message.
        logger.warning('Completion email delivery failed (%s)', type(exc).__name__)
        status = 'failed' if attempt >= 3 else 'pending'
    else:
        status = 'sent'
    with SessionLocal() as db:
        db.query(EmailNotice).filter_by(recording_id=rid, attempts=attempt, status='sending').update({
            'status': status, 'next_attempt': time.time() + 60 * attempt,
            **({'email': ''} if status in ('sent', 'failed') else {})
        })
        db.commit()
    return True
