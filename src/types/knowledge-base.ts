// ─── Knowledge Base Types ────────────────────────────────────────────────────

export interface KbCategory {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

export interface KbAttachment {
  id: string;
  fileName: string;
  fileType: string;
  mimeType: string;
  size: number;
  storagePath: string | null;
}

export interface KbArticle {
  id: string;
  categoryId: string;
  createdBy: string;
  subject: string;
  body: string;
  attachments: KbAttachment[];
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Joined from profiles */
  authorName: string | null;
  authorAvatarUrl: string | null;
  /** Joined from kb_categories */
  categoryName: string;
  /** Populated client-side */
  replies?: KbReply[];
  replyCount?: number;
}

export interface KbReply {
  id: string;
  articleId: string;
  createdBy: string;
  body: string;
  deletedAt: string | null;
  createdAt: string;
  /** Joined from profiles */
  authorName: string | null;
  authorAvatarUrl: string | null;
}
