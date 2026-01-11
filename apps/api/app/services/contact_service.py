"""
Servico de gerenciamento de contatos.

Responsavel por:
- Criar/buscar contatos por email ou outros identificadores
- Gerenciar identities (email, phone, telegram)
- Merge de contatos duplicados
- Vincular conversas a contatos
"""
import logging
from datetime import datetime, timezone
from uuid import uuid4
from typing import Optional

from supabase import Client

logger = logging.getLogger(__name__)


class ContactService:
    """Servico de gerenciamento de contatos."""

    def __init__(self, db: Client, owner_id: str, workspace_id: str):
        self.db = db
        self.owner_id = owner_id
        self.workspace_id = workspace_id

    async def get_or_create_by_email(
        self,
        email: str,
        display_name: Optional[str] = None,
        metadata: Optional[dict] = None
    ) -> dict:
        """
        Busca contato por email. Se nao existir, cria contato + identity.
        Retorna: {"contact": {...}, "identity": {...}, "is_new": bool}
        """
        email_normalized = email.lower().strip()

        # 1. Buscar identity existente com esse email
        identity_result = self.db.table("contact_identities").select(
            "id, contact_id, metadata"
        ).eq("workspace_id", self.workspace_id).eq(
            "type", "email"
        ).eq("value_normalized", email_normalized).execute()

        if identity_result.data:
            identity = identity_result.data[0]

            # Se ja tem contact vinculado, retorna
            if identity.get("contact_id"):
                contact_result = self.db.table("contacts").select("*").eq(
                    "id", identity["contact_id"]
                ).single().execute()
                return {
                    "contact": contact_result.data,
                    "identity": identity,
                    "is_new": False
                }

            # Identity existe mas sem contact - criar contact e vincular
            contact = self._create_contact(display_name or email_normalized, metadata)
            self._link_identity_to_contact(identity["id"], contact["id"])

            return {
                "contact": contact,
                "identity": identity,
                "is_new": True
            }

        # 2. Nao existe - criar identity + contact
        contact = self._create_contact(display_name or email_normalized, metadata)
        identity = self._create_email_identity(email_normalized, contact["id"])

        return {
            "contact": contact,
            "identity": identity,
            "is_new": True
        }

    def _create_contact(self, display_name: str, metadata: Optional[dict] = None) -> dict:
        contact_id = str(uuid4())
        contact_data = {
            "id": contact_id,
            "owner_id": self.owner_id,
            "workspace_id": self.workspace_id,
            "display_name": display_name,
            "lead_stage": "new",
            "metadata": metadata or {}
        }
        result = self.db.table("contacts").insert(contact_data).execute()
        logger.info(f"Contact created: {contact_id} for {display_name}")
        return result.data[0]

    def _create_email_identity(self, email: str, contact_id: str) -> dict:
        identity_id = str(uuid4())
        identity_data = {
            "id": identity_id,
            "owner_id": self.owner_id,
            "workspace_id": self.workspace_id,
            "contact_id": contact_id,
            "type": "email",
            "value": email,
            "metadata": {}
        }
        result = self.db.table("contact_identities").insert(identity_data).execute()
        logger.info(f"Email identity created: {identity_id} for {email}")
        return result.data[0]

    def _link_identity_to_contact(self, identity_id: str, contact_id: str) -> None:
        self.db.table("contact_identities").update({
            "contact_id": contact_id
        }).eq("id", identity_id).execute()
        logger.info(f"Identity {identity_id} linked to contact {contact_id}")

    async def find_by_identity(
        self,
        identity_type: str,
        value: str
    ) -> Optional[dict]:
        """
        Busca contato por qualquer tipo de identity (email, phone, telegram_user)
        """
        value_normalized = value.lower().strip()

        result = self.db.table("contact_identities").select(
            "id, contact_id, contacts(*)"
        ).eq("workspace_id", self.workspace_id).eq(
            "type", identity_type
        ).eq("value_normalized", value_normalized).execute()

        if result.data and result.data[0].get("contacts"):
            return result.data[0]["contacts"]
        return None

    async def merge_contacts(self, target_contact_id: str, source_contact_ids: list[str]) -> dict:
        """
        Merge multiplos contatos em um unico (target).
        Move todas identities e conversations para o target.
        Soft-delete os sources.
        """
        merged_identities = 0
        merged_conversations = 0

        for source_id in source_contact_ids:
            if source_id == target_contact_id:
                continue

            # Mover identities
            identity_result = self.db.table("contact_identities").update({
                "contact_id": target_contact_id
            }).eq("contact_id", source_id).execute()
            merged_identities += len(identity_result.data) if identity_result.data else 0

            # Mover conversations
            conv_result = self.db.table("conversations").update({
                "contact_id": target_contact_id
            }).eq("contact_id", source_id).execute()
            merged_conversations += len(conv_result.data) if conv_result.data else 0

            # Mover deals
            self.db.table("deals").update({
                "contact_id": target_contact_id
            }).eq("contact_id", source_id).execute()

            # Soft delete source contact
            self.db.table("contacts").update({
                "deleted_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", source_id).execute()

            logger.info(f"Contact {source_id} merged into {target_contact_id}")

        return {
            "target_contact_id": target_contact_id,
            "merged_contacts": len(source_contact_ids),
            "merged_identities": merged_identities,
            "merged_conversations": merged_conversations
        }

    async def link_conversation_to_contact(
        self,
        conversation_id: str,
        contact_id: str
    ) -> None:
        """
        Vincula conversa a um contato existente.
        Tambem vincula a identity da conversa ao contato.
        """
        # Buscar primary_identity_id da conversa
        conv_result = self.db.table("conversations").select(
            "primary_identity_id"
        ).eq("id", conversation_id).single().execute()

        if conv_result.data and conv_result.data.get("primary_identity_id"):
            # Vincular identity ao contato
            self._link_identity_to_contact(
                conv_result.data["primary_identity_id"],
                contact_id
            )

        # Atualizar conversa
        self.db.table("conversations").update({
            "contact_id": contact_id
        }).eq("id", conversation_id).execute()

        logger.info(f"Conversation {conversation_id} linked to contact {contact_id}")


def get_contact_service(db: Client, owner_id: str, workspace_id: str) -> ContactService:
    """Factory function para criar ContactService."""
    return ContactService(db=db, owner_id=owner_id, workspace_id=workspace_id)
