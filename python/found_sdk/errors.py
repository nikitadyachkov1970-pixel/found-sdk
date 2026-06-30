"""Errors raised by found-sdk."""
from __future__ import annotations


class FoundSdkError(Exception):
    """Base class for all found-sdk errors."""


class FoundConfigError(FoundSdkError):
    """Raised when the SDK is misconfigured (e.g. missing API key)."""


class FoundAuthError(FoundSdkError):
    """Raised when an inbound request fails authentication.

    Never carries the provided or expected key in its message.
    """
