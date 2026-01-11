# Enums
from .enums import (
    ChannelType,
    MessageDirection,
    ConversationStatus,
    IdentityType,
    IntegrationType,
    MessageEventType,
    LogLevel,
    AISuggestionType,
    AIFeedbackAction,
    PromptType,
    WorkerType,
)

# Base
from .base import BaseSchema, TimestampMixin, SoftDeleteMixin

# Contacts
from .contacts import (
    ContactIdentity,
    ContactIdentityCreate,
    ContactIdentityUpdate,
    Contact,
    ContactCreate,
    ContactUpdate,
    ContactWithIdentities,
    LinkIdentityRequest,
    UnlinkIdentityRequest,
    LinkByEmailRequest,
    LinkByEmailResponse,
)

# Conversations
from .conversations import (
    Conversation,
    ConversationUpdate,
    ConversationWithDetails,
    ConversationListQuery,
    MergeConversationRequest,
)

# Messages
from .messages import (
    Message,
    MessageSendRequest,
    MessageWithAttachments,
    MessageEvent,
    MessageListQuery,
)

# Attachments
from .attachments import (
    Attachment,
    SignUploadRequest,
    SignUploadResponse,
    SignDownloadRequest,
    SignDownloadResponse,
)

# Tags
from .tags import Tag, TagCreate, TagUpdate, AddTagRequest

# Templates
from .templates import Template, TemplateCreate, TemplateUpdate

# Integrations
from .integrations import (
    Integration,
    IntegrationCreate,
    IntegrationUpdate,
    TelegramStartAuthRequest,
    TelegramStartAuthResponse,
    TelegramVerifyCodeRequest,
    TelegramVerifyCodeResponse,
    TelegramVerify2FARequest,
    TelegramVerify2FAResponse,
    WorkerHeartbeat,
    WorkerStatusItem,
    WorkersStatusResponse,
)

# AI
from .ai import (
    SuggestReplyRequest,
    SuggestReplyResponse,
    SummarizeRequest,
    SummarizeResponse,
    AIFeedbackRequest,
    AISuggestion,
    AIFeedback,
    ConversationSummary,
    Prompt,
    PromptUpdate,
    PromptVersionList,
)

# Translations
from .translations import (
    TranslateMessageRequest,
    TranslateConversationRequest,
    MessageTranslation,
    TranslateMessageResponse,
    TranslateConversationResponse,
)

# Logs
from .logs import (
    AppLog,
    LogListQuery,
    IntegrationEvent,
    ExportRequest,
    ExportStatus,
)

__all__ = [
    # Enums
    "ChannelType",
    "MessageDirection",
    "ConversationStatus",
    "IdentityType",
    "IntegrationType",
    "MessageEventType",
    "LogLevel",
    "AISuggestionType",
    "AIFeedbackAction",
    "PromptType",
    "WorkerType",
    # Base
    "BaseSchema",
    "TimestampMixin",
    "SoftDeleteMixin",
    # Contacts
    "ContactIdentity",
    "ContactIdentityCreate",
    "ContactIdentityUpdate",
    "Contact",
    "ContactCreate",
    "ContactUpdate",
    "ContactWithIdentities",
    "LinkIdentityRequest",
    "UnlinkIdentityRequest",
    "LinkByEmailRequest",
    "LinkByEmailResponse",
    # Conversations
    "Conversation",
    "ConversationUpdate",
    "ConversationWithDetails",
    "ConversationListQuery",
    "MergeConversationRequest",
    # Messages
    "Message",
    "MessageSendRequest",
    "MessageWithAttachments",
    "MessageEvent",
    "MessageListQuery",
    # Attachments
    "Attachment",
    "SignUploadRequest",
    "SignUploadResponse",
    "SignDownloadRequest",
    "SignDownloadResponse",
    # Tags
    "Tag",
    "TagCreate",
    "TagUpdate",
    "AddTagRequest",
    # Templates
    "Template",
    "TemplateCreate",
    "TemplateUpdate",
    # Integrations
    "Integration",
    "IntegrationCreate",
    "IntegrationUpdate",
    "TelegramStartAuthRequest",
    "TelegramStartAuthResponse",
    "TelegramVerifyCodeRequest",
    "TelegramVerifyCodeResponse",
    "TelegramVerify2FARequest",
    "TelegramVerify2FAResponse",
    "WorkerHeartbeat",
    "WorkerStatusItem",
    "WorkersStatusResponse",
    # AI
    "SuggestReplyRequest",
    "SuggestReplyResponse",
    "SummarizeRequest",
    "SummarizeResponse",
    "AIFeedbackRequest",
    "AISuggestion",
    "AIFeedback",
    "ConversationSummary",
    "Prompt",
    "PromptUpdate",
    "PromptVersionList",
    # Translations
    "TranslateMessageRequest",
    "TranslateConversationRequest",
    "MessageTranslation",
    "TranslateMessageResponse",
    "TranslateConversationResponse",
    # Logs
    "AppLog",
    "LogListQuery",
    "IntegrationEvent",
    "ExportRequest",
    "ExportStatus",
]
