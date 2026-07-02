import { notFound } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Citation, ResponseLanguage } from "@/lib/types";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

export type ProfileRecord = {
  id: string;
  full_name: string;
  email: string | null;
  created_at: string;
  updated_at: string;
};

export type FolderRecord = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type ChatRecord = {
  id: string;
  user_id: string;
  folder_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type SavedChatTurn = {
  id: string;
  question: string;
  answer: string;
  citations: Citation[];
  language: ResponseLanguage;
};

type MessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  language: ResponseLanguage;
  position: number;
  created_at: string;
};

type ReferenceRow = {
  message_id: string;
  citation_index: number;
  chunk_id: string | null;
  document_id: string | null;
  document_title: string;
  page_number: number | null;
  chunk_index: number;
  snippet: string;
};

export async function ensureProfile(
  supabase: SupabaseAdmin,
  user: { id: string; email: string | null },
  fullName = "",
) {
  const cleanName = sanitizeName(fullName);
  const { data: existing, error: existingError } = await supabase
    .from("profiles")
    .select("id,full_name,email,created_at,updated_at")
    .eq("id", user.id)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) {
    const { data, error } = await supabase
      .from("profiles")
      .update({
        email: user.email,
        full_name: cleanName || existing.full_name,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .select("id,full_name,email,created_at,updated_at")
      .single();

    if (error) throw error;
    return data as ProfileRecord;
  }

  const { data, error } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      email: user.email,
      full_name: cleanName,
    })
    .select("id,full_name,email,created_at,updated_at")
    .single();

  if (error) throw error;
  return data as ProfileRecord;
}

export async function ensureWorkspace(supabase: SupabaseAdmin, userId: string) {
  let folders = await listFolders(supabase, userId);

  if (folders.length === 0) {
    const { error } = await supabase.from("folders").insert({
      user_id: userId,
      name: "My workspace",
    });

    if (error) throw error;
    folders = await listFolders(supabase, userId);
  }

  let chats = await listChats(supabase, userId);

  if (chats.length === 0 && folders[0]) {
    const { error } = await supabase.from("chats").insert({
      user_id: userId,
      folder_id: folders[0].id,
      title: "New chat",
    });

    if (error) throw error;
    chats = await listChats(supabase, userId);
  }

  return { folders, chats };
}

