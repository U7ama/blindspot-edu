"""
backend/app/integrations/whatsapp

WhatsApp Business Channel Adapter for Blindspot Edu via Zernio provider.
"""

from .config import whatsapp_config
from .schemas import MessageType, NormalizedMessage, OutgoingMessage
from .provider import zernio_provider, ZernioProvider

__all__ = [
    "whatsapp_config",
    "MessageType",
    "NormalizedMessage",
    "OutgoingMessage",
    "zernio_provider",
    "ZernioProvider",
]
