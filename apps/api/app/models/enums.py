from enum import Enum


class ChannelType(str, Enum):
    telegram = "telegram"
    email = "email"
    openphone_sms = "openphone_sms"


class MessageDirection(str, Enum):
    inbound = "inbound"
    outbound = "outbound"


class ConversationStatus(str, Enum):
    open = "open"
    pending = "pending"
    resolved = "resolved"


class IdentityType(str, Enum):
    telegram_user = "telegram_user"
    email = "email"
    phone = "phone"


class IntegrationType(str, Enum):
    telegram_user = "telegram_user"
    email_imap_smtp = "email_imap_smtp"
    openphone = "openphone"


class MessageEventType(str, Enum):
    queued = "queued"
    sent = "sent"
    delivered = "delivered"
    read = "read"
    failed = "failed"
    edited = "edited"
    deleted = "deleted"


class LogLevel(str, Enum):
    debug = "debug"
    info = "info"
    warn = "warn"
    error = "error"


class AISuggestionType(str, Enum):
    reply_suggestion = "reply_suggestion"
    summary = "summary"
    tag_suggestion = "tag_suggestion"
    next_step = "next_step"


class AIFeedbackAction(str, Enum):
    accepted = "accepted"
    rejected = "rejected"
    edited = "edited"


class PromptType(str, Enum):
    reply_suggestion = "reply_suggestion"
    summary = "summary"
    translation = "translation"
    language_detection = "language_detection"


class WorkerType(str, Enum):
    telegram = "telegram"
    email = "email"


# ============================================
# CRM Enums
# ============================================
class CustomFieldType(str, Enum):
    text = "text"
    number = "number"
    currency = "currency"
    date = "date"
    datetime = "datetime"
    select = "select"
    multiselect = "multiselect"
    checkbox = "checkbox"
    file = "file"
    link = "link"
    email = "email"
    phone = "phone"


class DealActivityType(str, Enum):
    note = "note"
    task = "task"
    stage_change = "stage_change"
    field_change = "field_change"
    message_link = "message_link"
    created = "created"


class AutomationTriggerType(str, Enum):
    message_received = "message_received"
    message_sent = "message_sent"
    stage_changed = "stage_changed"
    time_in_stage = "time_in_stage"
    field_changed = "field_changed"
    deal_created = "deal_created"


class AutomationActionType(str, Enum):
    move_stage = "move_stage"
    update_field = "update_field"
    create_task = "create_task"
    send_notification = "send_notification"
    add_tag = "add_tag"
    send_message = "send_message"


class AutomationExecutionStatus(str, Enum):
    success = "success"
    failed = "failed"