export async function listFolders(supabase: SupabaseAdmin, userId: string) {
  const { data, error } = await supabase
    .from("folders")
    .select("id,user_id,name,created_at,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as FolderRecord[];
}

export async function listChats(supabase: SupabaseAdmin, userId: string) {
  const { data, error } = await supabase
    .from("chats")
    .select("id,user_id,folder_id,title,created_at,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ChatRecord[];
}

export async function requireOwnedFolder(
  supabase: SupabaseAdmin,
  userId: string,
  folderId: string,
) {
  const { data, error } = await supabase
    .from("folders")
    .select("id,user_id,name,created_at,updated_at")
    .eq("id", folderId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw notFound("Folder not found.");

  return data as FolderRecord;
}

export async function requireOwnedChat(
  supabase: SupabaseAdmin,
  userId: string,
  chatId: string,
) {
  const { data, error } = await supabase
    .from("chats")
    .select("id,user_id,folder_id,title,created_at,updated_at")
    .eq("id", chatId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw notFound("Chat not found.");

  return data as ChatRecord;
}

export async function loadSavedChatTurns(
  supabase: SupabaseAdmin,
  userId: string,
  chatId: string,
) {
  const { data: messages, error: messagesError } = await supabase
    .from("chat_messages")
    .select("id,role,content,language,position,created_at")
    .eq("user_id", userId)
    .eq("chat_id", chatId)
    .order("position", { ascending: true });

  if (messagesError) throw messagesError;

  const { data: references, error: referencesError } = await supabase
    .from("message_references")
    .select(
      "message_id,citation_index,chunk_id,document_id,document_title,page_number,chunk_index,snippet",
    )
    .eq("user_id", userId)
    .eq("chat_id", chatId)
    .order("citation_index", { ascending: true });

  if (referencesError) throw referencesError;

  return pairMessagesToTurns(
    (messages ?? []) as MessageRow[],
    (references ?? []) as ReferenceRow[],
  );
}

export async function saveChatExchange(
  supabase: SupabaseAdmin,
  input: {
    userId: string;
    chat: ChatRecord;
    question: string;
    answer: string;
    language: ResponseLanguage;
    citations: Citation[];
  },
) {
  const position = await getNextMessagePosition(
    supabase,
    input.userId,
    input.chat.id,
  );
  const now = new Date().toISOString();

  const { error: userMessageError } = await supabase
    .from("chat_messages")
    .insert({
      user_id: input.userId,
      chat_id: input.chat.id,
      role: "user",
      content: input.question,
      language: input.language,
      position,
    });

  if (userMessageError) throw userMessageError;

  const { data: assistantMessage, error: assistantMessageError } = await supabase
    .from("chat_messages")
    .insert({
      user_id: input.userId,
      chat_id: input.chat.id,
      role: "assistant",
      content: input.answer,
      language: input.language,
      position: position + 1,
    })
    .select("id")
    .single();

  if (assistantMessageError) throw assistantMessageError;

  if (input.citations.length > 0) {
    const { error: referencesError } = await supabase
      .from("message_references")
      .insert(
        input.citations.map((citation) => ({
          user_id: input.userId,
          chat_id: input.chat.id,
          message_id: assistantMessage.id,
          document_id: citation.documentId,
          chunk_id: citation.chunkId,
          citation_index: citation.index,
          document_title: citation.documentTitle,
          page_number: citation.pageNumber,
          chunk_index: citation.chunkIndex,
          snippet: citation.snippet,
        })),
      );

    if (referencesError) throw referencesError;
  }

  const nextTitle =
    input.chat.title === "New chat" ? createChatTitle(input.question) : input.chat.title;

  const { error: chatUpdateError } = await supabase
    .from("chats")
    .update({
      title: nextTitle,
      updated_at: now,
    })
    .eq("id", input.chat.id)
    .eq("user_id", input.userId);

  if (chatUpdateError) throw chatUpdateError;
}

export function sanitizeWorkspaceName(value: string, fallback: string) {
  const name = value.replace(/\s+/g, " ").trim();
  return name.slice(0, 120) || fallback;
}

export function createChatTitle(question: string) {
  return sanitizeWorkspaceName(question, "New chat").slice(0, 70);
}

async function getNextMessagePosition(
  supabase: SupabaseAdmin,
  userId: string,
  chatId: string,
) {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("position")
    .eq("user_id", userId)
    .eq("chat_id", chatId)
    .order("position", { ascending: false })
    .limit(1);

  if (error) throw error;
  const lastPosition = data?.[0]?.position;

  return typeof lastPosition === "number" ? lastPosition + 1 : 0;
}

function pairMessagesToTurns(messages: MessageRow[], references: ReferenceRow[]) {
  const referencesByMessageId = new Map<string, Citation[]>();

  for (const reference of references) {
    const list = referencesByMessageId.get(reference.message_id) ?? [];
    list.push({
      index: reference.citation_index,
      chunkId: reference.chunk_id ?? "",
      documentId: reference.document_id ?? "",
      documentTitle: reference.document_title,
      pageNumber: reference.page_number,
      chunkIndex: reference.chunk_index,
      snippet: reference.snippet,
    });
    referencesByMessageId.set(reference.message_id, list);
  }

  const turns: SavedChatTurn[] = [];
  let pendingQuestion: MessageRow | null = null;

  for (const message of messages) {
    if (message.role === "user") {
      pendingQuestion = message;
      continue;
    }

    if (!pendingQuestion) continue;

    turns.push({
      id: message.id,
      question: pendingQuestion.content,
      answer: message.content,
      citations: referencesByMessageId.get(message.id) ?? [],
      language: message.language,
    });
    pendingQuestion = null;
  }

  return turns;
}

function sanitizeName(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 120);
}
