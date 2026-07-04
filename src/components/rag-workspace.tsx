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
  Menu,
  MessageSquare,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Quote,
  Search,
  Send,
  Square,
  Settings,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { AnswerDocsLogo } from "@/components/answerdocs-logo";
import { useInterfaceLanguage } from "@/components/interface-language-provider";
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
import {
  DOCUMENT_FILE_ACCEPT,
  IMAGE_NO_TEXT_ERROR,
  resolveImageMimeType,
} from "@/lib/document-file-types";
import { detectResponseLanguage } from "@/lib/language";
import type { ChatContextAction, ResponseLanguage, SourceType } from "@/lib/types";
import {
  MAX_IMAGE_UPLOAD_BYTES,
  isUploadFileTooLarge,
} from "@/lib/upload-limits";
import { cn, formatBytes } from "@/lib/utils";
import { MAX_VOICE_AUDIO_BYTES, MAX_VOICE_RECORDING_SECONDS } from "@/lib/voice-limits";
import {
  startWavRecording,
  type VoiceRecorder,
  VoiceRecorderError,
} from "@/lib/voice-recorder";

const SESSION_STORAGE_KEY = "answerdocs.sessionId";
const CHAT_HISTORY_TURN_LIMIT = 6;
const COPY_FEEDBACK_TIMEOUT_MS = 1_600;
const PASTED_CONTEXT_MIN_CHARACTERS = 350;
const PASTED_CONTEXT_MIN_LINES = 3;
const SIDEBAR_LIST_LIMIT = 2;

type DocumentItem = {
  id: string;
  title: string;
  source_type: SourceType;
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
  sourceType?: SourceType;
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
  contextAction?: ChatContextAction;
};

type UploadMode = "file" | "text";
type VoiceState = "idle" | "recording" | "transcribing";

type AuthUser = {
  id: string;
  email: string | null;
};

