"use client"

import { ContactItem, ContactWithConversations } from "./contact-item"

interface ContactListProps {
  contacts: ContactWithConversations[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function ContactList({
  contacts,
  selectedId,
  onSelect,
}: ContactListProps) {
  if (contacts.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-zinc-500">
        Nenhum contato com conversas
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {contacts.map((contact) => (
        <ContactItem
          key={contact.id}
          contact={contact}
          isSelected={contact.id === selectedId}
          onClick={() => onSelect(contact.id)}
        />
      ))}
    </div>
  )
}
