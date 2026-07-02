"use client";

import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Database,
  FileText,
  Folder,
  FolderPlus,
  LogIn,
  LogOut,
  Loader2,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Quote,
  Search,
  Send,
  Sparkles,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import {
  ClipboardEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { LOCALIZED_CHAT_MESSAGES } from "@/lib/constants";
import { detectResponseLanguage } from "@/lib/language";
import type { ResponseLanguage } from "@/lib/types";
import { cn, formatBytes } from "@/lib/utils";

const SESSION_STORAGE_KEY = "answerdocs.sessionId";
const CHAT_HISTORY_TURN_LIMIT = 6;
const COPY_FEEDBACK_TIMEOUT_MS = 1_600;
const PASTED_CONTEXT_MIN_CHARACTERS = 350;
const PASTED_CONTEXT_MIN_LINES = 3;
const SIDEBAR_LIST_LIMIT = 2;
const PASTED_PDF_ERROR =
  "Could not process the pasted PDF. Try uploading it or dragging it into the chat.";

type DocumentItem = {
  id: string;
  title: string;
  source_type: "pdf" | "text";
  status: "indexing" | "ready" | "failed";
  chunk_count: number;
  error_message: string | null;
  selected: boolean;
  created_at: string;
};

type CitationItem = {
  index: number;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  pageNumber: number | null;
  chunkIndex: number;
  snippet: string;
};

type ChatTurn = {
  id: string;
  question: string;
  answer: string;
  citations: CitationItem[];
  language: ResponseLanguage;
};

type UploadMode = "file" | "text";

type AuthUser = {
  id: string;
  email: string | null;
};

type ProfileItem = {
  id: string;
  full_name: string;
  email: string | null;
};

type FolderItem = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

type SavedChatItem = {
  id: string;
  folder_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export function RagWorkspace() {
  const chatFormRef = useRef<HTMLFormElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const copyFeedbackTimerRef = useRef<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<ProfileItem | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [chats, setChats] = useState<SavedChatItem[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isDocumentsExpanded, setIsDocumentsExpanded] = useState(false);
  const [isChatsExpanded, setIsChatsExpanded] = useState(false);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [uploadMode, setUploadMode] = useState<UploadMode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadingChatAttachment, setUploadingChatAttachment] = useState(false);
  const [asking, setAsking] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [draggingChatFile, setDraggingChatFile] = useState(false);
  const [copiedMessageKey, setCopiedMessageKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readyDocuments = useMemo(
    () => documents.filter((document) => document.status === "ready"),
    [documents],
  );
  const authUserId = authUser?.id ?? null;
  const isAuthenticated = Boolean(authUserId);
  const accountLabel = getAccountLabel(profile, authUser);
  const activeFolder = useMemo(
    () => folders.find((folder) => folder.id === activeFolderId) ?? null,
    [activeFolderId, folders],
  );
  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) ?? null,
    [activeChatId, chats],
  );
  const visibleChats = useMemo(
    () =>
      activeFolderId
        ? chats.filter((chat) => chat.folder_id === activeFolderId)
        : chats,
    [activeFolderId, chats],
  );
  const visibleDocuments = isDocumentsExpanded
    ? documents
    : documents.slice(0, SIDEBAR_LIST_LIMIT);
  const visibleSidebarChats = isChatsExpanded
    ? visibleChats
    : visibleChats.slice(0, SIDEBAR_LIST_LIMIT);
  const hiddenDocumentCount = Math.max(
    documents.length - SIDEBAR_LIST_LIMIT,
    0,
  );
  const hiddenChatCount = Math.max(
    visibleChats.length - SIDEBAR_LIST_LIMIT,
    0,
  );
  const isInitialChat = turns.length === 0 && !asking;
  const canSubmitQuestion =
    (isAuthenticated ? Boolean(activeChatId) : Boolean(sessionId)) &&
    !asking &&
    !uploadingChatAttachment &&
    question.trim().length > 0;
  const documentControlsDisabled =
    uploading || !sessionId || (isAuthenticated && !activeFolderId);

  function toggleDocumentsExpanded() {
    setIsDocumentsExpanded((current) => {
      const nextExpanded = !current;
      if (nextExpanded) setIsChatsExpanded(false);
      return nextExpanded;
    });
  }

  function toggleChatsExpanded() {
    setIsChatsExpanded((current) => {
      const nextExpanded = !current;
      if (nextExpanded) setIsDocumentsExpanded(false);
      return nextExpanded;
    });
  }

  async function loadAuthSession() {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (!response.ok) {
        setAuthUser(null);
        setProfile(null);
        return;
      }

      const payload = await readPayload<{
        user: AuthUser | null;
        profile: ProfileItem | null;
      }>(response);
      setAuthUser(payload.user);
      setProfile(payload.profile);
    } catch {
      setAuthUser(null);
      setProfile(null);
    } finally {
      setAuthChecked(true);
    }
  }

  async function loadWorkspace(preferredChatId?: string) {
    setLoadingWorkspace(true);
    setError(null);

    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const payload = await readPayload<{
        user: AuthUser;
        profile: ProfileItem;
        folders: FolderItem[];
        chats: SavedChatItem[];
      }>(response);

      setAuthUser(payload.user);
      setProfile(payload.profile);
      setFolders(payload.folders);
      setChats(payload.chats);

      const nextChat =
        payload.chats.find((chat) => chat.id === preferredChatId) ??
        payload.chats[0] ??
        null;
      const nextFolder =
        payload.folders.find((folder) => folder.id === nextChat?.folder_id) ??
        payload.folders[0] ??
        null;

      setActiveFolderId(nextFolder?.id ?? null);
      setActiveChatId(nextChat?.id ?? null);
    } catch (requestError) {
      setError(getClientError(requestError));
    } finally {
      setLoadingWorkspace(false);
    }
  }

  async function loadSavedMessages(chatId: string) {
    try {
      const response = await fetch(`/api/chats/${chatId}/messages`, {
        cache: "no-store",
      });
      const payload = await readPayload<{ turns: ChatTurn[] }>(response);
      setTurns(payload.turns);
    } catch (requestError) {
      setError(getClientError(requestError));
    }
  }

  async function loadDocuments(scope: {
    sessionId?: string;
    folderId?: string;
    chatId?: string;
  }) {
    try {
      const query = scope.folderId
        ? `folderId=${encodeURIComponent(scope.folderId)}`
        : scope.chatId
          ? `chatId=${encodeURIComponent(scope.chatId)}`
          : `sessionId=${encodeURIComponent(scope.sessionId ?? "")}`;
      const response = await fetch(`/api/documents?${query}`, {
        cache: "no-store",
      });
      const payload = await readPayload<{ documents: DocumentItem[] }>(response);
      setDocuments(payload.documents);
      setSelectedDocumentIds(
        scope.folderId || scope.chatId
          ? payload.documents
              .filter((document) => document.status === "ready" && document.selected)
              .map((document) => document.id)
          : [],
      );
    } catch (requestError) {
      setError(getClientError(requestError));
    } finally {
      setLoadingDocuments(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAuthSession();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      let nextSessionId = crypto.randomUUID();

      try {
        const storedSessionId = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
        nextSessionId = storedSessionId || nextSessionId;

        if (!storedSessionId) {
          window.sessionStorage.setItem(SESSION_STORAGE_KEY, nextSessionId);
        }
      } catch {
        // Private browsing or strict storage settings can block sessionStorage.
      }

      setSessionId(nextSessionId);
      setSessionReady(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!sessionReady || !authChecked) return;

    const timer = window.setTimeout(() => {
      if (authUserId) {
        setTurns([]);
        setDocuments([]);
        setSelectedDocumentIds([]);
        setLoadingDocuments(false);
        void loadWorkspace();
        return;
      }

      if (sessionId) {
        setTurns([]);
        setDocuments([]);
        setSelectedDocumentIds([]);
        setLoadingDocuments(true);
        void loadDocuments({ sessionId });
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [authChecked, authUserId, sessionId, sessionReady]);

  useEffect(() => {
    if (!authUserId || !activeChatId) return;

    const timer = window.setTimeout(() => {
      setTurns([]);
      void loadSavedMessages(activeChatId);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [activeChatId, authUserId]);

  useEffect(() => {
    if (!authUserId || !activeFolderId) return;

    const timer = window.setTimeout(() => {
      setIsDocumentsExpanded(false);
      setIsChatsExpanded(false);
      setDocuments([]);
      setSelectedDocumentIds([]);
      setLoadingDocuments(true);
      void loadDocuments({ folderId: activeFolderId });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [activeFolderId, authUserId]);

  useEffect(() => {
    if (!authUserId || !activeFolderId) return;

    const activeChatBelongsToFolder = chats.some(
      (chat) => chat.id === activeChatId && chat.folder_id === activeFolderId,
    );

    if (activeChatBelongsToFolder) return;

    const timer = window.setTimeout(() => {
      const nextChat = chats.find((chat) => chat.folder_id === activeFolderId);
      setActiveChatId(nextChat?.id ?? null);

      if (!nextChat) {
        setTurns([]);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [activeChatId, activeFolderId, authUserId, chats]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [asking, turns.length]);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimerRef.current) {
        window.clearTimeout(copyFeedbackTimerRef.current);
      }
    };
  }, []);

  async function indexDocument(input: {
    file?: File;
    text?: string;
    title?: string;
  }) {
    if (!sessionId) {
      throw new Error("The chat session is not ready yet.");
    }
    if (isAuthenticated && !activeFolderId) {
      throw new Error("Open a folder before adding documents.");
    }

    const formData = new FormData();
    if (isAuthenticated && activeFolderId) {
      formData.append("folderId", activeFolderId);
    } else {
      formData.append("sessionId", sessionId);
    }
    if (input.title?.trim()) formData.append("title", input.title.trim());
    if (input.file) formData.append("file", input.file);
    if (input.text?.trim()) formData.append("text", input.text.trim());

    const response = await fetch("/api/documents", {
      method: "POST",
      body: formData,
    });
    const payload = await readPayload<{ document: DocumentItem }>(response);

    setDocuments((current) => [payload.document, ...current]);
    setSelectedDocumentIds((current) =>
      current.includes(payload.document.id)
        ? current
        : [...current, payload.document.id],
    );

    return payload.document;
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setUploading(true);

    try {
      let uploadedDocument: DocumentItem;
      if (uploadMode === "file") {
        if (!file) throw new Error("Choose a PDF or .txt file.");
        uploadedDocument = await indexDocument({ file, title });
      } else {
        if (!pastedText.trim()) throw new Error("Paste text before indexing.");
        uploadedDocument = await indexDocument({ text: pastedText, title });
      }

      setNotice(`Indexed "${uploadedDocument.title}".`);
      setFile(null);
      setTitle("");
      setPastedText("");
    } catch (requestError) {
      setError(getClientError(requestError));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(documentId: string) {
    setDeletingId(documentId);
    setError(null);
    setNotice(null);

    try {
      if (!sessionId) throw new Error("The chat session is not ready yet.");
      if (isAuthenticated && !activeFolderId) {
        throw new Error("Open a folder before deleting documents.");
      }

      const query = isAuthenticated
        ? `folderId=${encodeURIComponent(activeFolderId ?? "")}`
        : `sessionId=${encodeURIComponent(sessionId)}`;
      const response = await fetch(
        `/api/documents/${documentId}?${query}`,
        { method: "DELETE" },
      );
      await readPayload(response);
      setDocuments((current) =>
        current.filter((document) => document.id !== documentId),
      );
      setSelectedDocumentIds((current) =>
        current.filter((id) => id !== documentId),
      );
      setNotice("Document removed.");
    } catch (requestError) {
      setError(getClientError(requestError));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuestion = question.trim();
    if (!nextQuestion || asking || uploadingChatAttachment || !sessionId) return;
    if (isAuthenticated && !activeChatId) {
      setError("Create or open a chat before asking.");
      return;
    }

    const responseLanguage = detectResponseLanguage(nextQuestion);
    setAsking(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isAuthenticated ? { chatId: activeChatId } : { sessionId }),
          question: nextQuestion,
          documentIds: selectedDocumentIds,
          history: turns.slice(-CHAT_HISTORY_TURN_LIMIT).map((turn) => ({
            question: turn.question,
            answer: turn.answer,
          })),
        }),
      });
      const payload = await readPayload<{
        answer: string;
        citations: CitationItem[];
      }>(response);

      setTurns((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          question: nextQuestion,
          answer: payload.answer,
          citations: payload.citations,
          language: responseLanguage,
        },
      ]);
      setQuestion("");

      if (isAuthenticated && activeChatId) {
        setChats((current) =>
          current.map((chat) =>
            chat.id === activeChatId
              ? {
                  ...chat,
                  title:
                    chat.title === "New chat"
                      ? createLocalChatTitle(nextQuestion)
                      : chat.title,
                  updated_at: new Date().toISOString(),
                }
              : chat,
          ),
        );
      }
    } catch (requestError) {
      setError(getClientError(requestError));
    } finally {
      setAsking(false);
    }
  }

  async function handleCopyMessage(messageKey: string, text: string) {
    try {
      await copyTextToClipboard(text);
      setCopiedMessageKey(messageKey);

      if (copyFeedbackTimerRef.current) {
        window.clearTimeout(copyFeedbackTimerRef.current);
      }

      copyFeedbackTimerRef.current = window.setTimeout(() => {
        setCopiedMessageKey((current) =>
          current === messageKey ? null : current,
        );
      }, COPY_FEEDBACK_TIMEOUT_MS);
    } catch {
      setError("Could not copy message.");
    }
  }

  async function handleSignOut() {
    setAuthLoading(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      await readPayload(response);
      setAuthUser(null);
      setProfile(null);
      setFolders([]);
      setChats([]);
      setActiveFolderId(null);
      setActiveChatId(null);
      setTurns([]);
      setDocuments([]);
      setSelectedDocumentIds([]);
      if (sessionId) {
        setLoadingDocuments(true);
        await loadDocuments({ sessionId });
      }
      setNotice("Signed out. You are using guest mode.");
    } catch (requestError) {
      setError(getClientError(requestError));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleCreateFolder() {
    const name = window.prompt("Folder name", "New folder");
    if (!name?.trim()) return;

    try {
      const response = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await readPayload<{
        folder: FolderItem;
        chat?: SavedChatItem;
      }>(response);
      await loadWorkspace(payload.chat?.id);
      setActiveFolderId(payload.folder.id);
      if (payload.chat) setActiveChatId(payload.chat.id);
    } catch (requestError) {
      setError(getClientError(requestError));
    }
  }

  async function handleRenameFolder(folder: FolderItem) {
    const name = window.prompt("Rename folder", folder.name);
    if (!name?.trim() || name.trim() === folder.name) return;

    try {
      const response = await fetch(`/api/folders/${folder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      await readPayload(response);
      await loadWorkspace(activeChatId ?? undefined);
    } catch (requestError) {
      setError(getClientError(requestError));
    }
  }

  async function handleDeleteFolder(folder: FolderItem) {
    if (
      !window.confirm(
        `Delete "${folder.name}" and all chats and documents inside it?`,
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/folders/${folder.id}`, {
        method: "DELETE",
      });
      await readPayload(response);
      await loadWorkspace();
    } catch (requestError) {
      setError(getClientError(requestError));
    }
  }

  async function handleCreateChat() {
    if (!activeFolderId) return;

    try {
      const response = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: activeFolderId, title: "New chat" }),
      });
      const payload = await readPayload<{ chat: SavedChatItem }>(response);
      await loadWorkspace(payload.chat.id);
    } catch (requestError) {
      setError(getClientError(requestError));
    }
  }

  async function handleRenameChat(chat: SavedChatItem) {
    const title = window.prompt("Rename chat", chat.title);
    if (!title?.trim() || title.trim() === chat.title) return;

    try {
      const response = await fetch(`/api/chats/${chat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      await readPayload(response);
      await loadWorkspace(chat.id);
    } catch (requestError) {
      setError(getClientError(requestError));
    }
  }

  async function handleDeleteChat(chat: SavedChatItem) {
    if (
      !window.confirm(
        `Delete "${chat.title}" and its messages? Folder documents will stay available.`,
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/chats/${chat.id}`, {
        method: "DELETE",
      });
      await readPayload(response);
      await loadWorkspace();
    } catch (requestError) {
      setError(getClientError(requestError));
    }
  }

  function handleOpenChat(chat: SavedChatItem) {
    setActiveFolderId(chat.folder_id);
    setActiveChatId(chat.id);
  }

  async function handleChatPdfFile(nextFile: File) {
    setError(null);
    setNotice(null);

    if (!isPdfFile(nextFile)) {
      setError("Attach a PDF file.");
      return;
    }

    setUploadingChatAttachment(true);

    try {
      const uploadedDocument = await indexDocument({
        file: nextFile,
        title: nextFile.name,
      });
      setNotice(`Added "${uploadedDocument.title}" to this folder.`);
    } catch (requestError) {
      setError(getClientError(requestError));
    } finally {
      setUploadingChatAttachment(false);
    }
  }

  async function handlePastedChatContext(text: string) {
    setError(null);
    setNotice(null);
    setUploadingChatAttachment(true);

    try {
      const uploadedDocument = await indexDocument({
        text,
        title: "Pasted document context",
      });
      setNotice(`Added "${uploadedDocument.title}" to this folder.`);
    } catch (requestError) {
      setError(getClientError(requestError));
    } finally {
      setUploadingChatAttachment(false);
    }
  }

  function handleQuestionPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (uploadingChatAttachment) return;

    const pastedFile = getPastedPdfFile(event.clipboardData);
    if (pastedFile.file) {
      event.preventDefault();
      void handleChatPdfFile(pastedFile.file);
      return;
    }

    if (pastedFile.inaccessibleFile) {
      event.preventDefault();
      setNotice(null);
      setError(PASTED_PDF_ERROR);
      return;
    }

    const text = event.clipboardData.getData("text/plain");
    if (!shouldTreatPasteAsContext(text)) return;

    event.preventDefault();
    void handlePastedChatContext(text);
  }

  function handleQuestionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    event.preventDefault();
    if (canSubmitQuestion) {
      chatFormRef.current?.requestSubmit();
    }
  }

  function handleChatDragEnter(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    setDraggingChatFile(true);
  }

  function handleChatDragOver(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    setDraggingChatFile(true);
  }

  function handleChatDragLeave(event: DragEvent<HTMLElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setDraggingChatFile(false);
  }

  function handleChatDrop(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    setDraggingChatFile(false);

    const nextFile = [...event.dataTransfer.files].find(isPdfFile);
    if (!nextFile) {
      setError("Drop a PDF file.");
      return;
    }

    void handleChatPdfFile(nextFile);
  }

  async function persistDocumentSelection(documentId: string, selected: boolean) {
    if (!isAuthenticated || !activeFolderId) return;

    const response = await fetch(`/api/documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: activeFolderId, selected }),
    });
    await readPayload(response);
  }

  async function persistBulkDocumentSelection(
    documentIds: string[],
    selected: boolean,
  ) {
    if (!isAuthenticated || !activeFolderId || documentIds.length === 0) return;

    const response = await fetch("/api/documents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: activeFolderId, documentIds, selected }),
    });
    await readPayload(response);
  }

  function toggleDocument(documentId: string) {
    const selected = !selectedDocumentIds.includes(documentId);
    setSelectedDocumentIds((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId],
    );
    setDocuments((current) =>
      current.map((document) =>
        document.id === documentId ? { ...document, selected } : document,
      ),
    );

    void persistDocumentSelection(documentId, selected).catch((requestError) => {
      setError(getClientError(requestError));
    });
  }

  function selectAllReadyDocuments() {
    const nextIds = readyDocuments.map((document) => document.id);
    setSelectedDocumentIds(nextIds);
    setDocuments((current) =>
      current.map((document) =>
        document.status === "ready" ? { ...document, selected: true } : document,
      ),
    );
    void persistBulkDocumentSelection(nextIds, true).catch((requestError) => {
      setError(getClientError(requestError));
    });
  }

  function clearDocumentSelection() {
    const currentIds = selectedDocumentIds;
    setSelectedDocumentIds([]);
    setDocuments((current) =>
      current.map((document) => ({ ...document, selected: false })),
    );
    void persistBulkDocumentSelection(currentIds, false).catch((requestError) => {
      setError(getClientError(requestError));
    });
  }

  if (!sessionReady || !authChecked) {
    return (
      <main className="min-h-dvh bg-background text-foreground lg:h-dvh">
        <div className="grid min-h-dvh w-full gap-0 lg:h-dvh lg:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="border-b border-border/80 bg-card/80 lg:border-b-0 lg:border-r">
            <div className="flex h-full flex-col p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold tracking-tight">
                    AnswerDocs
                  </h1>
                  <p className="text-sm text-muted-foreground">RAG workspace</p>
                </div>
              </div>
              <Separator className="my-5" />
              <div className="animate-panel-in flex items-center gap-2 rounded-2xl border border-dashed border-border/90 bg-card/70 px-3 py-4 text-sm text-muted-foreground shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Preparing chat session
              </div>
            </div>
          </aside>
          <section className="flex min-h-[60dvh] items-center justify-center p-5 lg:min-h-0">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-accent-foreground" />
              Preparing workspace
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="h-dvh overflow-hidden bg-background text-foreground">
      <div className="grid h-dvh w-full grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <header
          className={cn(
            "z-20 grid border-b border-border/80 bg-background/90 shadow-[var(--shadow-subtle)] backdrop-blur transition-[grid-template-columns] duration-300 ease-out lg:min-h-16",
            isSidebarCollapsed
              ? "lg:grid-cols-[72px_minmax(0,1fr)]"
              : "lg:grid-cols-[380px_minmax(0,1fr)]",
          )}
        >
          <div
            className={cn(
              "flex items-center border-b border-border/80 bg-card/80 px-3 py-2 sm:px-5 lg:border-b-0 lg:border-r",
              isSidebarCollapsed && "lg:justify-center lg:px-3",
            )}
          >
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2 rounded-2xl px-1 py-1 outline-none transition-colors hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                <Sparkles className="h-4 w-4" />
              </span>
              <span
                className={cn(
                  "hidden text-base font-semibold tracking-tight sm:inline",
                  isSidebarCollapsed && "lg:hidden",
                )}
              >
                AnswerDocs
              </span>
            </Link>
          </div>

          <div className="flex min-w-0 items-center gap-3 px-3 py-2 sm:px-5">
            <nav
              aria-label="Folders"
              className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1"
            >
              {isAuthenticated ? (
                <>
                  {loadingWorkspace ? (
                    <Badge variant="secondary" className="shrink-0 gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading folders
                    </Badge>
                  ) : folders.length === 0 ? (
                    <Badge variant="outline" className="shrink-0">
                      No folders
                    </Badge>
                  ) : (
                    folders.map((folder) => {
                      const active = folder.id === activeFolderId;

                      return (
                        <div
                          key={folder.id}
                          className={cn(
                            "group/folder flex shrink-0 items-center rounded-2xl border border-border/80 bg-card/70 shadow-sm transition-all duration-200 hover:-translate-y-px hover:bg-secondary/70",
                            active &&
                              "border-primary/40 bg-primary text-primary-foreground hover:bg-primary/90",
                          )}
                        >
                          <button
                            type="button"
                            className="flex min-w-0 items-center gap-2 px-3 py-2 text-sm font-medium outline-none"
                            onClick={() => setActiveFolderId(folder.id)}
                          >
                            <Folder className="h-4 w-4 shrink-0" />
                            <span className="max-w-40 truncate">
                              {folder.name}
                            </span>
                          </button>
                          {active ? (
                            <span className="mr-1 flex items-center gap-0.5">
                              <button
                                type="button"
                                className="rounded-lg p-1 opacity-80 outline-none transition hover:bg-background/20 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
                                title={`Rename ${folder.name}`}
                                onClick={() => void handleRenameFolder(folder)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                className="rounded-lg p-1 opacity-80 outline-none transition hover:bg-background/20 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
                                title={`Delete ${folder.name}`}
                                onClick={() => void handleDeleteFolder(folder)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => void handleCreateFolder()}
                  >
                    <FolderPlus className="h-4 w-4" />
                    New folder
                  </Button>
                </>
              ) : (
                <div className="flex min-w-0 items-center gap-2">
                  <Badge variant="outline" className="shrink-0">
                    Guest mode
                  </Badge>
                  <span className="hidden truncate text-xs text-muted-foreground md:inline">
                    Sign in to save folders, chats, documents, and history.
                  </span>
                </div>
              )}
            </nav>

            <div className="shrink-0">
              {isAuthenticated ? (
                <details className="group/account relative">
                  <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl border border-border/80 bg-card/80 px-3 py-2 text-sm font-medium shadow-sm outline-none transition-all hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                    <span className="max-w-32 truncate sm:max-w-48">
                      {accountLabel}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open/account:rotate-180" />
                  </summary>
                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-40 rounded-2xl border border-border/80 bg-card p-2 shadow-[var(--shadow-soft)]">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start"
                      disabled={authLoading}
                      onClick={() => void handleSignOut()}
                    >
                      {authLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <LogOut className="h-4 w-4" />
                      )}
                      Sign out
                    </Button>
                  </div>
                </details>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link href="/auth">
                    <LogIn className="h-4 w-4" />
                    Sign in
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </header>

        <div
          className={cn(
            "grid min-h-0 w-full grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden transition-[grid-template-columns] duration-300 ease-out lg:grid-rows-none",
            isSidebarCollapsed
              ? "lg:grid-cols-[72px_minmax(0,1fr)]"
              : "lg:grid-cols-[380px_minmax(0,1fr)]",
          )}
        >
        <aside className="max-h-[38dvh] min-w-0 overflow-y-auto border-b border-border/80 bg-card/80 shadow-[var(--shadow-subtle)] lg:max-h-none lg:overflow-hidden lg:border-b-0 lg:border-r lg:shadow-none">
          <div
            className={cn(
              "flex h-full min-h-0 flex-col p-5 transition-all duration-300 ease-out",
              isSidebarCollapsed && "p-3",
            )}
          >
            {isSidebarCollapsed ? (
              <div className="flex items-center gap-2 lg:flex-col">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Expand document menu"
                  aria-expanded={false}
                  title="Expand document menu"
                  onClick={() => setIsSidebarCollapsed(false)}
                >
                  <PanelLeftOpen className="h-4 w-4" />
                </Button>
                <Badge variant="secondary" className="gap-1">
                  <FileText className="h-3 w-3" />
                  <span>{readyDocuments.length}</span>
                  <span className="lg:hidden">ready</span>
                </Badge>
                {selectedDocumentIds.length > 0 ? (
                  <Badge variant="outline" className="gap-1">
                    <span>{selectedDocumentIds.length}</span>
                    <span className="lg:hidden">selected</span>
                  </Badge>
                ) : null}
                {isAuthenticated ? (
                  <Badge variant="outline" className="gap-1">
                    <MessageSquare className="h-3 w-3" />
                    <span>{visibleChats.length}</span>
                    <span className="lg:hidden">chats</span>
                  </Badge>
                ) : null}
              </div>
            ) : (
              <>
                <form onSubmit={handleUpload} className="animate-panel-in space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <h2 className="text-sm font-semibold">Documents</h2>
                      <Badge variant="secondary">
                        {readyDocuments.length} ready
                      </Badge>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Collapse document menu"
                      aria-expanded
                      title="Collapse document menu"
                      onClick={() => setIsSidebarCollapsed(true)}
                    >
                      <PanelLeftClose className="h-4 w-4" />
                    </Button>
                  </div>

                  <Tabs
                    value={uploadMode}
                    onValueChange={(value) => setUploadMode(value as UploadMode)}
                  >
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="file">
                        <Upload className="mr-2 h-4 w-4" />
                        Upload
                      </TabsTrigger>
                      <TabsTrigger value="text">
                        <FileText className="mr-2 h-4 w-4" />
                        Paste
                      </TabsTrigger>
                    </TabsList>

                    <div className="space-y-2">
                      <Label htmlFor="document-title">Title</Label>
                      <Input
                        id="document-title"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="Quarterly report"
                        disabled={documentControlsDisabled}
                      />
                    </div>

                    <TabsContent value="file">
                      <div className="space-y-2">
                        <Label htmlFor="document-file">File</Label>
                        <label
                          htmlFor="document-file"
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-border bg-background/70 px-4 py-3 text-sm shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary hover:bg-secondary/75 hover:shadow-[var(--shadow-subtle)]",
                            documentControlsDisabled &&
                              "pointer-events-none cursor-not-allowed opacity-60",
                          )}
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                            <Upload className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">
                              {file ? "Change file" : "Select file"}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {file
                                ? `${file.name} - ${formatBytes(file.size)}`
                                : "PDF or .txt, up to 10 MB"}
                            </span>
                          </span>
                        </label>
                        <input
                          id="document-file"
                          type="file"
                          accept="application/pdf,text/plain,.pdf,.txt"
                          disabled={documentControlsDisabled}
                          className="sr-only"
                          onChange={(event) =>
                            setFile(event.target.files?.[0] ?? null)
                          }
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="text">
                      <div className="space-y-2">
                        <Label htmlFor="document-text">Text</Label>
                        <Textarea
                          id="document-text"
                          value={pastedText}
                          onChange={(event) => setPastedText(event.target.value)}
                          placeholder="Paste document text here"
                          disabled={documentControlsDisabled}
                        />
                      </div>
                    </TabsContent>
                  </Tabs>

                  {uploading ? <Progress value={66} /> : null}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={documentControlsDisabled}
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Database className="h-4 w-4" />
                    )}
                    Index document
                  </Button>
                </form>

                <Separator className="my-5" />

                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">Indexed files</h2>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={readyDocuments.length === 0}
                      onClick={selectAllReadyDocuments}
                    >
                      Select all
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={selectedDocumentIds.length === 0}
                      onClick={clearDocumentSelection}
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                <ScrollArea
                  className={cn(
                    "mt-3 pr-3",
                    isDocumentsExpanded && "h-48",
                  )}
                >
                  <div className="space-y-2">
                    {loadingDocuments ? (
                      <DocumentState
                        icon={Loader2}
                        text="Loading documents"
                        spin
                      />
                    ) : documents.length === 0 ? (
                      <DocumentState
                        icon={FileText}
                        text="No documents indexed"
                      />
                    ) : (
                      visibleDocuments.map((document) => (
                        <Card
                          key={document.id}
                          className="p-3 shadow-none hover:-translate-y-0.5 hover:shadow-sm"
                        >
                          <div className="flex items-start gap-3">
                            <input
                              aria-label={`Select ${document.title}`}
                              type="checkbox"
                              checked={selectedDocumentIds.includes(
                                document.id,
                              )}
                              disabled={document.status !== "ready"}
                              onChange={() => toggleDocument(document.id)}
                              className="mt-1 h-4 w-4 rounded border-border accent-[var(--accent)] transition-transform duration-200 checked:scale-105"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {document.title}
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <Badge variant="outline">
                                  {document.source_type.toUpperCase()}
                                </Badge>
                                <StatusBadge status={document.status} />
                                <span className="text-xs text-muted-foreground">
                                  {document.chunk_count} chunks
                                </span>
                              </div>
                              {document.error_message ? (
                                <p className="mt-2 text-xs text-destructive">
                                  {document.error_message}
                                </p>
                              ) : null}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title={`Delete ${document.title}`}
                              disabled={deletingId === document.id}
                              onClick={() => void handleDelete(document.id)}
                            >
                              {deletingId === document.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </Card>
                      ))
                    )}
                  </div>
                </ScrollArea>
                {hiddenDocumentCount > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-2 w-full justify-center text-muted-foreground"
                    onClick={toggleDocumentsExpanded}
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        isDocumentsExpanded && "rotate-180",
                      )}
                    />
                    {isDocumentsExpanded
                      ? "Show fewer documents"
                      : `Show more documents (${hiddenDocumentCount})`}
                  </Button>
                ) : null}

                <Separator className="my-5" />

                <section className="animate-panel-in min-h-0 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-semibold">Chats</h2>
                      <p className="text-xs text-muted-foreground">
                        {isAuthenticated
                          ? (activeFolder?.name ?? "No folder selected")
                          : "Temporary guest chat"}
                      </p>
                    </div>
                    {isAuthenticated ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={!activeFolderId}
                        onClick={() => void handleCreateChat()}
                      >
                        <Plus className="h-4 w-4" />
                        New
                      </Button>
                    ) : null}
                  </div>

                  {isAuthenticated ? (
                    <>
                    <ScrollArea
                      className={cn(
                        "pr-2",
                        isChatsExpanded ? "h-64" : "max-h-48",
                      )}
                    >
                      <div className="space-y-2">
                        {loadingWorkspace ? (
                          <DocumentState
                            icon={Loader2}
                            text="Loading chats"
                            spin
                          />
                        ) : visibleChats.length === 0 ? (
                          <DocumentState icon={MessageSquare} text="No chats yet" />
                        ) : (
                          visibleSidebarChats.map((chat) => (
                            <div
                              key={chat.id}
                              className={cn(
                                "rounded-2xl border border-border/75 bg-background/60 p-2 shadow-sm transition-colors",
                                chat.id === activeChatId && "bg-secondary",
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="min-w-0 flex-1 justify-start px-2"
                                  onClick={() => handleOpenChat(chat)}
                                >
                                  <MessageSquare className="h-4 w-4 shrink-0" />
                                  <span className="truncate">{chat.title}</span>
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  title={`Rename ${chat.title}`}
                                  onClick={() => void handleRenameChat(chat)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  title={`Delete ${chat.title}`}
                                  onClick={() => void handleDeleteChat(chat)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                    {hiddenChatCount > 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full justify-center text-muted-foreground"
                        onClick={toggleChatsExpanded}
                      >
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 transition-transform",
                            isChatsExpanded && "rotate-180",
                          )}
                        />
                        {isChatsExpanded
                          ? "Show fewer chats"
                          : `Show more chats (${hiddenChatCount})`}
                      </Button>
                    ) : null}
                    </>
                  ) : (
                    <div className="rounded-2xl border border-border/80 bg-background/65 p-3 text-xs leading-5 text-muted-foreground shadow-sm">
                      Guest chats stay temporary. Sign in from the top-right
                      account button to save chats and history.
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <header className="border-b border-border/80 bg-background/70 px-5 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">
                  {activeChat?.title ?? "Ask your documents"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {selectedDocumentIds.length > 0
                    ? `${selectedDocumentIds.length} selected`
                    : readyDocuments.length > 0
                      ? "Select documents to ask from"
                      : isAuthenticated
                        ? "No folder documents yet"
                        : "No context loaded yet"}
                </p>
              </div>
              <Badge variant="secondary" className="self-start md:self-auto">
                {isAuthenticated ? "Saved workspace" : "Guest workspace"}
              </Badge>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-5">
            <div
              className={cn(
                "mx-auto flex min-h-0 w-full max-w-[980px] flex-1 flex-col",
                isInitialChat && "justify-center",
              )}
            >
              {notice || error ? (
                <div className="mb-4 shrink-0">
                  {notice ? (
                    <InlineMessage tone="success" message={notice} />
                  ) : null}
                  {error ? <InlineMessage tone="error" message={error} /> : null}
                </div>
              ) : null}

              {isInitialChat ? (
                <div className="animate-panel-in mb-5 flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/90 bg-card/70 px-4 py-10 text-center shadow-[var(--shadow-subtle)]">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-accent-foreground shadow-sm">
                    <MessageSquare className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium">No questions yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Indexed answers will appear here.
                  </p>
                </div>
              ) : (
                <ScrollArea className="min-h-0 flex-1 pr-2 sm:pr-3">
                  <div className="flex min-h-full flex-col justify-end gap-4 pb-1">
                    {turns.map((turn) => (
                      <article
                        key={turn.id}
                        className="animate-message-in flex flex-col gap-3"
                      >
                        <div className="group/message ml-auto flex max-w-[86%] flex-col items-end gap-1 sm:max-w-[76%]">
                          <div className="min-w-0 rounded-3xl rounded-br-lg bg-primary px-4 py-3 text-primary-foreground shadow-sm">
                            <p className="select-text whitespace-pre-wrap text-sm leading-6">
                              {turn.question}
                            </p>
                          </div>
                          <CopyMessageButton
                            messageKey={`${turn.id}:question`}
                            text={turn.question}
                            language={turn.language}
                            copiedMessageKey={copiedMessageKey}
                            onCopy={(messageKey, text) =>
                              void handleCopyMessage(messageKey, text)
                            }
                          />
                        </div>

                        <div className="group/message mr-auto max-w-[94%] rounded-3xl rounded-bl-lg border border-border/80 bg-card/85 p-4 text-card-foreground shadow-[var(--shadow-subtle)] sm:max-w-[86%]">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-secondary text-accent-foreground shadow-sm">
                              <Sparkles className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="select-text whitespace-pre-wrap text-sm leading-6">
                                {turn.answer}
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 flex justify-end">
                            <CopyMessageButton
                              messageKey={`${turn.id}:answer`}
                              text={turn.answer}
                              language={turn.language}
                              copiedMessageKey={copiedMessageKey}
                              onCopy={(messageKey, text) =>
                                void handleCopyMessage(messageKey, text)
                              }
                            />
                          </div>

                          {turn.citations.length > 0 ? (
                            <details className="group mt-4 rounded-2xl border border-border/80 bg-background/55 shadow-sm transition-all duration-200 open:bg-background/75">
                              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                                <Quote className="h-4 w-4 text-accent-foreground" />
                                View references ({turn.citations.length})
                                <ChevronDown className="ml-auto h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
                              </summary>
                              <div className="references-panel grid gap-3 border-t border-border/80 p-3 md:grid-cols-2">
                                {turn.citations.map((citation) => (
                                  <div
                                    key={citation.chunkId}
                                    className="rounded-2xl border border-border/75 bg-card/70 p-3 shadow-sm"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
                                            {citation.index}
                                          </span>
                                          <span className="truncate text-sm font-medium">
                                            {citation.documentTitle}
                                          </span>
                                        </div>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                          {citation.pageNumber
                                            ? `Page ${citation.pageNumber} - Block ${citation.chunkIndex + 1}`
                                            : `Text block ${citation.chunkIndex + 1}`}
                                        </p>
                                      </div>
                                    </div>
                                    <p className="mt-3 max-h-44 overflow-y-auto whitespace-pre-wrap pr-2 text-xs leading-5 text-muted-foreground">
                                      {citation.snippet}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </details>
                          ) : null}
                        </div>
                      </article>
                    ))}

                    {asking ? (
                      <div className="animate-message-in mr-auto rounded-3xl rounded-bl-lg border border-border/80 bg-card/80 p-4 shadow-[var(--shadow-subtle)]">
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin text-accent-foreground" />
                          Retrieving context and drafting an answer
                        </div>
                      </div>
                    ) : null}

                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>
              )}

              <form
                ref={chatFormRef}
                onSubmit={handleAsk}
                className={cn("shrink-0 space-y-3", !isInitialChat && "mt-4")}
              >
                <section
                  aria-label="Chat composer"
                  onDragEnter={handleChatDragEnter}
                  onDragOver={handleChatDragOver}
                  onDragLeave={handleChatDragLeave}
                  onDrop={handleChatDrop}
                  className={cn(
                    "relative rounded-3xl border border-border/80 bg-card/85 shadow-[var(--shadow-soft)] transition-all duration-200 focus-within:border-ring/80 focus-within:ring-4 focus-within:ring-ring/10",
                    draggingChatFile &&
                      "border-primary bg-secondary shadow-[var(--shadow-soft)]",
                  )}
                >
                  <Search className="pointer-events-none absolute left-4 top-4 h-4 w-4 text-muted-foreground" />
                  <Textarea
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={handleQuestionKeyDown}
                    onPaste={handleQuestionPaste}
                    placeholder="Ask about your documents or paste a PDF/text context"
                    className="min-h-32 border-0 bg-transparent pb-14 pl-11 pr-28 shadow-none focus-visible:ring-0"
                    disabled={
                      asking ||
                      uploadingChatAttachment ||
                      (isAuthenticated ? !activeChatId : !sessionId)
                    }
                  />
                  {uploadingChatAttachment ? (
                    <div className="absolute bottom-4 left-4 flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-foreground" />
                      Indexing context
                    </div>
                  ) : null}
                  <Button
                    type="submit"
                    className="absolute bottom-3 right-3"
                    disabled={!canSubmitQuestion}
                  >
                    {asking ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Ask
                  </Button>
                  {draggingChatFile ? (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-3xl bg-background/85 text-sm font-medium text-foreground backdrop-blur-sm">
                      Drop PDF to add it to this folder
                    </div>
                  ) : null}
                </section>
              </form>
            </div>
          </div>
        </section>
        </div>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: DocumentItem["status"] }) {
  if (status === "ready") {
    return <Badge>Ready</Badge>;
  }

  if (status === "failed") {
    return <Badge variant="destructive">Failed</Badge>;
  }

  return <Badge variant="secondary">Indexing</Badge>;
}

function InlineMessage({
  tone,
  message,
}: {
  tone: "success" | "error";
  message: string;
}) {
  const Icon = tone === "success" ? CheckCircle2 : AlertCircle;

  return (
    <div className="animate-panel-in flex items-center gap-2 rounded-2xl border border-border/80 bg-card/85 px-3 py-2 text-sm shadow-sm">
      <Icon
        className={
          tone === "success"
            ? "h-4 w-4 text-accent-foreground"
            : "h-4 w-4 text-destructive"
        }
      />
      <span className={tone === "error" ? "text-destructive" : undefined}>
        {message}
      </span>
    </div>
  );
}

function DocumentState({
  icon: Icon,
  text,
  spin = false,
}: {
  icon: LucideIcon;
  text: string;
  spin?: boolean;
}) {
  return (
    <div className="animate-panel-in flex items-center gap-2 rounded-2xl border border-dashed border-border/90 bg-card/65 px-3 py-4 text-sm text-muted-foreground shadow-sm">
      <Icon className={spin ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
      {text}
    </div>
  );
}

function CopyMessageButton({
  messageKey,
  text,
  language,
  copiedMessageKey,
  onCopy,
}: {
  messageKey: string;
  text: string;
  language: ResponseLanguage;
  copiedMessageKey: string | null;
  onCopy: (messageKey: string, text: string) => void;
}) {
  const copied = copiedMessageKey === messageKey;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        "h-7 px-2 text-[11px] text-muted-foreground opacity-80 shadow-none transition-opacity hover:text-foreground sm:opacity-0 sm:group-hover/message:opacity-100 sm:focus-visible:opacity-100",
        copied && "opacity-100",
      )}
      aria-label={copied ? LOCALIZED_CHAT_MESSAGES[language].copied : "Copy message"}
      title={copied ? LOCALIZED_CHAT_MESSAGES[language].copied : "Copy message"}
      onClick={() => onCopy(messageKey, text)}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? LOCALIZED_CHAT_MESSAGES[language].copied : null}
    </Button>
  );
}

function getAccountLabel(profile: ProfileItem | null, user: AuthUser | null) {
  const name = profile?.full_name.trim();
  if (name) return name;
  if (user?.email) return user.email;
  return "Account";
}

async function readPayload<T = unknown>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

function getClientError(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}

function createLocalChatTitle(question: string) {
  const title = question.replace(/\s+/g, " ").trim();
  return title.slice(0, 70) || "New chat";
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function getPastedPdfFile(clipboardData: DataTransfer) {
  const files = [...clipboardData.files];
  const fileListPdf = files.find(isPdfFile);

  if (fileListPdf) {
    return { file: fileListPdf, inaccessibleFile: false };
  }

  let inaccessibleFile = false;

  for (const item of [...clipboardData.items]) {
    if (item.kind !== "file") continue;

    const file = item.getAsFile();
    if (file && isPdfFile(file)) {
      return { file, inaccessibleFile: false };
    }

    if (!file && isPdfClipboardItem(item)) {
      inaccessibleFile = true;
    }
  }

  return { file: null, inaccessibleFile };
}

function isPdfClipboardItem(item: DataTransferItem) {
  return item.type === "application/pdf" || item.type === "";
}

function shouldTreatPasteAsContext(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;

  const lineCount = trimmed.split(/\r?\n/).filter((line) => line.trim()).length;
  return (
    trimmed.length >= PASTED_CONTEXT_MIN_CHARACTERS ||
    lineCount >= PASTED_CONTEXT_MIN_LINES
  );
}

function hasDraggedFiles(event: DragEvent<HTMLElement>) {
  return [...event.dataTransfer.types].includes("Files");
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Copy failed.");
  }
}
