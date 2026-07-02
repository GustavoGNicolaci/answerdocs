const SYSTEM_NAME_PATTERN = /\b(answerdocs|this app|the app|this chat|the chat|system|workspace)\b/;

export function getSystemHelpAnswer(question: string) {
  const normalized = question.trim().toLowerCase();
  if (!normalized) return null;

  if (asksAboutUploading(normalized)) {
    return "You can add context by uploading a PDF or .txt file from the document panel, dragging a PDF into the chat, pasting a PDF into the chat, or pasting longer text directly into the chat.";
  }

  if (asksAboutCitations(normalized)) {
    return "When document context is available, AnswerDocs answers only from retrieved snippets and shows up to three references with the file name, page or text block, and the supporting snippet.";
  }

  if (asksAboutScope(normalized)) {
    return "This chat uses only selected ready documents and pasted context from the current browser-tab session. Documents that are available but not selected are not used.";
  }

  if (asksAboutPurpose(normalized)) {
    return "AnswerDocs is a RAG workspace for asking grounded questions over uploaded PDFs, text files, and pasted chat context.";
  }

  return null;
}

function asksAboutUploading(question: string) {
  return (
    /\b(how|can|where|what)\b.*\b(upload|attach|send|add|paste|drag|drop)\b/.test(
      question,
    ) ||
    /\b(upload|attach|send|add|paste|drag|drop)\b.*\b(pdf|file|document|text|context)\b/.test(
      question,
    ) ||
    /\b(supported|allowed)\b.*\b(file|files|format|formats)\b/.test(question)
  );
}

function asksAboutCitations(question: string) {
  return (
    SYSTEM_NAME_PATTERN.test(question) &&
    /\b(reference|references|citation|citations|source|sources)\b/.test(
      question,
    )
  );
}

function asksAboutScope(question: string) {
  return (
    SYSTEM_NAME_PATTERN.test(question) &&
    /\b(scope|context|session|selected|selection|documents|files|use|uses)\b/.test(
      question,
    )
  );
}

function asksAboutPurpose(question: string) {
  return (
    /\bwhat\b.*\b(answerdocs|this app|the app)\b/.test(question) ||
    /\bwhat can you do\b/.test(question) ||
    /\bhow\b.*\b(answerdocs|this app|the app|this chat)\b.*\b(work|works)\b/.test(
      question,
    )
  );
}