type ProfileItem = {
  id: string;
  full_name: string;
  email: string | null;
  created_at: string;
  updated_at: string;
  interface_language: "en" | "pt";
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
  const { setLanguage, copy } = useInterfaceLanguage();
  const t = copy.workspace;
  const chatFormRef = useRef<HTMLFormElement>(null);
  const contextualUploadInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const copyFeedbackTimerRef = useRef<number | null>(null);
  const voiceRecorderRef = useRef<VoiceRecorder | null>(null);
  const voiceRecordingTimerRef = useRef<number | null>(null);
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
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isMobileFoldersOpen, setIsMobileFoldersOpen] = useState(false);
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
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readyDocuments = useMemo(
    () => documents.filter((document) => document.status === "ready"),
    [documents],
  );
  const authUserId = authUser?.id ?? null;
  const isAuthenticated = Boolean(authUserId);
  const accountLabel = getAccountLabel(profile, authUser, copy.account.account);
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
  const voiceBusy = voiceState !== "idle";
  const canSubmitQuestion =
    (isAuthenticated ? Boolean(activeChatId) : Boolean(sessionId)) &&
    !asking &&
    !uploadingChatAttachment &&
    !voiceBusy &&
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

  const loadAuthSession = useCallback(async () => {
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
      if (payload.profile?.interface_language) {
        setLanguage(payload.profile.interface_language);
      }
    } catch {
      setAuthUser(null);
      setProfile(null);
    } finally {
      setAuthChecked(true);
    }
  }, [setLanguage]);

  const loadWorkspace = useCallback(async (preferredChatId?: string) => {
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
      setLanguage(payload.profile.interface_language);
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
  }, [setLanguage]);

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
  }, [loadAuthSession]);

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
  }, [authChecked, authUserId, loadWorkspace, sessionId, sessionReady]);

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

  useEffect(() => {
    return () => {
      clearVoiceRecordingTimer();
      voiceRecorderRef.current?.cancel();
      voiceRecorderRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isMobileSidebarOpen && !isMobileFoldersOpen) return;

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsMobileSidebarOpen(false);
      setIsMobileFoldersOpen(false);
    }

    window.addEventListener("keydown", handleEscape);

    return () => window.removeEventListener("keydown", handleEscape);
  }, [isMobileFoldersOpen, isMobileSidebarOpen]);

  function validateUploadFileSize(nextFile: File) {
    if (isImageFile(nextFile)) {
      if (!isUploadFileTooLarge(nextFile.size, MAX_IMAGE_UPLOAD_BYTES)) {
        return true;
      }

      setNotice(null);
      setError(t.imageTooLarge);
      return false;
    }

    if (!isUploadFileTooLarge(nextFile.size)) return true;

    setNotice(null);
    setError(t.fileTooLarge);
    return false;
  }

  function getDocumentUploadError(error: unknown) {
    const message = getClientError(error);
    return message === IMAGE_NO_TEXT_ERROR ? t.imageNoText : message;
  }

  function clearVoiceRecordingTimer() {
    if (!voiceRecordingTimerRef.current) return;
    window.clearTimeout(voiceRecordingTimerRef.current);
    voiceRecordingTimerRef.current = null;
  }

  function getVoiceStartErrorMessage(recordingError: unknown) {
    if (isMicrophonePermissionError(recordingError)) {
      return t.voicePermissionDenied;
    }

    return t.voiceUnsupported;
  }

  function getVoiceTranscriptionErrorMessage(transcriptionError: unknown) {
    if (
      transcriptionError instanceof VoiceRecorderError ||
      transcriptionError instanceof Error
    ) {
      return transcriptionError.message || t.voiceNoSpeech;
    }

    return t.voiceNoSpeech;
  }

  async function indexDocument(input: {
    file?: File;
    text?: string;
    title?: string;
  }) {
    if (!sessionId) {
      throw new Error(t.sessionNotReady);
    }
    if (isAuthenticated && !activeFolderId) {
      throw new Error(t.openFolderBeforeAdding);
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
        if (!file) throw new Error(t.chooseFile);
        if (!validateUploadFileSize(file)) return;
        uploadedDocument = await indexDocument({ file, title });
      } else {
        if (!pastedText.trim()) throw new Error(t.pasteTextBeforeIndexing);
        uploadedDocument = await indexDocument({ text: pastedText, title });
      }

      setNotice(`${t.indexedDocument} "${uploadedDocument.title}".`);
      setFile(null);
      setTitle("");
      setPastedText("");
    } catch (requestError) {
      setError(getDocumentUploadError(requestError));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(documentId: string) {
    setDeletingId(documentId);
    setError(null);
    setNotice(null);

    try {
      if (!sessionId) throw new Error(t.sessionNotReady);
      if (isAuthenticated && !activeFolderId) {
        throw new Error(t.openFolderBeforeDeleting);
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
      setNotice(t.documentRemoved);
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
      setError(t.openChatBeforeAsking);
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
        contextAction?: ChatContextAction;
      }>(response);

      setTurns((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          question: nextQuestion,
          answer: payload.answer,
          citations: payload.citations,
          language: responseLanguage,
          contextAction: payload.contextAction,
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
                    chat.title === t.newChatTitle || chat.title === "New chat"
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
      setError(t.copyFailed);
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
      setNotice(copy.account.signedOut);
    } catch (requestError) {
      setError(getClientError(requestError));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleCreateFolder() {
    const name = window.prompt(t.folderNamePrompt, t.newFolder);
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
    const name = window.prompt(t.renameFolderPrompt, folder.name);
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
        `${copy.common.delete} "${folder.name}" ${t.deleteFolderConfirmSuffix}`,
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
    const title = window.prompt(t.renameChatPrompt, chat.title);
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
        `${copy.common.delete} "${chat.title}" ${t.deleteChatConfirmSuffix}`,
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
    setIsMobileSidebarOpen(false);
  }

  async function handleChatDocumentFile(nextFile: File) {
    setError(null);
    setNotice(null);

    if (!isSupportedDocumentFile(nextFile)) {
      setError(t.chooseFile);
      return;
    }

    if (!validateUploadFileSize(nextFile)) return;

    setUploadingChatAttachment(true);

    try {
      const uploadedDocument = await indexDocument({
        file: nextFile,
        title: nextFile.name,
      });
      setNotice(
        `${t.addedToFolder} "${uploadedDocument.title}" ${t.addedToFolderSuffix}`,
      );
    } catch (requestError) {
      setError(getDocumentUploadError(requestError));
    } finally {
      setUploadingChatAttachment(false);
    }
  }

  function handleContextualUploadClick() {
    contextualUploadInputRef.current?.click();
  }

  function handleContextualUploadChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!nextFile) return;

    void handleChatDocumentFile(nextFile);
  }

  async function handlePastedChatContext(text: string) {
    setError(null);
    setNotice(null);
    setUploadingChatAttachment(true);

    try {
      const uploadedDocument = await indexDocument({
        text,
        title: t.pastedDocumentContext,
      });
      setNotice(
        `${t.addedToFolder} "${uploadedDocument.title}" ${t.addedToFolderSuffix}`,
      );
    } catch (requestError) {
      setError(getClientError(requestError));
    } finally {
      setUploadingChatAttachment(false);
    }
  }

  async function handleVoiceButtonClick() {
    if (voiceState === "recording") {
      await stopVoiceRecording();
      return;
    }

    if (voiceState !== "idle") return;
    await startVoiceInput();
  }

  async function startVoiceInput() {
    if (asking || uploadingChatAttachment) return;
    if (isAuthenticated && !activeChatId) {
      setError(t.openChatBeforeAsking);
      return;
    }
    if (!isAuthenticated && !sessionId) {
      setError(t.sessionNotReady);
      return;
    }

    setError(null);
    setNotice(null);

    try {
      const recorder = await startWavRecording();
      voiceRecorderRef.current = recorder;
      setVoiceState("recording");

      clearVoiceRecordingTimer();
      voiceRecordingTimerRef.current = window.setTimeout(() => {
        void stopVoiceRecording();
      }, MAX_VOICE_RECORDING_SECONDS * 1000);
    } catch (recordingError) {
      setVoiceState("idle");
      setError(getVoiceStartErrorMessage(recordingError));
    }
  }

  async function stopVoiceRecording() {
    const recorder = voiceRecorderRef.current;
    if (!recorder) {
      setVoiceState("idle");
      return;
    }

    voiceRecorderRef.current = null;
    clearVoiceRecordingTimer();
    setVoiceState("transcribing");
    setError(null);
    setNotice(null);

    try {
      const audio = await recorder.stop();
      if (audio.size > MAX_VOICE_AUDIO_BYTES) {
        throw new Error(t.voiceTooLarge);
      }

      const formData = new FormData();
      formData.append("audio", audio, "voice.wav");

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });
      const payload = await readPayload<{ text: string }>(response);
      const transcription = payload.text.trim();

      if (!transcription) {
        throw new VoiceRecorderError(t.voiceNoSpeech);
      }

      setQuestion((current) =>
        current.trim()
          ? `${current.trimEnd()}\n${transcription}`
          : transcription,
      );
    } catch (transcriptionError) {
      setError(getVoiceTranscriptionErrorMessage(transcriptionError));
    } finally {
      setVoiceState("idle");
    }
  }

  function handleQuestionPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (uploadingChatAttachment) return;

    const pastedFile = getPastedDocumentFile(event.clipboardData);
    if (pastedFile.file) {
      event.preventDefault();
      void handleChatDocumentFile(pastedFile.file);
      return;
    }

    if (pastedFile.inaccessibleFile) {
      event.preventDefault();
      setNotice(null);
      setError(t.pastedFileError);
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

    const nextFile = [...event.dataTransfer.files].find(isSupportedDocumentFile);
    if (!nextFile) {
      setError(t.chooseFile);
      return;
    }

    void handleChatDocumentFile(nextFile);
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

  function handleMobileFolderSelect(folderId: string) {
    setActiveFolderId(folderId);
    setIsMobileFoldersOpen(false);
  }

  function renderAccountControl(compact = false) {
    return (
      <div className="shrink-0">
        {isAuthenticated ? (
          <details className="group/account relative">
            <summary
              className={cn(
                "flex cursor-pointer list-none items-center gap-2 rounded-2xl border border-border/80 bg-card/80 text-sm font-medium shadow-sm outline-none transition-all hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden",
                compact ? "h-10 px-2.5" : "px-3 py-2",
              )}
            >
              <span
                className={cn(
                  "truncate",
                  compact ? "max-w-[6.5rem]" : "max-w-32 sm:max-w-48",
                )}
              >
                {accountLabel}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open/account:rotate-180" />
            </summary>
            <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-52 rounded-2xl border border-border/80 bg-card p-2 shadow-[var(--shadow-soft)]">
              <Button
                asChild
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start"
              >
                <Link href="/profile">
                  <Settings className="h-4 w-4" />
                  {copy.account.accountSettings}
                </Link>
              </Button>
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
                {copy.account.signOut}
              </Button>
            </div>
          </details>
        ) : (
          <Button
            asChild
            variant="outline"
            size="sm"
            className={cn(compact && "h-10 px-3")}
          >
            <Link href="/auth">
              <LogIn className="h-4 w-4" />
              {copy.account.signIn}
            </Link>
          </Button>
        )}
      </div>
    );
  }

  function renderFolderPill(
    folder: FolderItem,
    options: { compact?: boolean; showActions?: boolean } = {},
  ) {
    const active = folder.id === activeFolderId;
    const { compact = false, showActions = true } = options;

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
          className={cn(
            "flex min-w-0 items-center gap-2 font-medium outline-none",
            compact ? "px-2.5 py-2 text-xs" : "px-3 py-2 text-sm",
          )}
          onClick={() =>
            compact
              ? handleMobileFolderSelect(folder.id)
              : setActiveFolderId(folder.id)
          }
        >
          <Folder className="h-4 w-4 shrink-0" />
          <span className={cn("truncate", compact ? "max-w-24" : "max-w-40")}>
            {folder.name}
          </span>
        </button>
        {active && showActions ? (
          <span className="mr-1 flex items-center gap-0.5">
            <button
              type="button"
              className="rounded-lg p-1 opacity-80 outline-none transition hover:bg-background/20 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
              title={`${copy.common.edit} ${folder.name}`}
              onClick={() => void handleRenameFolder(folder)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="rounded-lg p-1 opacity-80 outline-none transition hover:bg-background/20 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
              title={`${copy.common.delete} ${folder.name}`}
              onClick={() => void handleDeleteFolder(folder)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </span>
        ) : null}
      </div>
    );
  }

  function renderDesktopFoldersNav() {
    return (
      <nav
        aria-label={t.foldersLabel}
        className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1"
      >
        {isAuthenticated ? (
          <>
            {loadingWorkspace ? (
              <Badge variant="secondary" className="shrink-0 gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t.loadingFolders}
              </Badge>
            ) : folders.length === 0 ? (
              <Badge variant="outline" className="shrink-0">
                {t.noFolders}
              </Badge>
            ) : (
              folders.map((folder) => renderFolderPill(folder))
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => void handleCreateFolder()}
            >
              <FolderPlus className="h-4 w-4" />
              {t.newFolder}
            </Button>
          </>
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <Badge variant="outline" className="shrink-0">
              {t.guestMode}
            </Badge>
            <span className="hidden truncate text-xs text-muted-foreground md:inline">
              {t.guestNotice}
            </span>
          </div>
        )}
      </nav>
    );
  }

  function renderMobileFoldersNav() {
    return (
      <nav
        aria-label={t.foldersLabel}
        className="relative flex min-w-0 flex-1 justify-center"
      >
        {isAuthenticated ? (
          <div className="flex min-w-0 flex-1 justify-center">
            {loadingWorkspace ? (
              <Badge variant="secondary" className="shrink-0 gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t.loadingFolders}
              </Badge>
            ) : folders.length === 0 ? (
              <div className="flex min-w-0 items-center gap-1.5">
                <Badge variant="outline" className="shrink-0">
                  {t.noFolders}
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-2xl"
                  aria-label={t.newFolder}
                  onClick={() => void handleCreateFolder()}
                >
                  <FolderPlus className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="relative min-w-0 shrink">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 max-w-[min(46vw,13rem)] rounded-2xl px-3"
                  aria-label={t.foldersLabel}
                  aria-expanded={isMobileFoldersOpen}
                  onClick={() =>
                    setIsMobileFoldersOpen((current) => !current)
                  }
                >
                  <Folder className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 truncate">
                    {(activeFolder ?? folders[0])?.name}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform",
                      isMobileFoldersOpen && "rotate-180",
                    )}
                  />
                </Button>
                {isMobileFoldersOpen ? (
                  <div className="absolute left-0 top-[calc(100%+0.5rem)] z-50 max-h-72 w-[min(88vw,20rem)] min-w-full overflow-y-auto rounded-2xl border border-border/80 bg-card p-2 shadow-[var(--shadow-soft)]">
                    <div className="space-y-1">
                      {folders.map((folder) => {
                        const active = folder.id === activeFolderId;

                        return (
                          <button
                            key={folder.id}
                            type="button"
                            className={cn(
                              "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring",
                              active && "bg-primary text-primary-foreground",
                            )}
                            onClick={() => handleMobileFolderSelect(folder.id)}
                          >
                            <Folder className="h-4 w-4 shrink-0" />
                            <span className="truncate">{folder.name}</span>
                          </button>
                        );
                      })}
                    </div>
                    <Separator className="my-2" />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => {
                        setIsMobileFoldersOpen(false);
                        void handleCreateFolder();
                      }}
                    >
                      <FolderPlus className="h-4 w-4" />
                      {t.newFolder}
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : (
          <Badge variant="outline" className="shrink-0">
            {t.guestMode}
          </Badge>
        )}
      </nav>
    );
  }

  function renderSidebarContent({
    collapsed = false,
    mobile = false,
  }: {
    collapsed?: boolean;
    mobile?: boolean;
  } = {}) {
    const idPrefix = mobile ? "mobile" : "desktop";

    if (collapsed) {
      return (
        <div className="flex items-center gap-2 lg:flex-col">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t.expandDocuments}
            aria-expanded={false}
            title={t.expandDocuments}
            onClick={() => setIsSidebarCollapsed(false)}
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
          <Badge variant="secondary" className="gap-1">
            <FileText className="h-3 w-3" />
            <span>{readyDocuments.length}</span>
            <span className="lg:hidden">{t.ready}</span>
          </Badge>
          {selectedDocumentIds.length > 0 ? (
            <Badge variant="outline" className="gap-1">
              <span>{selectedDocumentIds.length}</span>
              <span className="lg:hidden">{t.selected}</span>
            </Badge>
          ) : null}
          {isAuthenticated ? (
            <Badge variant="outline" className="gap-1">
              <MessageSquare className="h-3 w-3" />
              <span>{visibleChats.length}</span>
              <span className="lg:hidden">{t.chats}</span>
            </Badge>
          ) : null}
        </div>
      );
    }

    return (
      <>
        <form onSubmit={handleUpload} className="animate-panel-in space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="text-sm font-semibold">{t.documents}</h2>
              <Badge variant="secondary">
                {readyDocuments.length} {t.ready}
              </Badge>
            </div>
            {!mobile ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t.collapseDocuments}
                aria-expanded
                title={t.collapseDocuments}
                onClick={() => setIsSidebarCollapsed(true)}
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            ) : null}
          </div>

          <Tabs
            value={uploadMode}
            onValueChange={(value) => setUploadMode(value as UploadMode)}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="file">
                <Upload className="mr-2 h-4 w-4" />
                {t.upload}
              </TabsTrigger>
              <TabsTrigger value="text">
                <FileText className="mr-2 h-4 w-4" />
                {t.paste}
              </TabsTrigger>
            </TabsList>

            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-document-title`}>{t.title}</Label>
              <Input
                id={`${idPrefix}-document-title`}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t.titlePlaceholder}
                disabled={documentControlsDisabled}
              />
            </div>

            <TabsContent value="file">
              <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-document-file`}>{t.file}</Label>
                <label
                  htmlFor={`${idPrefix}-document-file`}
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
                      {file ? t.changeFile : t.selectFile}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {file
                        ? `${file.name} - ${formatBytes(file.size)}`
                        : t.fileHint}
                    </span>
                  </span>
                </label>
                <input
                  id={`${idPrefix}-document-file`}
                  type="file"
                  accept={DOCUMENT_FILE_ACCEPT}
                  disabled={documentControlsDisabled}
                  className="sr-only"
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0] ?? null;

                    if (nextFile && !validateUploadFileSize(nextFile)) {
                      event.target.value = "";
                      setFile(null);
                      return;
                    }

                    setError(null);
                    setFile(nextFile);
                  }}
                />
              </div>
            </TabsContent>

            <TabsContent value="text">
              <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-document-text`}>{t.text}</Label>
                <Textarea
                  id={`${idPrefix}-document-text`}
                  value={pastedText}
                  onChange={(event) => setPastedText(event.target.value)}
                  placeholder={t.textPlaceholder}
                  disabled={documentControlsDisabled}
                />
              </div>
            </TabsContent>
          </Tabs>

          {uploading ? (
            <div className="space-y-2">
              <Progress value={66} />
              <p className="text-xs text-muted-foreground">
                {file && isImageFile(file) ? t.indexingImageContext : t.indexingContext}
              </p>
            </div>
          ) : null}

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
            {t.indexDocument}
          </Button>
        </form>

        <Separator className="my-5" />

        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">{t.indexedFiles}</h2>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={readyDocuments.length === 0}
              onClick={selectAllReadyDocuments}
            >
              {t.selectAll}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={selectedDocumentIds.length === 0}
              onClick={clearDocumentSelection}
            >
              {t.clear}
            </Button>
          </div>
        </div>

        <ScrollArea
          className={cn("mt-3 pr-3", isDocumentsExpanded && "h-48")}
        >
          <div className="space-y-2">
            {loadingDocuments ? (
              <DocumentState icon={Loader2} text={t.loadingDocuments} spin />
            ) : documents.length === 0 ? (
              <DocumentState icon={FileText} text={t.noDocuments} />
            ) : (
              visibleDocuments.map((document) => (
                <Card
                  key={document.id}
                  className="p-3 shadow-none hover:-translate-y-0.5 hover:shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <input
                      aria-label={`${t.selectAll} ${document.title}`}
                      type="checkbox"
                      checked={selectedDocumentIds.includes(document.id)}
                      disabled={document.status !== "ready"}
                      onChange={() => toggleDocument(document.id)}
                      className="mt-1 h-4 w-4 rounded border-border accent-[var(--accent)] transition-transform duration-200 checked:scale-105"
                    />
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p
                        className="max-w-full truncate text-sm font-medium"
                        title={document.title}
                      >
                        {document.title}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {document.source_type.toUpperCase()}
                        </Badge>
                        <StatusBadge
                          status={document.status}
                          labels={{
                            ready: t.statusReady,
                            failed: t.statusFailed,
                            indexing: t.statusIndexing,
                          }}
                        />
                        <span className="text-xs text-muted-foreground">
                          {document.chunk_count} {t.chunks}
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
                      className="shrink-0"
                      title={`${copy.common.delete} ${document.title}`}
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
              ? t.showFewerDocuments
              : `${t.showMoreDocuments} (${hiddenDocumentCount})`}
          </Button>
        ) : null}

        <Separator className="my-5" />

        <section className="animate-panel-in min-h-0 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">{t.chatsTitle}</h2>
              <p className="text-xs text-muted-foreground">
                {isAuthenticated
                  ? (activeFolder?.name ?? t.noFolderSelected)
                  : t.temporaryGuestChat}
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
                {t.newChat}
              </Button>
            ) : null}
          </div>

          {isAuthenticated ? (
            <>
              <ScrollArea
                className={cn("pr-2", isChatsExpanded ? "h-64" : "max-h-48")}
              >
                <div className="space-y-2">
                  {loadingWorkspace ? (
                    <DocumentState icon={Loader2} text={t.loadingChats} spin />
                  ) : visibleChats.length === 0 ? (
                    <DocumentState icon={MessageSquare} text={t.noChats} />
                  ) : (
                    visibleSidebarChats.map((chat) => (
                      <div
                        key={chat.id}
                        className={cn(
                          "rounded-2xl border border-border/75 bg-background/60 p-2 shadow-sm transition-colors",
                          chat.id === activeChatId && "bg-secondary",
                        )}
                      >
                        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full min-w-0 justify-start overflow-hidden px-2"
                            title={getChatDisplayTitle(
                              chat.title,
                              t.newChatTitle,
                            )}
                            onClick={() => handleOpenChat(chat)}
                          >
                            <MessageSquare className="h-4 w-4 shrink-0" />
                            <span className="block min-w-0 max-w-full truncate">
                              {getChatDisplayTitle(chat.title, t.newChatTitle)}
                            </span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0"
                            title={`${copy.common.edit} ${chat.title}`}
                            onClick={() => void handleRenameChat(chat)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0"
                            title={`${copy.common.delete} ${chat.title}`}
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
                    ? t.showFewerChats
                    : `${t.showMoreChats} (${hiddenChatCount})`}
                </Button>
              ) : null}
            </>
          ) : (
            <div className="rounded-2xl border border-border/80 bg-background/65 p-3 text-xs leading-5 text-muted-foreground shadow-sm">
              {t.guestChatNotice}
            </div>
          )}
        </section>
      </>
    );
  }

  if (!sessionReady || !authChecked) {
    return (
      <main className="min-h-dvh bg-background text-foreground lg:h-dvh">
        <div className="grid min-h-dvh w-full gap-0 lg:h-dvh lg:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="border-b border-border/80 bg-card/80 lg:border-b-0 lg:border-r">
            <div className="flex h-full flex-col p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                  <AnswerDocsLogo className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold tracking-tight">
                    AnswerDocs
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {t.savedWorkspace}
                  </p>
                </div>
              </div>
              <Separator className="my-5" />
              <div className="animate-panel-in flex items-center gap-2 rounded-2xl border border-dashed border-border/90 bg-card/70 px-3 py-4 text-sm text-muted-foreground shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t.preparingChat}
              </div>
            </div>
          </aside>
          <section className="flex min-h-[60dvh] items-center justify-center p-5 lg:min-h-0">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-accent-foreground" />
              {t.preparingWorkspace}
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="h-dvh overflow-hidden bg-background text-foreground">
      <div className="grid h-dvh w-full grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <header className="z-20 flex min-h-14 items-center gap-2 border-b border-border/80 bg-background/90 px-2.5 py-2 shadow-[var(--shadow-subtle)] backdrop-blur lg:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-2xl"
            aria-label={t.openMenu}
            aria-expanded={isMobileSidebarOpen}
            onClick={() => setIsMobileSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {renderMobileFoldersNav()}
          {renderAccountControl(true)}
        </header>

        <header
          className={cn(
            "z-20 hidden border-b border-border/80 bg-background/90 shadow-[var(--shadow-subtle)] backdrop-blur transition-[grid-template-columns] duration-300 ease-out lg:grid lg:min-h-16",
            isSidebarCollapsed
              ? "lg:grid-cols-[72px_minmax(0,1fr)]"
              : "lg:grid-cols-[380px_minmax(0,1fr)]",
          )}
        >
          <div
            className={cn(
              "flex items-center border-r border-border/80 bg-card/80 px-3 py-2 sm:px-5",
              isSidebarCollapsed && "lg:justify-center lg:px-3",
            )}
          >
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2 rounded-2xl px-1 py-1 outline-none transition-colors hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                <AnswerDocsLogo className="h-4 w-4" />
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
            {renderDesktopFoldersNav()}
            {renderAccountControl()}
          </div>
        </header>

        <div
          className={cn(
            "relative flex h-full min-h-0 w-full overflow-hidden transition-[grid-template-columns] duration-300 ease-out lg:grid lg:grid-rows-none",
            isSidebarCollapsed
              ? "lg:grid-cols-[72px_minmax(0,1fr)]"
              : "lg:grid-cols-[380px_minmax(0,1fr)]",
          )}
        >
          <aside className="hidden min-w-0 overflow-hidden border-r border-border/80 bg-card/80 shadow-none lg:block">
            <div
              className={cn(
                "flex h-full min-h-0 flex-col p-5 transition-all duration-300 ease-out",
                isSidebarCollapsed && "p-3",
              )}
            >
              {renderSidebarContent({ collapsed: isSidebarCollapsed })}
            </div>
          </aside>

          {isMobileSidebarOpen ? (
            <div
              className="fixed inset-0 z-40 lg:hidden"
              role="dialog"
              aria-modal="true"
              aria-label={t.documents}
            >
              <button
                type="button"
                className="absolute inset-0 bg-foreground/20 backdrop-blur-[2px]"
                aria-label={t.closeMenu}
                onClick={() => setIsMobileSidebarOpen(false)}
              />
              <aside className="animate-panel-in relative flex h-full w-[min(88vw,24rem)] flex-col overflow-hidden border-r border-border/80 bg-card shadow-[var(--shadow-soft)]">
                <div className="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                      <AnswerDocsLogo className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        AnswerDocs
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t.documents}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t.closeMenu}
                    onClick={() => setIsMobileSidebarOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  {renderSidebarContent({ mobile: true })}
                </div>
              </aside>
            </div>
          ) : null}

          <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <header className="border-b border-border/80 bg-background/70 px-3 py-3 sm:px-5 sm:py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold tracking-tight sm:text-xl">
                  {activeChat && isSidebarCollapsed
                    ? getChatDisplayTitle(activeChat.title, t.newChatTitle)
                    : t.askDocuments}
                </h2>
                <p className="truncate text-xs text-muted-foreground sm:text-sm">
                  {selectedDocumentIds.length > 0
                    ? `${selectedDocumentIds.length} ${t.selected}`
                    : readyDocuments.length > 0
                      ? t.selectDocuments
                      : isAuthenticated
                        ? t.noFolderDocuments
                        : t.noContext}
                </p>
              </div>
              <Badge variant="secondary" className="hidden shrink-0 sm:inline-flex">
                {isAuthenticated ? t.savedWorkspace : t.guestWorkspace}
              </Badge>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col p-3 sm:p-5">
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
                <div className="animate-panel-in mb-4 flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/90 bg-card/70 px-4 py-8 text-center shadow-[var(--shadow-subtle)] sm:mb-5 sm:py-10">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-accent-foreground shadow-sm">
                    <MessageSquare className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium">{t.noQuestions}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t.emptyAnswers}
                  </p>
                </div>
              ) : (
                <ScrollArea className="min-h-0 flex-1 pr-1 sm:pr-3">
                  <div className="flex min-h-full flex-col justify-end gap-3 pb-1 sm:gap-4">
                    {turns.map((turn) => (
                      <article
                        key={turn.id}
                        className="animate-message-in flex flex-col gap-3"
                      >
                        <div className="group/message ml-auto flex max-w-[92%] flex-col items-end gap-1 sm:max-w-[76%]">
                          <div className="min-w-0 rounded-3xl rounded-br-lg bg-primary px-3.5 py-2.5 text-primary-foreground shadow-sm sm:px-4 sm:py-3">
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

                        <div className="group/message mr-auto max-w-full rounded-3xl rounded-bl-lg border border-border/80 bg-card/85 p-3.5 text-card-foreground shadow-[var(--shadow-subtle)] sm:max-w-[86%] sm:p-4">
                          <div className="flex items-start gap-2.5 sm:gap-3">
                            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                              <AnswerDocsLogo className="h-4 w-4" />
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

                          {turn.contextAction === "upload_document" ? (
                            <div className="mt-3">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={
                                  documentControlsDisabled ||
                                  uploadingChatAttachment
                                }
                                onClick={handleContextualUploadClick}
                              >
                                {uploadingChatAttachment ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Upload className="h-4 w-4" />
                                )}
                                {t.uploadContextAction}
                              </Button>
                            </div>
                          ) : null}

                          {turn.citations.length > 0 ? (
                            <details className="group mt-4 rounded-2xl border border-border/80 bg-background/55 shadow-sm transition-all duration-200 open:bg-background/75">
                              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                                <Quote className="h-4 w-4 text-accent-foreground" />
                                {t.viewReferences} ({turn.citations.length})
                                <ChevronDown className="ml-auto h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
                              </summary>
                              <div className="references-panel grid gap-3 border-t border-border/80 p-3 md:grid-cols-2">
                                {turn.citations.map((citation) => {
                                  const sourceType =
                                    getCitationSourceType(citation);

                                  return (
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
                                            {sourceType === "image"
                                              ? `${t.imageTextBlock} ${citation.chunkIndex + 1}`
                                              : citation.pageNumber
                                                ? `${t.page} ${citation.pageNumber} - ${t.block} ${citation.chunkIndex + 1}`
                                                : `${t.textBlock} ${citation.chunkIndex + 1}`}
                                          </p>
                                        </div>
                                      </div>
                                      <p className="mt-3 max-h-44 overflow-y-auto whitespace-pre-wrap pr-2 text-xs leading-5 text-muted-foreground">
                                        {citation.snippet}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            </details>
                          ) : null}
                        </div>
                      </article>
                    ))}

                    {asking ? (
                      <div className="animate-message-in mr-auto rounded-3xl rounded-bl-lg border border-border/80 bg-card/80 p-3.5 shadow-[var(--shadow-subtle)] sm:p-4">
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin text-accent-foreground" />
                          {t.retrieving}
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
                className={cn(
                  "min-w-0 shrink-0 space-y-3",
                  !isInitialChat && "mt-3 sm:mt-4",
                )}
              >
                <section
                  aria-label={t.composerLabel}
                  onDragEnter={handleChatDragEnter}
                  onDragOver={handleChatDragOver}
                  onDragLeave={handleChatDragLeave}
                  onDrop={handleChatDrop}
                  className={cn(
                    "relative w-full max-w-full overflow-hidden rounded-3xl border border-border/80 bg-card/85 shadow-[var(--shadow-soft)] transition-all duration-200 focus-within:border-ring/80 focus-within:ring-4 focus-within:ring-ring/10",
                    draggingChatFile &&
                      "border-primary bg-secondary shadow-[var(--shadow-soft)]",
                  )}
                >
                  <Search className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground sm:left-4" />
                  <Textarea
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={handleQuestionKeyDown}
                    onPaste={handleQuestionPaste}
                    placeholder={t.composerPlaceholder}
                    className="box-border min-h-[68px] max-w-full border-0 bg-transparent py-2.5 pl-9 pr-24 text-sm leading-6 shadow-none focus-visible:ring-0 sm:min-h-24 sm:py-3 sm:pl-11 sm:pr-40"
                    disabled={
                      asking ||
                      uploadingChatAttachment ||
                      voiceState === "transcribing" ||
                      (isAuthenticated ? !activeChatId : !sessionId)
                    }
                  />
                  {uploadingChatAttachment || voiceBusy ? (
                    <div className="absolute bottom-2 left-3.5 right-24 flex min-w-0 items-center gap-2 truncate text-xs text-muted-foreground sm:bottom-2.5 sm:left-4 sm:right-40">
                      {voiceState === "recording" ? (
                        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-destructive" />
                      ) : (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent-foreground" />
                      )}
                      <span className="truncate">
                        {uploadingChatAttachment
                          ? t.indexingContext
                          : voiceState === "recording"
                            ? t.voiceRecording
                            : t.voiceTranscribing}
                      </span>
                    </div>
                  ) : null}
                  <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 sm:gap-1.5 sm:right-2.5">
                    <Button
                      type="button"
                      variant={voiceState === "recording" ? "secondary" : "ghost"}
                      size="icon"
                      className={cn(
                        "h-8 w-8 shrink-0 sm:h-8 sm:w-8",
                        voiceState === "recording" && "text-destructive",
                      )}
                      aria-label={
                        voiceState === "recording"
                          ? t.stopVoiceInput
                          : t.startVoiceInput
                      }
                      title={
                        voiceState === "recording"
                          ? t.stopVoiceInput
                          : t.startVoiceInput
                      }
                      disabled={
                        voiceState === "transcribing" ||
                        asking ||
                        uploadingChatAttachment ||
                        (isAuthenticated ? !activeChatId : !sessionId)
                      }
                      onClick={() => void handleVoiceButtonClick()}
                    >
                      {voiceState === "transcribing" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : voiceState === "recording" ? (
                        <Square className="h-3.5 w-3.5 fill-current" />
                      ) : (
                        <Mic className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      type="submit"
                      size="icon"
                      className="h-8 w-8 shrink-0 px-0 sm:w-auto sm:px-4"
                      disabled={!canSubmitQuestion}
                      aria-label={t.ask}
                      title={t.ask}
                    >
                      {asking ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      <span className="hidden sm:inline">{t.ask}</span>
                    </Button>
                  </div>
                  {draggingChatFile ? (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-3xl bg-background/85 text-sm font-medium text-foreground backdrop-blur-sm">
                      {t.dropDocument}
                    </div>
                  ) : null}
                </section>
                <input
                  ref={contextualUploadInputRef}
                  type="file"
                  accept={DOCUMENT_FILE_ACCEPT}
                  disabled={documentControlsDisabled || uploadingChatAttachment}
                  className="sr-only"
                  onChange={handleContextualUploadChange}
                />
              </form>
            </div>
          </div>
        </section>
        </div>
      </div>
    </main>
  );
}

function StatusBadge({
  status,
  labels,
}: {
  status: DocumentItem["status"];
  labels: { ready: string; failed: string; indexing: string };
}) {
  if (status === "ready") {
    return <Badge>{labels.ready}</Badge>;
  }

  if (status === "failed") {
    return <Badge variant="destructive">{labels.failed}</Badge>;
  }

  return <Badge variant="secondary">{labels.indexing}</Badge>;
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

function getAccountLabel(
  profile: ProfileItem | null,
  user: AuthUser | null,
  fallback: string,
) {
  const name = profile?.full_name.trim();
  if (name) return name;
  if (user?.email) return user.email;
  return fallback;
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

function getChatDisplayTitle(title: string, fallback: string) {
  return title === "New chat" ? fallback : title;
}

function getCitationSourceType(citation: CitationItem): SourceType {
  if (citation.sourceType) return citation.sourceType;
  return resolveImageMimeType({
    filename: citation.documentTitle,
  })
    ? "image"
    : "text";
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isTextFile(file: File) {
  const lowerName = file.name.toLowerCase();
  return file.type === "text/plain" || lowerName.endsWith(".txt");
}

function isImageFile(file: File) {
  return Boolean(
    resolveImageMimeType({
      mimeType: file.type,
      filename: file.name,
    }),
  );
}

function isSupportedDocumentFile(file: File) {
  return isPdfFile(file) || isTextFile(file) || isImageFile(file);
}

function getPastedDocumentFile(clipboardData: DataTransfer) {
  const files = [...clipboardData.files];
  const fileListDocument = files.find(isSupportedDocumentFile);

  if (fileListDocument) {
    return { file: fileListDocument, inaccessibleFile: false };
  }

  let inaccessibleFile = false;

  for (const item of [...clipboardData.items]) {
    if (item.kind !== "file") continue;

    const file = item.getAsFile();
    if (file && isSupportedDocumentFile(file)) {
      return { file, inaccessibleFile: false };
    }

    if (!file && isDocumentClipboardItem(item)) {
      inaccessibleFile = true;
    }
  }

  return { file: null, inaccessibleFile };
}

function isDocumentClipboardItem(item: DataTransferItem) {
  return (
    item.type === "application/pdf" ||
    item.type === "text/plain" ||
    item.type.startsWith("image/") ||
    item.type === ""
  );
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

function isMicrophonePermissionError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError" ||
      error.name === "SecurityError")
  );
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
