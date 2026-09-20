"""
backend/app/integrations/whatsapp/handlers/__init__.py

Message handlers by message type (text, voice, image, etc.).
"""

from .text import handle_text_message
from .voice import handle_voice_message

__all__ = ["handle_text_message", "handle_voice_message"]
