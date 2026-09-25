import html
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


def build_email_content(url: str):
    escaped_url = html.escape(url, quote=True)
    subject = 'Your Blindspot lesson is ready'

    text_body = (
        '======================================================================\n'
        'BLINDSPOT EDU · YOUR ADAPTIVE LESSON IS READY\n'
        '======================================================================\n\n'
        'Hello,\n\n'
        'Your lecture recording has finished processing. Your interactive lesson\n'
        'workspace is now ready with structured lesson phases, foundational\n'
        'prerequisite gap checks, and evidence-linked checkpoints.\n\n'
        'Open your lesson workspace:\n'
        f'{url}\n\n'
        '----------------------------------------------------------------------\n'
        'ACCESS & SECURITY NOTES\n'
        '----------------------------------------------------------------------\n'
        '• Please open this link in the same browser where you uploaded the\n'
        '  recording so your learner session and progress are recognized.\n'
        '• This notification does not grant access to private recordings.\n'
        '  Your uploaded materials and progress remain private to your session.\n\n'
        '----------------------------------------------------------------------\n'
        'You requested this one-time notification in Blindspot Edu.\n'
        'Blindspot Edu · Evidence-Linked Learning\n'
        'https://blindspot-edu.online\n'
        '======================================================================\n'
    )

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Your Blindspot lesson is ready</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f5f7; padding: 32px 16px;">
    <tr>
      <td align="center">
        <!-- Main Container Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); border: 1px solid #e5e7eb;">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #2a1118 0%, #4a1525 100%); background-color: #2a1118; padding: 28px 32px; text-align: left; border-bottom: 2px solid #842b3e;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #e5a7b5; margin-bottom: 4px;">
                      EVIDENCE-LINKED LEARNING
                    </div>
                    <div style="font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em;">
                      Blindspot Edu
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content Body -->
          <tr>
            <td style="padding: 36px 32px 28px 32px;">
              <h1 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 600; color: #111827; line-height: 1.35; letter-spacing: -0.02em;">
                Your adaptive lesson is ready
              </h1>
              
              <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.65; color: #4b5563;">
                Your lecture recording has finished processing. Blindspot has analyzed the lecture, identified foundational prerequisite concepts, and prepared an evidence-linked interactive learning workspace.
              </p>

              <!-- Feature Highlights Box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fdf8f9; border: 1px solid #f3d7df; border-radius: 12px; margin: 0 0 28px 0; padding: 18px 20px;">
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding-bottom: 10px;">
                          <div style="font-size: 13px; font-weight: 600; color: #842b3e;">
                            ✦ Prepared in your workspace:
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size: 13px; line-height: 1.6; color: #4b5563; padding-bottom: 6px;">
                          <strong>• Guided Lesson Phases:</strong> Chronological breakdown of the lecture's core themes.
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size: 13px; line-height: 1.6; color: #4b5563; padding-bottom: 6px;">
                          <strong>• Prerequisite Gap Detection:</strong> Background concepts assumed by the instructor, with diagnostic checks.
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size: 13px; line-height: 1.6; color: #4b5563;">
                          <strong>• Evidence Notebook:</strong> Clickable timestamps linked directly to relevant clips in the original recording.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Primary Action Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 28px 0; text-align: center;">
                <tr>
                  <td align="center">
                    <a href="{escaped_url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #842b3e; color: #ffffff !important; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 12px rgba(132, 43, 62, 0.25); text-align: center;">
                      Open Lesson Workspace &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Direct Link Fallback -->
              <p style="margin: 0 0 24px 0; font-size: 12px; line-height: 1.6; color: #6b7280; text-align: center;">
                If the button above does not work, copy and paste this link into your browser:<br>
                <a href="{escaped_url}" style="color: #842b3e; text-decoration: underline; word-break: break-all; font-family: monospace; font-size: 11px;">{escaped_url}</a>
              </p>

              <!-- Access & Security Notice Box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; margin: 0 0 10px 0;">
                <tr>
                  <td style="font-size: 12px; line-height: 1.6; color: #6b7280;">
                    <div style="margin-bottom: 6px;">
                      <strong style="color: #374151;">🔒 Browser Session Security:</strong> Please open this lesson in the same browser where you uploaded the recording so your learner credentials and progress are recognized.
                    </div>
                    <div>
                      <strong style="color: #374151;">🛡️ Privacy & Access:</strong> This single-use notification does not grant access to private recordings. Your uploaded materials and progress remain private to your session.
                    </div>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 11px; line-height: 1.5; color: #9ca3af;">
                You requested this one-time notification in Blindspot Edu.
              </p>
              <p style="margin: 0; font-size: 11px; color: #9ca3af;">
                &copy; 2026 Blindspot Edu &middot; Evidence-Linked Learning &middot; <a href="https://blindspot-edu.online" style="color: #9ca3af; text-decoration: underline;">blindspot-edu.online</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    return subject, text_body, html_body


def send(email, rid):
    url = os.environ['PUBLIC_APP_URL'].rstrip('/') + '/workspace/' + rid
    subject, text_body, html_body = build_email_content(url)
    raw_from = os.environ['SES_FROM_EMAIL']
    from_address = f'Blindspot Edu <{raw_from}>' if '<' not in raw_from else raw_from
    params = {
        'FromEmailAddress': from_address,
        'Destination': {'ToAddresses': [email]},
        'Content': {'Simple': {
            'Subject': {'Data': subject, 'Charset': 'UTF-8'},
            'Body': {
                'Text': {'Data': text_body, 'Charset': 'UTF-8'},
                'Html': {'Data': html_body, 'Charset': 'UTF-8'},
            }
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
