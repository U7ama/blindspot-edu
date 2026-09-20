"""
backend/app/integrations/whatsapp/context.py

Conversation context and multi-turn state management for WhatsApp interactions (STEP 7).
Associates chat history and active learning context with each student identifier.
"""

from __future__ import annotations

import collections
import logging
import time
from typing import Dict, List, Optional
from pydantic import BaseModel, Field

from .config import whatsapp_config

logger = logging.getLogger(__name__)


class ChatMessage(BaseModel):
    """A single turn in the WhatsApp conversation context."""
    role: str = Field(..., description="'user' or 'assistant' or 'system'")
    content: str = Field(..., description="Message text content")
    timestamp: float = Field(default_factory=time.time)


class UserConversationContext:
    """Manages active conversation history and learning context for a single student."""

    def __init__(self, user_identifier: str, max_turns: int = 8, ttl_seconds: int = 3600 * 4):
        self.user_identifier = user_identifier
        self.max_turns = max_turns
        self.ttl_seconds = ttl_seconds
        self.history: List[ChatMessage] = []
        self.last_active: float = time.time()
        self.active_lecture_id: Optional[str] = None
        self.active_session_id: Optional[str] = None

    def add_message(self, role: str, content: str) -> None:
        """Adds a message to the conversation history and prunes old turns."""
        self.last_active = time.time()
        self.history.append(ChatMessage(role=role, content=content))
        # Keep within sliding window (2 * max_turns = user + assistant pairs)
        if len(self.history) > self.max_turns * 2:
            self.history = self.history[-(self.max_turns * 2):]

    def get_messages_for_llm(self) -> List[Dict[str, str]]:
        """Returns the conversation formatted for OpenAI/Groq chat completion APIs."""
        return [{"role": m.role, "content": m.content} for m in self.history]

    def is_expired(self, now: float) -> bool:
        """Checks if conversation context has been idle past TTL."""
        return (now - self.last_active) > self.ttl_seconds

    def clear(self) -> None:
        """Clears conversation history."""
        self.history.clear()


class ConversationManager:
    """Central registry of active student conversations."""

    def __init__(self):
        self._contexts: Dict[str, UserConversationContext] = {}

    def get_context(self, user_identifier: str) -> UserConversationContext:
        """Retrieves or creates the conversation context for a user."""
        now = time.time()
        # Clean expired contexts
        expired = [uid for uid, ctx in self._contexts.items() if ctx.is_expired(now)]
        for uid in expired:
            del self._contexts[uid]

        if user_identifier not in self._contexts:
            self._contexts[user_identifier] = UserConversationContext(
                user_identifier=user_identifier,
                max_turns=whatsapp_config.max_history_turns,
            )
        return self._contexts[user_identifier]

    def add_user_turn(self, user_identifier: str, text: str) -> None:
        ctx = self.get_context(user_identifier)
        ctx.add_message(role="user", content=text)

    def add_assistant_turn(self, user_identifier: str, text: str) -> None:
        ctx = self.get_context(user_identifier)
        ctx.add_message(role="assistant", content=text)

    def clear_context(self, user_identifier: str) -> None:
        if user_identifier in self._contexts:
            self._contexts[user_identifier].clear()


conversation_manager = ConversationManager()
