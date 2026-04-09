import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { getToken } from "firebase/messaging";
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  ALLOWED_DOMAIN,
  auth,
  db,
  getMessagingIfSupported,
  isAllowedEmail,
  provider,
} from "./firebase";
import "./App.css";

const VIEW = {
  WELCOME: "welcome",
  LOGIN: "login",
  DASHBOARD: "dashboard",
};

const DASHBOARD_PAGE = {
  HOME: "home",
  DEPARTMENT: "department",
  CALENDAR: "calendar",
  FAQ: "faq",
  PROFILE: "profile",
  STARRED: "starred",
  REMINDERS: "reminders",
};

const FEED_TAB = {
  FEED: "feed",
  COMPLETED: "completed",
  PENDING: "pending",
};

const BOARDS = [
  {
    id: "cse",
    name: "Computer Science Engineering",
    shortName: "CSE",
    thumbnail:
      "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "cse-aiml",
    name: "CSE (AI & ML)",
    shortName: "CSE-AIML",
    thumbnail:
      "https://images.unsplash.com/photo-1555949963-aa79dcee981c?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "ece",
    name: "Electronics & Communication",
    shortName: "ECE",
    thumbnail:
      "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "eee",
    name: "Electrical & Electronics",
    shortName: "EEE",
    thumbnail:
      "https://images.unsplash.com/photo-1509395176047-4a66953fd231?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "it",
    name: "Information Technology",
    shortName: "IT",
    thumbnail:
      "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1200&q=80",
  },
];

const STUDENT_YEAR_BY_PREFIX = {
  "25": 1,
  "24": 2,
  "23": 3,
  "22": 4,
};

const STUDENT_DEPARTMENT_BY_LAST4_PREFIX = {
  "66": "CSE-AIML",
  "05": "CSE",
  "12": "IT",
  "04": "ECE",
  "02": "EEE",
};

const PRIORITY_RANK = {
  high: 1,
  medium: 2,
  low: 3,
};

const POST_TYPES = ["notice", "event", "hackathon", "workshop", "announcement", "achievement"];
const PRIORITY_OPTIONS = ["high", "medium", "low"];
const PRIORITY_TYPES = new Set(["notice", "hackathon", "workshop"]);
const STATUS_TAB_TYPES = new Set(["notice", "event", "hackathon", "workshop"]);
const POST_TYPE_DETAILS = {
  notice: {
    label: "Notices",
    description: "Circulars, alerts, and quick updates.",
    accent: "#0ea5e9",
    tint: "rgba(14,165,233,0.16)",
  },
  event: {
    label: "Events",
    description: "Talks, meets, and campus activities.",
    accent: "#22c55e",
    tint: "rgba(34,197,94,0.16)",
  },
  hackathon: {
    label: "Hackathons",
    description: "Build, pitch, and compete together.",
    accent: "#f97316",
    tint: "rgba(249,115,22,0.16)",
  },
  workshop: {
    label: "Workshops",
    description: "Hands-on learning sessions.",
    accent: "#8b5cf6",
    tint: "rgba(139,92,246,0.16)",
  },
  announcement: {
    label: "Announcements",
    description: "Campus-wide highlights and news.",
    accent: "#6366f1",
    tint: "rgba(99,102,241,0.16)",
  },
  achievement: {
    label: "Achievements",
    description: "Wins, awards, and milestones.",
    accent: "#f59e0b",
    tint: "rgba(245,158,11,0.16)",
  },
};
const POST_TYPE_TILES = [
  {
    id: "all",
    label: "All Posts",
    description: "Everything in one clean view.",
    accent: "#3b82f6",
    tint: "rgba(59,130,246,0.16)",
  },
  ...POST_TYPES.map((type) => ({
    id: type,
    ...(POST_TYPE_DETAILS[type] || {
      label: type,
      description: "Latest updates from campus.",
      accent: "#3b82f6",
      tint: "rgba(59,130,246,0.16)",
    }),
  })),
];
const PRIORITY_FILTERS = [
  { id: "all", label: "All Priority" },
  ...PRIORITY_OPTIONS.map((priority) => ({
    id: priority,
    label: priority.charAt(0).toUpperCase() + priority.slice(1),
  })),
];
const YEAR_FILTERS = [
  { id: "all", label: "All Years" },
  { id: "1", label: "1st Year" },
  { id: "2", label: "2nd Year" },
  { id: "3", label: "3rd Year" },
  { id: "4", label: "4th Year" },
];
const MAX_UPLOAD_BYTES = 7 * 1024 * 1024;
const UPLOAD_IDLE_TIMEOUT_MS = 90000;
const UPLOAD_MAX_TIMEOUT_MS = 300000;
const PUBLISH_TIMEOUT_MS = 90000;
const COMPLETED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const FAQ_RECIPIENTS = [
  "Admin",
  "CSE Faculty",
  "CSE-AIML Faculty",
  "ECE Faculty",
  "EEE Faculty",
  "IT Faculty",
];
const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "";
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || "";
const CLOUDINARY_FOLDER = import.meta.env.VITE_CLOUDINARY_FOLDER || "";
const CLOUDINARY_OPTIMIZE_TRANSFORM = "f_auto,q_auto:good,w_1600,c_limit";
const LEGACY_GROUP_WINDOW_MS = 2 * 60 * 1000;

function parseEmailIdentity(email) {
  const localPart = (email || "").split("@")[0]?.toLowerCase() || "";
  const startsWithDigit = /^[0-9]/.test(localPart);

  if (startsWithDigit) {
    const prefix = localPart.slice(0, 2);
    const digits = localPart.replace(/\D/g, "");
    const last4 = digits.length >= 4 ? digits.slice(-4) : "";
    const deptPrefix = last4.slice(0, 2);
    return {
      role: "student",
      year: STUDENT_YEAR_BY_PREFIX[prefix] ?? null,
      department: STUDENT_DEPARTMENT_BY_LAST4_PREFIX[deptPrefix] ?? null,
      authorApproved: false,
    };
  }

  return {
    role: "faculty",
    year: null,
    department: null,
    authorApproved: true,
  };
}

function getBoardShortName(boardId) {
  const board = BOARDS.find((item) => item.id === boardId);
  return board?.shortName || "";
}

function getBoardIdForDepartment(department) {
  const normalized = String(department || "").trim().toLowerCase();
  if (!normalized) return "";
  const board = BOARDS.find(
    (item) =>
      item.id.toLowerCase() === normalized || item.shortName.toLowerCase() === normalized
  );
  return board?.id || "";
}

function getFacultyRecipientLabel(profile) {
  const dept = String(profile?.department || "").trim();
  if (!dept) return "";
  return `${dept} Faculty`;
}

function getAuthorDepartmentLabel(post, fallbackBoardId, currentProfile, currentUid) {
  if (!post) return "";
  if (post.authorDepartment) return post.authorDepartment;
  if (post.authorDept) return post.authorDept;
  if (post.authorBranch) return post.authorBranch;
  if (currentProfile?.department && post.authorUid && post.authorUid === currentUid) {
    return currentProfile.department;
  }
  const inferred = parseEmailIdentity(post.authorEmail || "");
  if (inferred.department) return inferred.department;
  return getBoardShortName(post.boardId || fallbackBoardId) || post.boardName || "";
}

function toStatusMessage(error, fallback) {
  const code = error?.code || "";
  const message = String(error?.message || "").toLowerCase();

  if (message.includes("image upload timed out")) {
    return "Image upload timed out. Try a smaller image or a stronger connection.";
  }
  if (message.includes("publishing timed out")) {
    return "Publishing timed out. Please retry once your connection is stable.";
  }
  if (code === "permission-denied") {
    return "You are signed in, but Firestore permissions are denying access.";
  }
  if (code === "cloudinary/config") {
    return "Cloudinary is not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to .env.";
  }
  if (code === "cloudinary/timeout") {
    return "Image upload timed out. Try a smaller image or a stronger connection.";
  }
  if (code === "cloudinary/unauthorized") {
    return "Cloudinary upload denied. Check your upload preset settings.";
  }
  if (code === "cloudinary/too-large") {
    return "Image is too large for Cloudinary. Please upload a smaller file.";
  }
  if (code === "cloudinary/network") {
    return "Network error while uploading image. Check your connection and try again.";
  }
  if (code === "cloudinary/canceled") {
    return "Upload canceled.";
  }
  if (code === "cloudinary/failed") {
    return "Image upload failed. Check Cloudinary preset and allowed formats.";
  }
  if (code === "deadline-exceeded") {
    return "Request timed out. Please try again with a smaller image or better network.";
  }
  if (message.includes("timed out")) {
    return "Request timed out. Please try again with a smaller image or better network.";
  }
  return error?.message || fallback;
}

function getPriorityRank(value) {
  return PRIORITY_RANK[value] || PRIORITY_RANK.medium;
}

function tokenizeText(value) {
  return Array.from(
    new Set(
      (value || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((token) => token.length > 1)
    )
  ).slice(0, 40);
}

function formatTimestamp(value) {
  if (!value) return "Just now";
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDateTimeLocal(value) {
  if (!value) return "";
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (input) => String(input).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDateLabel(date) {
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

function getDateKey(date) {
  if (!date || Number.isNaN(date.getTime())) return "";
  const pad = (input) => String(input).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${year}-${month}-${day}`;
}

function getInitials(value) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return "CC";
  const parts = cleaned.split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "CC";
}

function getOptimizedImageUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("res.cloudinary.com")) return url;

    const marker = "/image/upload/";
    const rawUrl = parsed.href;
    const markerIndex = rawUrl.indexOf(marker);
    if (markerIndex === -1) return url;

    const afterMarker = rawUrl.slice(markerIndex + marker.length);
    if (!afterMarker) return url;

    const firstSegment = afterMarker.split("/")[0];
    const hasTransform = (() => {
      if (!firstSegment || /^v\d+$/.test(firstSegment)) return false;
      const tokens = firstSegment.split(",");
      const knownKeys = new Set([
        "w",
        "h",
        "c",
        "q",
        "f",
        "dpr",
        "g",
        "ar",
        "x",
        "y",
        "z",
        "a",
        "b",
        "e",
        "t",
        "r",
        "bo",
        "l",
        "o",
        "d",
        "cs",
        "co",
        "dn",
        "fl",
        "fn",
        "pg",
      ]);
      return tokens.every((token) => {
        const [key] = token.split("_");
        return key && knownKeys.has(key);
      });
    })();

    if (hasTransform) return url;

    return `${rawUrl.slice(0, markerIndex + marker.length)}${CLOUDINARY_OPTIMIZE_TRANSFORM}/${afterMarker}`;
  } catch (error) {
    return url;
  }
}

function getPostMediaUrl(post) {
  if (!post || !Array.isArray(post.mediaUrls)) return "";
  const firstUrl = post.mediaUrls[0] || "";
  return getOptimizedImageUrl(firstUrl);
}

function isLikelyLink(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return true;
  return trimmed.includes(".");
}

function normalizeExternalLink(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function getPostContentAndLink(post) {
  const rawContent = String(post?.content || "");
  let link = String(post?.link || "").trim();
  if (!rawContent) {
    return { content: "", link };
  }
  const lines = rawContent.split(/\r?\n/);
  const cleaned = [];
  for (const line of lines) {
    const match = line.match(/^\s*Link:\s*(\S+)\s*$/i);
    if (match && isLikelyLink(match[1])) {
      if (!link) {
        link = match[1].trim();
      }
      continue;
    }
    cleaned.push(line);
  }
  const content = cleaned.join("\n").trim();
  return { content, link };
}

function renderPostBody(
  post,
  {
    contentClassName = "",
    linkClassName = "post-link",
    stopPropagation = false,
    emptyFallback = "",
  } = {}
) {
  const { content, link } = getPostContentAndLink(post);
  const normalizedLink = normalizeExternalLink(link);
  const handleLinkClick = stopPropagation ? (event) => event.stopPropagation() : undefined;
  const handleLinkKeyDown = stopPropagation ? (event) => event.stopPropagation() : undefined;
  const showFallback = !content && emptyFallback;
  return (
    <>
      {content && <p className={contentClassName || undefined}>{content}</p>}
      {showFallback && <p className={contentClassName || undefined}>{emptyFallback}</p>}
      {link && (
        <p className="post-link-row">
          <a
            className={linkClassName}
            href={normalizedLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleLinkClick}
            onKeyDown={handleLinkKeyDown}
          >
            {link}
          </a>
        </p>
      )}
    </>
  );
}

function getLocalStorageKey(prefix, uid) {
  if (!uid) return "";
  return `${prefix}:${uid}`;
}

function loadLocalStorageJson(key, fallback) {
  if (!key || typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (error) {
    return fallback;
  }
}

function saveLocalStorageJson(key, value) {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Ignore storage write failures.
  }
}

function getPostTimestampMs(post) {
  const rawDate = post?.createdAt || post?.updatedAt || null;
  if (!rawDate) return null;
  const date = rawDate?.toDate ? rawDate.toDate() : new Date(rawDate);
  if (Number.isNaN(date.getTime())) return null;
  return date.getTime();
}

function getDateValueMs(value) {
  if (!value) return null;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    if (Number.isNaN(date.getTime())) return null;
    return date.getTime();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getTime();
}

function getLegacyGroupKey(post) {
  const author = post?.authorUid || "author";
  const title = String(post?.title || "").trim().toLowerCase();
  const content = String(post?.content || "").trim().toLowerCase();
  const mediaUrl = Array.isArray(post?.mediaUrls) ? post.mediaUrls[0] || "" : "";
  const timestampMs = getPostTimestampMs(post);
  const bucket = timestampMs ? Math.floor(timestampMs / LEGACY_GROUP_WINDOW_MS) : "na";
  return `${author}::${title}::${content}::${mediaUrl}::${bucket}`;
}

function getPostGroupKey(post) {
  return post?.batchId || getLegacyGroupKey(post);
}

function createBatchId(user) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${user?.uid || "user"}_${Date.now()}_${suffix}`;
}

function isVisibleForYear(post, yearValue) {
  if (!yearValue) return true;
  if (Array.isArray(post.audienceYears) && post.audienceYears.length > 0) {
    return post.audienceYears.includes(yearValue);
  }
  if (typeof post.year === "number") {
    return post.year === yearValue;
  }
  return true;
}

function computeUrgencyScore(priority, deadlineAt) {
  const priorityRank = getPriorityRank(priority);
  const fallbackDeadline = 9999999999999;
  const deadlineMs = deadlineAt ? deadlineAt.getTime() : fallbackDeadline;
  return priorityRank * 10000000000000 + deadlineMs;
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timerId;
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      const error = new Error(timeoutMessage);
      error.code = "deadline-exceeded";
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([
    promise.finally(() => clearTimeout(timerId)),
    timeoutPromise,
  ]);
}

function uploadImageWithProgress(file, onProgress, idleTimeoutMs = UPLOAD_IDLE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
      const error = new Error("Cloudinary configuration is missing.");
      error.code = "cloudinary/config";
      reject(error);
      return;
    }

    const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    if (CLOUDINARY_FOLDER) {
      formData.append("folder", CLOUDINARY_FOLDER);
    }

    const xhr = new XMLHttpRequest();
    let idleTimerId = null;
    let maxTimerId = null;
    let settled = false;

    const clearTimers = () => {
      if (idleTimerId) clearTimeout(idleTimerId);
      if (maxTimerId) clearTimeout(maxTimerId);
    };

    const failUpload = (errorMessage, errorCode, shouldAbort = false) => {
      if (settled) return;
      settled = true;
      clearTimers();
      if (shouldAbort) {
        try {
          xhr.abort();
        } catch (error) {
          // Ignore abort errors.
        }
      }
      const error = new Error(errorMessage);
      if (errorCode) {
        error.code = errorCode;
      }
      reject(error);
    };

    const resetIdleTimer = () => {
      if (idleTimerId) clearTimeout(idleTimerId);
      idleTimerId = setTimeout(() => {
        failUpload("Image upload timed out", "cloudinary/timeout", true);
      }, idleTimeoutMs);
    };

    maxTimerId = setTimeout(() => {
      failUpload("Image upload timed out", "cloudinary/timeout", true);
    }, UPLOAD_MAX_TIMEOUT_MS);

    resetIdleTimer();

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      resetIdleTimer();
      const progress = Math.round((event.loaded / event.total) * 100);
      onProgress(progress);
    };

    xhr.onload = () => {
      if (settled) return;
      clearTimers();
      settled = true;

      let response = {};
      try {
        response = JSON.parse(xhr.responseText || "{}");
      } catch (error) {
        response = {};
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        const secureUrl = response?.secure_url;
        if (secureUrl) {
          onProgress(100);
          resolve(secureUrl);
          return;
        }
        const error = new Error(response?.error?.message || "Cloudinary did not return an image URL.");
        error.code = "cloudinary/failed";
        reject(error);
        return;
      }

      let errorCode = "cloudinary/failed";
      if (xhr.status === 401 || xhr.status === 403) {
        errorCode = "cloudinary/unauthorized";
      } else if (xhr.status === 413) {
        errorCode = "cloudinary/too-large";
      }
      const error = new Error(response?.error?.message || "Image upload failed.");
      error.code = errorCode;
      reject(error);
    };

    xhr.onerror = () => {
      if (settled) return;
      failUpload("Network error while uploading image.", "cloudinary/network");
    };

    xhr.onabort = () => {
      if (settled) return;
      failUpload("Upload canceled.", "cloudinary/canceled");
    };

    xhr.ontimeout = () => {
      if (settled) return;
      failUpload("Image upload timed out", "cloudinary/timeout");
    };

    xhr.open("POST", endpoint);
    xhr.timeout = UPLOAD_MAX_TIMEOUT_MS;
    xhr.send(formData);
  });
}

function isModerator(profile) {
  if (!profile) return false;
  return profile.role === "admin" || profile.role === "faculty";
}

function getTokenDocId(uid, token) {
  const safe = token.replace(/[^a-zA-Z0-9]/g, "").slice(0, 40);
  return `${uid}_${safe || "token"}`;
}

function getMessagingServiceWorkerUrl() {
  const params = new URLSearchParams({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
  });

  const hasMissingValue = Array.from(params.values()).some((value) => !value);
  if (hasMissingValue) return null;

  return `/firebase-messaging-sw.js?${params.toString()}`;
}

export default function App() {
  const [view, setView] = useState(VIEW.LOGIN);
  const [status, setStatus] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [authUser, setAuthUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [theme, setTheme] = useState("light");
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [dashboardPage, setDashboardPage] = useState(DASHBOARD_PAGE.HOME);
  const [selectedBoardId, setSelectedBoardId] = useState(BOARDS[0].id);
  const [activeTab, setActiveTab] = useState(FEED_TAB.FEED);
  const [posts, setPosts] = useState([]);
  const [completedPosts, setCompletedPosts] = useState([]);
  const [pendingPosts, setPendingPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [submittingPost, setSubmittingPost] = useState(false);
  const [approvingPostId, setApprovingPostId] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeFiles, setComposeFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pushRegistered, setPushRegistered] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterYear, setFilterYear] = useState("all");
  const [readStatsByPost, setReadStatsByPost] = useState({});
  const [activePost, setActivePost] = useState(null);
  const [activePostImageIndex, setActivePostImageIndex] = useState(0);
  const [starredPosts, setStarredPosts] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [reminderDraft, setReminderDraft] = useState({
    postId: "",
    title: "",
    date: "",
  });
  const [reminderOpen, setReminderOpen] = useState(false);
  const createFaqDraft = (overrides = {}) => ({
    recipient: FAQ_RECIPIENTS[0],
    recipientType: "group",
    recipientUid: "",
    recipientName: "",
    recipientEmail: "",
    question: "",
    relatedPostId: "",
    ...overrides,
  });
  const [faqDraft, setFaqDraft] = useState(() => createFaqDraft());
  const [faqItems, setFaqItems] = useState([]);
  const [faqLoading, setFaqLoading] = useState(false);
  const [faqReplyDrafts, setFaqReplyDrafts] = useState({});
  const [approvedAuthors, setApprovedAuthors] = useState([]);
  const [authorsLoading, setAuthorsLoading] = useState(false);
  const [authorSearch, setAuthorSearch] = useState("");
  const [selectedAuthorUid, setSelectedAuthorUid] = useState("");
  const [authorRoleFilter, setAuthorRoleFilter] = useState("all");
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [profilePhotoUploading, setProfilePhotoUploading] = useState(false);
  const [profilePhotoProgress, setProfilePhotoProgress] = useState(0);
  const [calendarCursor, setCalendarCursor] = useState(() => new Date());
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(null);
  const [authoredPosts, setAuthoredPosts] = useState([]);
  const [authoredPostGroups, setAuthoredPostGroups] = useState({});
  const [authoredLoading, setAuthoredLoading] = useState(false);
  const [editPost, setEditPost] = useState(null);
  const [editForm, setEditForm] = useState({
    title: "",
    content: "",
    priority: "medium",
    deadline: "",
  });
  const [composeForm, setComposeForm] = useState({
    title: "",
    content: "",
    type: "notice",
    priority: "medium",
    link: "",
    targetYear: "all",
    deadline: "",
    eventDate: "",
    targetMode: "specific",
    targetBoardId: BOARDS[0].id,
  });

  const starredLoadedRef = useRef(false);
  const remindersLoadedRef = useRef(false);
  const profileMenuRef = useRef(null);

  const selectedBoard = useMemo(
    () => BOARDS.find((board) => board.id === selectedBoardId) || BOARDS[0],
    [selectedBoardId]
  );
  const statusClass = useMemo(() => (isError ? "status error" : "status success"), [isError]);
  const canModerate = isModerator(userProfile);
  const isAdminUser = userProfile?.role === "admin";
  const canCreateGlobalPost = Boolean(userProfile?.role === "faculty" || userProfile?.role === "admin" || userProfile?.authorApproved === true);
  const isStudent = userProfile?.role === "student";
  const studentBoardId = useMemo(
    () => getBoardIdForDepartment(userProfile?.department),
    [userProfile?.department]
  );
  const visibleBoards = useMemo(() => {
    if (!isStudent) return BOARDS;
    if (!studentBoardId) return [];
    return BOARDS.filter((board) => board.id === studentBoardId);
  }, [isStudent, studentBoardId]);
  const canViewAuthorPosts = Boolean(
    userProfile?.role === "faculty" || userProfile?.role === "admin" || userProfile?.authorApproved === true
  );
  const canReplyFaq = Boolean(userProfile?.role === "faculty" || userProfile?.role === "admin");
  const faqLabel = isStudent ? "FAQs" : "Questions";
  const facultyRecipientLabel = useMemo(() => getFacultyRecipientLabel(userProfile), [userProfile]);
  const selectedAuthor = useMemo(
    () => approvedAuthors.find((author) => author.uid === selectedAuthorUid),
    [approvedAuthors, selectedAuthorUid]
  );
  const profileHandle = useMemo(() => {
    if (userProfile?.name) return userProfile.name;
    const handle = (email || "").split("@")[0];
    return handle || "Srijani Manneni";
  }, [email, userProfile]);
  const profileLabel = useMemo(() => {
    const displayName = userProfile?.name || "Srijani Manneni";
    return displayName;
  }, [userProfile]);
  const profilePhotoUrl = useMemo(
    () => userProfile?.photoUrl || authUser?.photoURL || "",
    [userProfile?.photoUrl, authUser?.photoURL]
  );

  const pageTitle = useMemo(() => {
    switch (dashboardPage) {
      case DASHBOARD_PAGE.HOME:
        return isStudent ? selectedBoard?.name || "Department Feed" : "Departments";
      case DASHBOARD_PAGE.DEPARTMENT:
        return selectedBoard?.name || "Department Feed";
      case DASHBOARD_PAGE.CALENDAR:
        return "Campus Calendar";
      case DASHBOARD_PAGE.FAQ:
        return faqLabel;
      case DASHBOARD_PAGE.PROFILE:
        return "My Profile";
      case DASHBOARD_PAGE.STARRED:
        return "Starred Posts";
      case DASHBOARD_PAGE.REMINDERS:
        return "Reminders";
      default:
        return "Dashboard";
    }
  }, [dashboardPage, selectedBoard, faqLabel, isStudent]);

  const calendarSourcePosts = useMemo(() => {
    const items = [...posts, ...completedPosts];
    if (canModerate) {
      items.push(...pendingPosts);
    }
    if (selectedAuthorUid) {
      return items.filter((post) => post.authorUid === selectedAuthorUid);
    }
    return items;
  }, [posts, completedPosts, pendingPosts, canModerate, selectedAuthorUid]);

  const calendarEvents = useMemo(() => {
    const map = new Map();
    const addEntry = (post, rawDate, dateType) => {
      if (!rawDate) return;
      const date = rawDate?.toDate ? rawDate.toDate() : new Date(rawDate);
      if (Number.isNaN(date.getTime())) return;
      const key = getDateKey(date);
      if (!key) return;
      const entry = {
        id: post.id,
        title: post.title || "Untitled",
        type: post.type || "notice",
        priority: post.priority || "medium",
        boardName: post.boardName || selectedBoard?.shortName || "",
        date,
        dateType,
      };
      const bucket = map.get(key) || [];
      bucket.push(entry);
      map.set(key, bucket);
    };
    calendarSourcePosts.forEach((post) => {
      addEntry(post, post.deadlineAt, "deadline");
      addEntry(post, post.eventAt, "event");
    });
    return map;
  }, [calendarSourcePosts, selectedBoard]);

  const calendarDays = useMemo(() => {
    const year = calendarCursor.getFullYear();
    const month = calendarCursor.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const offset = firstDay.getDay();
    const totalCells = Math.ceil((offset + lastDay.getDate()) / 7) * 7;
    return Array.from({ length: totalCells }, (_, index) => {
      const dayNumber = index - offset + 1;
      const date = new Date(year, month, dayNumber);
      return {
        date,
        inMonth: dayNumber >= 1 && dayNumber <= lastDay.getDate(),
      };
    });
  }, [calendarCursor]);

  const selectedCalendarKey = calendarSelectedDate ? getDateKey(calendarSelectedDate) : "";
  const selectedDayEvents = useMemo(() => {
    if (!selectedCalendarKey) return [];
    const items = calendarEvents.get(selectedCalendarKey) || [];
    return [...items].sort((a, b) => a.date - b.date);
  }, [calendarEvents, selectedCalendarKey]);
  const calendarPostMap = useMemo(() => {
    return new Map(calendarSourcePosts.map((post) => [post.id, post]));
  }, [calendarSourcePosts]);
  const starredPostIds = useMemo(() => new Set(starredPosts.map((post) => post.id)), [starredPosts]);
  const showDepartmentFeed =
    dashboardPage === DASHBOARD_PAGE.DEPARTMENT ||
    (dashboardPage === DASHBOARD_PAGE.HOME && isStudent && studentBoardId);
  const activePostPriority = activePost?.priority || "medium";
  const activePostType = activePost?.type || "notice";
  const activePostHasPriority = PRIORITY_TYPES.has(activePostType);
  const editPostHasPriority = PRIORITY_TYPES.has(editPost?.type);
  const activePostAuthor = activePost?.authorName || activePost?.authorEmail || "CampusConnect";
  const activePostDepartment = useMemo(() => {
    if (!activePost) return "";
    return (
      activePost.authorDepartment ||
      activePost.authorDept ||
      activePost.authorBranch ||
      activePost.boardName ||
      getAuthorDepartmentLabel(activePost, activePost.boardId || selectedBoardId, userProfile, authUser?.uid)
    );
  }, [activePost, selectedBoardId, userProfile, authUser?.uid]);
  const upcomingPosts = useMemo(() => {
    const items = [...posts, ...completedPosts];
    const now = Date.now();
    const mapped = items
      .map((post) => {
        const rawDate = post.deadlineAt || post.createdAt;
        if (!rawDate) return null;
        const date = rawDate?.toDate ? rawDate.toDate() : new Date(rawDate);
        if (Number.isNaN(date.getTime())) return null;
        return { ...post, displayDate: date };
      })
      .filter(Boolean);

    const upcoming = mapped.filter((post) => post.displayDate.getTime() >= now);
    if (upcoming.length > 0) {
      return upcoming.sort((a, b) => a.displayDate - b.displayDate).slice(0, 3);
    }

    return mapped
      .sort((a, b) => b.displayDate - a.displayDate)
      .slice(0, 3);
  }, [posts, completedPosts]);

  function resetComposeForm() {
    setComposeForm({
      title: "",
      content: "",
      type: "notice",
      priority: "medium",
      link: "",
      targetYear: "all",
      deadline: "",
      eventDate: "",
      targetMode: "specific",
      targetBoardId: selectedBoardId,
    });
    setComposeFiles([]);
    setUploadProgress(0);
  }

  function clearFilters() {
    setSearchTerm("");
    setFilterType("all");
    setFilterPriority("all");
    setFilterYear(isStudent && userProfile?.year ? String(userProfile.year) : "all");
  }

  async function handleCleanupCompletedPosts() {
    if (!isAdminUser || !selectedBoardId || cleanupBusy) return;
    setCleanupBusy(true);
    setIsError(false);
    setStatus("Cleaning up old completed posts...");

    try {
      const deletedCount = await purgeOldCompletedPosts(selectedBoardId, { silentErrors: true });
      if (deletedCount === null) {
        setIsError(true);
        setStatus("Unable to clean up old completed posts.");
      } else if (deletedCount === 0) {
        setStatus("No old completed posts to remove.");
      } else {
        setStatus(`Removed ${deletedCount} old completed post${deletedCount === 1 ? "" : "s"}.`);
      }
      await loadDepartmentData(selectedBoardId, userProfile, authUser, { silentErrors: true });
    } catch (error) {
      setIsError(true);
      setStatus(toStatusMessage(error, "Unable to clean up old completed posts."));
    } finally {
      setCleanupBusy(false);
    }
  }

  function navigateTo(page) {
    setDashboardPage(page);
    setProfileMenuOpen(false);
    setActivePost(null);
  }

  function toggleTheme() {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  }

  function toggleStar(post) {
    setStarredPosts((prev) => {
      const exists = prev.find((item) => item.id === post.id);
      if (exists) {
        return prev.filter((item) => item.id !== post.id);
      }
      return [
        {
          id: post.id,
          title: post.title || "Untitled",
          content: post.content || "",
          type: post.type || "notice",
          boardId: post.boardId || selectedBoard?.id || "",
          boardName: post.boardName || selectedBoard?.shortName || "",
          authorName: post.authorName || "",
          authorEmail: post.authorEmail || "",
          authorDepartment: post.authorDepartment || post.authorDept || post.authorBranch || "",
          priority: post.priority || "medium",
          mediaUrls: post.mediaUrls || [],
          createdAt: post.createdAt || null,
          deadlineAt: post.deadlineAt || null,
        },
        ...prev,
      ];
    });
  }

  function openPostPreview(post) {
    setActivePost(post);
    setActivePostImageIndex(0);
  }

  function closePostPreview() {
    setActivePost(null);
    setActivePostImageIndex(0);
  }

  function openReminder(post) {
    setReminderDraft({
      postId: post.id,
      title: post.title || "Untitled",
      date: "",
    });
    setReminderOpen(true);
  }

  function saveReminder() {
    if (!reminderDraft.postId || !reminderDraft.date) {
      setIsError(true);
      setStatus("Select a reminder date.");
      return;
    }

    setReminders((prev) => [
      {
        id: `${reminderDraft.postId}-${reminderDraft.date}`,
        postId: reminderDraft.postId,
        title: reminderDraft.title,
        remindAt: reminderDraft.date,
      },
      ...prev,
    ]);
    setReminderOpen(false);
    setReminderDraft({ postId: "", title: "", date: "" });
    setIsError(false);
    setStatus("Reminder saved.");
  }

  function removeReminder(reminderId) {
    setReminders((prev) => prev.filter((item) => item.id !== reminderId));
  }

  function openFaqForPost(post) {
    if (!post?.authorUid) {
      setFaqDraft((prev) =>
        createFaqDraft({
          question: `Question about: ${post?.title || "this post"}`,
          relatedPostId: post?.id || "",
        })
      );
      navigateTo(DASHBOARD_PAGE.FAQ);
      return;
    }
    setFaqDraft(() =>
      createFaqDraft({
        question: `Question about: ${post.title || "this post"}`,
        relatedPostId: post.id,
        recipientType: "author",
        recipientUid: post.authorUid || "",
        recipientName: post.authorName || "",
        recipientEmail: post.authorEmail || "",
      })
    );
    navigateTo(DASHBOARD_PAGE.FAQ);
  }

  function openFaqDirect() {
    setFaqDraft(createFaqDraft());
    navigateTo(DASHBOARD_PAGE.FAQ);
  }

  async function loadFaqItems() {
    if (!authUser || !userProfile) return;
    setFaqLoading(true);
    try {
      let faqQuery = null;
      if (userProfile.role === "student") {
        faqQuery = query(
          collection(db, "faqs"),
          where("askedByUid", "==", authUser.uid),
          orderBy("createdAt", "desc"),
          limit(120)
        );
        const snapshot = await getDocs(faqQuery);
        const items = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        setFaqItems(items);
      } else if (userProfile.role === "admin") {
        faqQuery = query(collection(db, "faqs"), orderBy("createdAt", "desc"), limit(120));
        const snapshot = await getDocs(faqQuery);
        const items = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        setFaqItems(items);
      } else {
        const queries = [];
        queries.push(
          query(
            collection(db, "faqs"),
            where("recipientUid", "==", authUser.uid),
            orderBy("createdAt", "desc"),
            limit(120)
          )
        );
        const recipientLabel = getFacultyRecipientLabel(userProfile);
        if (recipientLabel) {
          queries.push(
            query(
              collection(db, "faqs"),
              where("recipient", "==", recipientLabel),
              orderBy("createdAt", "desc"),
              limit(120)
            )
          );
        }
        const snapshots = await Promise.all(queries.map((q) => getDocs(q)));
        const map = new Map();
        snapshots.forEach((snapshot) => {
          snapshot.docs.forEach((docSnap) => {
            map.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
          });
        });
        const items = Array.from(map.values()).sort((a, b) => {
          const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
          const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
          return timeB - timeA;
        });
        setFaqItems(items);
      }
    } catch (error) {
      setIsError(true);
      setStatus(toStatusMessage(error, "Unable to load questions."));
    } finally {
      setFaqLoading(false);
    }
  }

  async function handleFaqSubmit(event) {
    event.preventDefault();
    if (!authUser || !userProfile) return;
    const question = faqDraft.question.trim();
    if (!question) {
      setIsError(true);
      setStatus("Please write your question.");
      return;
    }
    if (faqDraft.recipientType === "author" && !faqDraft.recipientUid) {
      setIsError(true);
      setStatus("Post author could not be identified.");
      return;
    }

    setIsError(false);
    setStatus("Sending question...");
    try {
      const isAuthorRecipient = faqDraft.recipientType === "author";
      await addDoc(collection(db, "faqs"), {
        askedByUid: authUser.uid,
        askedByName: userProfile.name || authUser.displayName || "",
        askedByEmail: authUser.email || "",
        askedByDepartment: userProfile.department || "",
        askedByYear: userProfile.year ?? null,
        question,
        recipient: isAuthorRecipient ? "author" : faqDraft.recipient,
        recipientType: isAuthorRecipient ? "author" : "group",
        recipientUid: isAuthorRecipient ? faqDraft.recipientUid : "",
        recipientName: isAuthorRecipient ? faqDraft.recipientName : "",
        recipientEmail: isAuthorRecipient ? faqDraft.recipientEmail : "",
        relatedPostId: faqDraft.relatedPostId || "",
        status: "Pending",
        replyText: "",
        repliedByUid: "",
        repliedByName: "",
        repliedByEmail: "",
        repliedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setFaqDraft(createFaqDraft());
      setStatus("Question sent.");
      await loadFaqItems();
    } catch (error) {
      setIsError(true);
      setStatus(toStatusMessage(error, "Unable to send question."));
    }
  }

  async function handleFaqReply(item) {
    if (!authUser || !userProfile || !item?.id) return;
    const canReplyThis =
      canReplyFaq || (item.recipientType === "author" && item.recipientUid === authUser.uid);
    if (!canReplyThis) return;
    const replyText = String(faqReplyDrafts[item.id] || "").trim();
    if (!replyText) {
      setIsError(true);
      setStatus("Please write a reply.");
      return;
    }

    setIsError(false);
    setStatus("Sending reply...");
    try {
      await updateDoc(doc(db, "faqs", item.id), {
        replyText,
        repliedByUid: authUser.uid,
        repliedByName: userProfile.name || authUser.displayName || "",
        repliedByEmail: authUser.email || "",
        repliedAt: serverTimestamp(),
        status: "Solved",
        updatedAt: serverTimestamp(),
      });
      setFaqReplyDrafts((prev) => ({ ...prev, [item.id]: "" }));
      setStatus("Reply sent.");
      await loadFaqItems();
    } catch (error) {
      setIsError(true);
      setStatus(toStatusMessage(error, "Unable to send reply."));
    }
  }

  function applyFilters(list, overrides = {}) {
    const {
      term = searchTerm,
      type = filterType,
      priority = filterPriority,
      year = filterYear,
      authorUid = selectedAuthorUid,
    } = overrides;
    const keyword = String(term || "").toLowerCase().trim();
    const selectedYear = year === "all" ? null : Number(year);

    return list.filter((post) => {
      if (authorUid && post.authorUid !== authorUid) return false;
      if (type !== "all" && post.type !== type) return false;
      if (priority !== "all") {
        const hasPriority = PRIORITY_TYPES.has(post.type);
        if (!hasPriority) return false;
        if (post.priority !== priority) return false;
      }
      if (selectedYear && !isVisibleForYear(post, selectedYear)) return false;

      if (!keyword) return true;
      const haystack = `${post.title || ""} ${post.content || ""}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }

  const filteredFeedPosts = useMemo(() => applyFilters(posts), [
    posts,
    searchTerm,
    filterType,
    filterPriority,
    filterYear,
    selectedAuthorUid,
  ]);
  const filteredCompletedPosts = useMemo(() => applyFilters(completedPosts), [
    completedPosts,
    searchTerm,
    filterType,
    filterPriority,
    filterYear,
    selectedAuthorUid,
  ]);
  const filteredPendingPosts = useMemo(() => applyFilters(pendingPosts), [
    pendingPosts,
    searchTerm,
    filterType,
    filterPriority,
    filterYear,
    selectedAuthorUid,
  ]);
  const showCompletedTab = filterType === "all" || STATUS_TAB_TYPES.has(filterType);
  const showPriorityFilters = filterType === "all" || PRIORITY_TYPES.has(filterType);
  const combinedFilteredPosts = useMemo(() => {
    const merged = [...posts, ...completedPosts];
    const unique = new Map();
    merged.forEach((post) => unique.set(post.id, post));
    const combined = Array.from(unique.values());
    combined.sort((a, b) => (getPostTimestampMs(b) ?? 0) - (getPostTimestampMs(a) ?? 0));
    return applyFilters(combined);
  }, [posts, completedPosts, searchTerm, filterType, filterPriority, filterYear, selectedAuthorUid]);
  const activeTabPosts = useMemo(() => {
    if (activeTab === FEED_TAB.COMPLETED) return completedPosts;
    if (activeTab === FEED_TAB.PENDING) return pendingPosts;
    return posts;
  }, [activeTab, posts, completedPosts, pendingPosts]);
  const baseCountPosts = useMemo(() => {
    const source = showCompletedTab ? activeTabPosts : [...posts, ...completedPosts];
    const unique = new Map();
    source.forEach((post) => unique.set(post.id, post));
    return Array.from(unique.values());
  }, [showCompletedTab, activeTabPosts, posts, completedPosts]);
  const feedPostsToRender = showCompletedTab ? filteredFeedPosts : combinedFilteredPosts;
  const feedEmptyLabel = showCompletedTab ? "No active posts found." : "No posts found.";
  const typeCounts = useMemo(() => {
    const baseFiltered = applyFilters(baseCountPosts, { type: "all" });
    const counts = { all: baseFiltered.length };
    POST_TYPES.forEach((type) => {
      counts[type] = baseFiltered.filter((post) => post.type === type).length;
    });
    return counts;
  }, [baseCountPosts, searchTerm, filterPriority, filterYear, selectedAuthorUid]);
  const selectedAuthorMeta = useMemo(() => {
    if (!selectedAuthor) return null;
    const name = selectedAuthor.name || selectedAuthor.email || "Approved poster";
    const email = selectedAuthor.email || "";
    const role = selectedAuthor.role || "faculty";
    const department = selectedAuthor.department || "Department";
    const photoUrl = selectedAuthor.photoUrl || "";
    const accent = role === "admin" ? "#ef4444" : "#3b82f6";
    return { name, email, role, department, accent, photoUrl };
  }, [selectedAuthor]);
  const selectedAuthorStats = useMemo(() => {
    if (!selectedAuthorUid) return null;
    const countPosts = (items) =>
      items.filter((post) => post.authorUid === selectedAuthorUid).length;
    const activeCount = countPosts(posts);
    const completedCount = countPosts(completedPosts);
    const pendingCount = countPosts(pendingPosts);
    return {
      total: activeCount + completedCount + pendingCount,
      active: activeCount,
      completed: completedCount,
      pending: pendingCount,
    };
  }, [selectedAuthorUid, posts, completedPosts, pendingPosts]);
  const activeTabLabel =
    activeTab === FEED_TAB.FEED
      ? "Active"
      : activeTab === FEED_TAB.COMPLETED
        ? "Completed"
        : "Pending";

  useEffect(() => {
    if (!showCompletedTab && activeTab === FEED_TAB.COMPLETED) {
      setActiveTab(FEED_TAB.FEED);
    }
  }, [showCompletedTab, activeTab]);

  useEffect(() => {
    if (!showPriorityFilters && filterPriority !== "all") {
      setFilterPriority("all");
    }
  }, [showPriorityFilters, filterPriority]);

  async function writeAuditLog(action, targetId, boardId, metadata = {}) {
    if (!authUser) return;
    try {
      await addDoc(collection(db, "auditLogs"), {
        actorUid: authUser.uid,
        actorEmail: authUser.email || "",
        actorRole: userProfile?.role || "student",
        action,
        targetType: "post",
        targetId,
        boardId,
        metadata,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      // Non-blocking.
    }
  }

  async function registerPushToken(user, profile) {
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey || pushRegistered) return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    const notificationBlockKey = "cc_notif_prompt_blocked";

    try {
      if (Notification.permission === "denied") return;
      if (Notification.permission === "default") {
        try {
          if (localStorage.getItem(notificationBlockKey) === "1") return;
        } catch (error) {
          // Ignore storage access errors.
        }
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          try {
            localStorage.setItem(notificationBlockKey, "1");
          } catch (error) {
            // Ignore storage access errors.
          }
          return;
        }
      }

      const messaging = await getMessagingIfSupported();
      if (!messaging) return;

      const messagingSwUrl = getMessagingServiceWorkerUrl();
      if (!messagingSwUrl) return;

      const swRegistration = await navigator.serviceWorker.register(messagingSwUrl);
      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: swRegistration,
      });

      if (!token) return;

      await setDoc(
        doc(db, "notificationTokens", getTokenDocId(user.uid, token)),
        {
          uid: user.uid,
          email: user.email || "",
          token,
          role: profile.role || "student",
          year: profile.year ?? null,
          boardSubscriptions: ["all"],
          notificationsEnabled: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setPushRegistered(true);
    } catch (error) {
      // Non-blocking.
    }
  }

  async function syncUserProfile(user) {
    const inferredIdentity = parseEmailIdentity(user.email || "");
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      const defaultProfile = {
        uid: user.uid,
        name: user.displayName || "",
        email: user.email || "",
        photoUrl: user.photoURL || "",
        role: inferredIdentity.role,
        department: inferredIdentity.department ?? "",
        year: inferredIdentity.year,
        authorApproved: inferredIdentity.authorApproved,
        createdAt: serverTimestamp(),
      };

      await setDoc(userRef, defaultProfile);
      return defaultProfile;
    }

    const existing = userSnap.data();
    const isAdminUser = existing.role === "admin";
    const nextRole = isAdminUser ? "admin" : inferredIdentity.role;
    const nextYear = isAdminUser ? existing.year ?? null : inferredIdentity.year;
    const existingDepartment = typeof existing.department === "string" ? existing.department : "";
    const nextDepartment = isAdminUser
      ? existingDepartment
      : inferredIdentity.role === "faculty"
      ? existingDepartment
      : inferredIdentity.department ?? existingDepartment;
    const nextAuthorApproved = isAdminUser
      ? existing.authorApproved === true
      : inferredIdentity.role === "faculty"
      ? true
      : existing.authorApproved === true;

    await setDoc(
      userRef,
      {
        uid: user.uid,
        name: user.displayName || existing.name || "",
        email: user.email || existing.email || "",
        role: nextRole,
        year: nextYear,
        department: nextDepartment,
        authorApproved: nextAuthorApproved,
      },
      { merge: true }
    );

    return {
      ...existing,
      uid: user.uid,
      name: user.displayName || existing.name || "",
      email: user.email || existing.email || "",
      photoUrl: existing.photoUrl || user.photoURL || "",
      role: nextRole,
      year: nextYear,
      department: nextDepartment,
      authorApproved: nextAuthorApproved,
    };
  }

  async function ensureDefaultBoards(user) {
    await Promise.all(
      BOARDS.map((board) =>
        setDoc(
          doc(db, "boards", board.id),
          {
            boardId: board.id,
            name: board.name,
            active: true,
            createdBy: user.uid,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        )
      )
    );
  }

  async function markFeedPostsRead(feedPosts, user, profile) {
    if (!user || feedPosts.length === 0) return;

    const trackingWrites = feedPosts.slice(0, 40).map((post) =>
      setDoc(
        doc(db, "postReads", `${post.id}_${user.uid}`),
        {
          postId: post.id,
          boardId: post.boardId,
          viewerUid: user.uid,
          viewerEmail: user.email || "",
          viewerYear: profile?.year ?? null,
          viewedAt: serverTimestamp(),
        },
        { merge: true }
      )
    );

    try {
      await Promise.all(trackingWrites);
    } catch (error) {
      // Non-blocking.
    }
  }

  async function loadReadAnalytics(feedPosts) {
    if (!canModerate || feedPosts.length === 0) {
      setReadStatsByPost({});
      return;
    }

    try {
      const studentsSnapshot = await getDocs(query(collection(db, "users"), where("role", "==", "student")));
      const students = studentsSnapshot.docs.map((item) => item.data());

      const yearCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
      for (const student of students) {
        if (typeof student.year === "number" && yearCounts[student.year] !== undefined) {
          yearCounts[student.year] += 1;
        }
      }

      const allStudentsCount = students.length;
      const postStatsEntries = await Promise.all(
        feedPosts.slice(0, 20).map(async (post) => {
          const postReadsSnapshot = await getDocs(
            query(collection(db, "postReads"), where("postId", "==", post.id))
          );

          let eligibleCount = allStudentsCount;
          if (Array.isArray(post.audienceYears) && post.audienceYears.length > 0) {
            eligibleCount = post.audienceYears.reduce((sum, yearValue) => sum + (yearCounts[yearValue] || 0), 0);
          } else if (typeof post.year === "number") {
            eligibleCount = yearCounts[post.year] || 0;
          }

          const readCount = postReadsSnapshot.size;
          const readPercent = eligibleCount > 0 ? Math.round((readCount / eligibleCount) * 100) : 0;
          return [post.id, { readCount, eligibleCount, readPercent }];
        })
      );

      setReadStatsByPost(Object.fromEntries(postStatsEntries));
    } catch (error) {
      // Non-blocking.
    }
  }

  async function purgeOldCompletedPosts(boardId, options = {}) {
    const silentErrors = options.silentErrors === true;
    if (!isAdminUser) return 0;
    let deletedCount = 0;

    try {
      const cutoffDate = new Date(Date.now() - COMPLETED_RETENTION_MS);
      const cutoffTimestamp = Timestamp.fromDate(cutoffDate);
      const maxBatches = 5;
      const batchSize = 30;

      for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
        const cleanupQuery = query(
          collection(db, "posts"),
          where("boardId", "==", boardId),
          where("lifecycleStatus", "==", "completed"),
          where("completedAt", "<=", cutoffTimestamp),
          orderBy("completedAt", "desc"),
          limit(batchSize)
        );
        const cleanupSnapshot = await getDocs(cleanupQuery);
        if (cleanupSnapshot.empty) break;

        await Promise.all(cleanupSnapshot.docs.map((item) => deleteDoc(doc(db, "posts", item.id))));
        deletedCount += cleanupSnapshot.size;

        if (cleanupSnapshot.size < batchSize) break;
      }
    } catch (error) {
      if (!silentErrors) {
        setIsError(true);
        setStatus(toStatusMessage(error, "Unable to clean up old completed posts."));
      }
      return null;
    }

    return deletedCount;
  }

  async function autoCompleteExpiredPosts(boardId) {
    const nowTimestamp = Timestamp.now();
    const nowMs = Date.now();
    const expiredMap = new Map();

    const tryCollect = async (field) => {
      const expiryQuery = query(
        collection(db, "posts"),
        where("boardId", "==", boardId),
        where("lifecycleStatus", "==", "active"),
        where(field, "<=", nowTimestamp),
        orderBy(field, "asc"),
        limit(30)
      );
      const snapshot = await getDocs(expiryQuery);
      snapshot.docs.forEach((docSnap) => {
        expiredMap.set(docSnap.id, docSnap);
      });
    };

    try {
      await tryCollect("deadlineAt");
    } catch (error) {
      // Non-blocking.
    }
    try {
      await tryCollect("eventAt");
    } catch (error) {
      // Non-blocking.
    }

    for (const item of expiredMap.values()) {
      const data = item.data();
      if (data.visibility !== "published") continue;
      const deadlineMs = data.deadlineAt?.toMillis ? data.deadlineAt.toMillis() : new Date(data.deadlineAt || 0).getTime();
      const eventMs = data.eventAt?.toMillis ? data.eventAt.toMillis() : new Date(data.eventAt || 0).getTime();
      const deadlineExpired = Number.isFinite(deadlineMs) && deadlineMs > 0 && deadlineMs <= nowMs;
      const eventExpired = Number.isFinite(eventMs) && eventMs > 0 && eventMs <= nowMs;
      if (!deadlineExpired && !eventExpired) continue;

      await updateDoc(doc(db, "posts", item.id), {
        lifecycleStatus: "completed",
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog("mark_completed", item.id, boardId, { automated: true });
    }

    await purgeOldCompletedPosts(boardId, { silentErrors: true });
  }

  async function completeExpiredFromFeed(items, boardId) {
    if (!Array.isArray(items) || items.length === 0) return [];
    const nowMs = Date.now();
    const completedItems = [];

    for (const item of items) {
      if (!item || item.visibility !== "published" || item.lifecycleStatus !== "active") {
        continue;
      }
      const deadlineMs = getDateValueMs(item.deadlineAt);
      const eventMs = getDateValueMs(item.eventAt);
      const deadlineExpired = Number.isFinite(deadlineMs) && deadlineMs > 0 && deadlineMs <= nowMs;
      const eventExpired = Number.isFinite(eventMs) && eventMs > 0 && eventMs <= nowMs;
      if (!deadlineExpired && !eventExpired) continue;

      try {
        await updateDoc(doc(db, "posts", item.id), {
          lifecycleStatus: "completed",
          completedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog("mark_completed", item.id, boardId, { automated: true });
        completedItems.push({
          ...item,
          lifecycleStatus: "completed",
          completedAt: new Date(nowMs),
        });
      } catch (error) {
        // Ignore failures (likely permissions or index errors).
      }
    }

    return completedItems;
  }

  async function loadDepartmentData(boardId, profile, user, options = {}) {
    const silentErrors = options.silentErrors === true;
    setPostsLoading(true);
    try {
      const isStudentProfile = profile?.role === "student";
      const allowedBoardId = isStudentProfile
        ? getBoardIdForDepartment(profile?.department)
        : boardId;
      if (isStudentProfile && !allowedBoardId) {
        setPosts([]);
        setCompletedPosts([]);
        setPendingPosts([]);
        setPostsLoading(false);
        return;
      }
      const finalBoardId = allowedBoardId || boardId;
      if (finalBoardId !== boardId) {
        setSelectedBoardId(finalBoardId);
      }
      await autoCompleteExpiredPosts(finalBoardId);

      const feedQuery = query(
        collection(db, "posts"),
        where("boardId", "==", finalBoardId),
        where("visibility", "==", "published"),
        where("lifecycleStatus", "==", "active"),
        orderBy("urgencyScore", "asc"),
        orderBy("createdAt", "desc"),
        limit(80)
      );

      const completedQuery = canModerate
        ? query(
            collection(db, "posts"),
            where("boardId", "==", finalBoardId),
            where("lifecycleStatus", "==", "completed"),
            orderBy("completedAt", "desc"),
            limit(80)
          )
        : query(
            collection(db, "posts"),
            where("boardId", "==", finalBoardId),
            where("visibility", "==", "published"),
            where("lifecycleStatus", "==", "completed"),
            orderBy("completedAt", "desc"),
            limit(80)
          );

      const pendingQuery = canModerate
        ? query(
            collection(db, "posts"),
            where("boardId", "==", finalBoardId),
            where("approvalStatus", "==", "pending"),
            orderBy("createdAt", "desc"),
            limit(80)
          )
        : null;

      const [feedSnapshot, completedSnapshot, pendingSnapshot] = await Promise.all([
        getDocs(feedQuery),
        getDocs(completedQuery),
        pendingQuery ? getDocs(pendingQuery) : Promise.resolve(null),
      ]);

      let nextFeedPosts = feedSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      let nextCompletedPosts = completedSnapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => item.visibility === "published");
      const nextPendingPosts = pendingSnapshot
        ? pendingSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
        : [];

      const newlyCompleted = await completeExpiredFromFeed(nextFeedPosts, finalBoardId);
      if (newlyCompleted.length > 0) {
        const completedIds = new Set(newlyCompleted.map((item) => item.id));
        nextFeedPosts = nextFeedPosts.filter((item) => !completedIds.has(item.id));
        const completedMap = new Map(nextCompletedPosts.map((item) => [item.id, item]));
        newlyCompleted.forEach((item) => completedMap.set(item.id, item));
        nextCompletedPosts = Array.from(completedMap.values());
      }
      
      const filterForStudentYear = (items) => {
        if (!isStudentProfile || !profile?.year) return items;
        return items.filter((post) => isVisibleForYear(post, profile.year));
      };
      
      // Filter completed posts: only show achievements OR other posts with passed deadlines/events
      const filterCompletedPosts = (items) => {
        const now = Date.now();
        return items.filter((post) => {
          if (post.type === "achievement") return true;
          const deadlineTime = getDateValueMs(post.deadlineAt);
          const eventTime = getDateValueMs(post.eventAt);
          if (Number.isFinite(deadlineTime) && deadlineTime <= now) return true;
          if (Number.isFinite(eventTime) && eventTime <= now) return true;
          return false;
        });
      };
      
      const filteredFeed = filterForStudentYear(nextFeedPosts);
      const filteredCompleted = filterForStudentYear(filterCompletedPosts(nextCompletedPosts));
      const filteredPending = filterForStudentYear(nextPendingPosts);

      setPosts(filteredFeed);
      setCompletedPosts(filteredCompleted);
      setPendingPosts(filteredPending);

      await markFeedPostsRead(filteredFeed, user, profile);
      await loadReadAnalytics(filteredFeed);
    } catch (error) {
      if (!silentErrors) {
        setIsError(true);
        setStatus(toStatusMessage(error, "Unable to load department posts."));
      }
    } finally {
      setPostsLoading(false);
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAuthUser(null);
        setUserProfile(null);
        setPushRegistered(false);
        setLoading(false);
        return;
      }

      const userEmail = user.email || "";
      if (!isAllowedEmail(userEmail)) {
        await signOut(auth);
        setIsError(true);
        setStatus(`Access denied: use your @${ALLOWED_DOMAIN} email.`);
        setView(VIEW.LOGIN);
        setEmail("");
        setUserProfile(null);
        setLoading(false);
        return;
      }

      try {
        const profile = await syncUserProfile(user);
        if (profile.role === "admin") {
          try {
            await ensureDefaultBoards(user);
          } catch (error) {
            // Non-blocking.
          }
        }

        setAuthUser(user);
        setEmail(userEmail);
        setUserProfile(profile);
        const nextStudentBoardId =
          profile.role === "student" ? getBoardIdForDepartment(profile.department) : "";
        if (nextStudentBoardId) {
          setSelectedBoardId(nextStudentBoardId);
        }
        setDashboardPage(DASHBOARD_PAGE.HOME);
        setIsError(false);
        setStatus("Login successful.");
        setView(VIEW.DASHBOARD);
      } catch (error) {
        setIsError(true);
        setStatus(toStatusMessage(error, "Unable to load profile."));
        setView(VIEW.LOGIN);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authUser?.uid) {
      setStarredPosts([]);
      setReminders([]);
      starredLoadedRef.current = false;
      remindersLoadedRef.current = false;
      return;
    }

    const starKey = getLocalStorageKey("cc_starred_posts", authUser.uid);
    const reminderKey = getLocalStorageKey("cc_reminders", authUser.uid);
    setStarredPosts(loadLocalStorageJson(starKey, []));
    setReminders(loadLocalStorageJson(reminderKey, []));
    starredLoadedRef.current = true;
    remindersLoadedRef.current = true;
  }, [authUser?.uid]);

  useEffect(() => {
    if (!authUser?.uid || !starredLoadedRef.current) return;
    const starKey = getLocalStorageKey("cc_starred_posts", authUser.uid);
    saveLocalStorageJson(starKey, starredPosts);
  }, [authUser?.uid, starredPosts]);

  useEffect(() => {
    if (!authUser?.uid || !remindersLoadedRef.current) return;
    const reminderKey = getLocalStorageKey("cc_reminders", authUser.uid);
    saveLocalStorageJson(reminderKey, reminders);
  }, [authUser?.uid, reminders]);

  useEffect(() => {
    if (!authUser || !userProfile || pushRegistered === true) return;
    registerPushToken(authUser, userProfile);
  }, [authUser, userProfile, pushRegistered]);

  useEffect(() => {
    if (view !== VIEW.DASHBOARD || !authUser || !userProfile) {
      return;
    }
    const shouldLoadDepartment =
      dashboardPage === DASHBOARD_PAGE.DEPARTMENT ||
      dashboardPage === DASHBOARD_PAGE.CALENDAR ||
      (dashboardPage === DASHBOARD_PAGE.HOME && isStudent && studentBoardId);
    if (!shouldLoadDepartment) {
      return;
    }
    loadDepartmentData(selectedBoardId, userProfile, authUser);
  }, [view, dashboardPage, selectedBoardId, authUser, userProfile, isStudent]);

  useEffect(() => {
    if (dashboardPage === DASHBOARD_PAGE.CALENDAR && !calendarSelectedDate) {
      setCalendarSelectedDate(new Date());
    }
  }, [dashboardPage, calendarSelectedDate]);

  useEffect(() => {
    if (isStudent && userProfile?.year) {
      setFilterYear(String(userProfile.year));
    }
  }, [isStudent, userProfile?.year]);

  useEffect(() => {
    if (view !== VIEW.DASHBOARD || dashboardPage !== DASHBOARD_PAGE.FAQ) return;
    if (!authUser || !userProfile) return;
    loadFaqItems();
  }, [view, dashboardPage, authUser, userProfile, facultyRecipientLabel]);

  useEffect(() => {
    if (view !== VIEW.DASHBOARD || !authUser) return;
    loadApprovedAuthors();
  }, [view, authUser]);

  useEffect(() => {
    if (view !== VIEW.LOGIN) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [view]);

  useEffect(() => {
    if (view !== VIEW.DASHBOARD || dashboardPage !== DASHBOARD_PAGE.PROFILE) return;
    if (!authUser || !userProfile || !canViewAuthorPosts) return;
    void loadAuthoredPosts();
  }, [view, dashboardPage, authUser, userProfile, canViewAuthorPosts]);

  useEffect(() => {
    if (!activePost) return;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setActivePost(null);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activePost]);
  useEffect(() => {
    if (!profileMenuOpen) return;
    const handleClick = (event) => {
      if (!profileMenuRef.current) return;
      if (!profileMenuRef.current.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    };
    window.addEventListener("click", handleClick);
    return () => {
      window.removeEventListener("click", handleClick);
    };
  }, [profileMenuOpen]);

  async function handleGoogleLogin() {
    setIsError(false);
    setStatus("Signing in...");
    try {
      const result = await signInWithPopup(auth, provider);
      const userEmail = result.user?.email || "";
      if (!isAllowedEmail(userEmail)) {
        await signOut(auth);
        setIsError(true);
        setStatus(`Access denied: use your @${ALLOWED_DOMAIN} email.`);
        return;
      }
      const profile = await syncUserProfile(result.user);
      setAuthUser(result.user);
      setEmail(userEmail);
      setUserProfile(profile);
      const nextStudentBoardId =
        profile.role === "student" ? getBoardIdForDepartment(profile.department) : "";
      if (nextStudentBoardId) {
        setSelectedBoardId(nextStudentBoardId);
      }
      setDashboardPage(DASHBOARD_PAGE.HOME);
      setIsError(false);
      setStatus("Login successful.");
      setView(VIEW.DASHBOARD);
    } catch (error) {
      setIsError(true);
      setStatus(toStatusMessage(error, "Login failed."));
    }
  }

  async function handleCreatePost() {
    if (!authUser || !userProfile) return;
    if (!canCreateGlobalPost) {
      setIsError(true);
      setStatus("Only approved authors can create posts from dashboard.");
      return;
    }

    const title = composeForm.title.trim();
    const content = composeForm.content.trim();
    const linkValue = composeForm.link.trim();

    if (!title || !content) {
      setIsError(true);
      setStatus("Please provide both title and message content.");
      return;
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setIsError(true);
      setStatus("You appear to be offline. Connect to internet and try again.");
      return;
    }

    // Validate all files
    for (const file of composeFiles) {
      if (!String(file.type || "").startsWith("image/")) {
        setIsError(true);
        setStatus("Only image files are allowed.");
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setIsError(true);
        setStatus(`Image "${file.name}" is too large. Please upload images below 7 MB.`);
        return;
      }
    }

    const shouldUsePriority = PRIORITY_TYPES.has(composeForm.type);
    const deadlineDate = shouldUsePriority && composeForm.deadline ? new Date(composeForm.deadline) : null;
    if (deadlineDate && Number.isNaN(deadlineDate.getTime())) {
      setIsError(true);
      setStatus("Invalid deadline format.");
      return;
    }
    const shouldUseEventDate =
      composeForm.type === "event" ||
      composeForm.type === "hackathon" ||
      composeForm.type === "workshop";
    const eventDate =
      shouldUseEventDate && composeForm.eventDate ? new Date(composeForm.eventDate) : null;
    if (eventDate && Number.isNaN(eventDate.getTime())) {
      setIsError(true);
      setStatus("Invalid event date format.");
      return;
    }

    const targetYear = composeForm.targetYear === "all" ? null : Number(composeForm.targetYear);
    if (targetYear && ![1, 2, 3, 4].includes(targetYear)) {
      setIsError(true);
      setStatus("Target year must be 1, 2, 3, or 4.");
      return;
    }

    const targetBoardIds =
      composeForm.targetMode === "all" ? BOARDS.map((board) => board.id) : [composeForm.targetBoardId];

    const contentWithLink = linkValue ? `${content}\n\nLink: ${linkValue}` : content;
    const batchId = createBatchId(authUser);

    setSubmittingPost(true);
    setUploadProgress(0);
    setIsError(false);
    setStatus("Publishing post...");

    try {
      const mediaUrls = [];
      
      // Upload all images and collect URLs
      for (let i = 0; i < composeFiles.length; i++) {
        const file = composeFiles[i];
        setStatus(`Uploading image ${i + 1} of ${composeFiles.length}... 0%`);
        const mediaUrl = await uploadImageWithProgress(file, (progress) => {
          const overallProgress = Math.round(((i + progress / 100) / composeFiles.length) * 100);
          setUploadProgress(overallProgress);
          if (progress < 100) {
            setStatus(`Uploading image ${i + 1} of ${composeFiles.length}... ${progress}%`);
          }
        }, UPLOAD_IDLE_TIMEOUT_MS);
        mediaUrls.push(mediaUrl);
      }
      setStatus("Publishing post...");

      const priorityValue = shouldUsePriority ? composeForm.priority : "medium";
      const urgencyScore = computeUrgencyScore(priorityValue, deadlineDate);

      await withTimeout(Promise.all(
        targetBoardIds.map(async (boardId) => {
          const board = BOARDS.find((item) => item.id === boardId);
          const postRef = await addDoc(collection(db, "posts"), {
            boardId,
            boardName: board?.name || boardId,
            type: composeForm.type,
            title,
            content: contentWithLink,
            mediaUrls: mediaUrls,
            batchId,
            priority: priorityValue,
            priorityRank: getPriorityRank(priorityValue),
            urgencyScore,
            year: targetYear,
            audienceYears: targetYear ? [targetYear] : [],
            searchTokens: tokenizeText(`${title} ${contentWithLink} ${composeForm.type}`),
            deadlineAt: deadlineDate ? Timestamp.fromDate(deadlineDate) : null,
            eventAt: eventDate ? Timestamp.fromDate(eventDate) : null,
            completedAt: composeForm.type === "achievement" ? serverTimestamp() : null,
            lifecycleStatus: composeForm.type === "achievement" ? "completed" : "active",
            visibility: "published",
            approvalStatus: "approved",
            authorUid: authUser.uid,
            authorName: authUser.displayName || "",
            authorEmail: authUser.email || "",
            authorDepartment: userProfile.department || "",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          await writeAuditLog("create_post", postRef.id, boardId, {
            targetMode: composeForm.targetMode,
            priority: composeForm.priority,
            imageCount: mediaUrls.length,
          });
        })
      ), PUBLISH_TIMEOUT_MS, "Publishing timed out");

      resetComposeForm();
      setComposeOpen(false);
      if (dashboardPage === DASHBOARD_PAGE.DEPARTMENT && targetBoardIds.includes(selectedBoardId)) {
        void loadDepartmentData(selectedBoardId, userProfile, authUser, { silentErrors: true });
      }
      setStatus(
        composeForm.targetMode === "all"
          ? "Post published to all departments."
          : "Post published to selected department."
      );
    } catch (error) {
      setIsError(true);
      setStatus(toStatusMessage(error, "Unable to create post."));
    } finally {
      setSubmittingPost(false);
    }
  }

  function openEditPost(post) {
    setEditPost(post);
    setEditForm({
      title: post.title || "",
      content: post.content || "",
      priority: post.priority || "medium",
      deadline: post.deadlineAt ? formatDateTimeLocal(post.deadlineAt) : "",
    });
  }

  function closeEditPost() {
    setEditPost(null);
    setEditForm({
      title: "",
      content: "",
      priority: "medium",
      deadline: "",
    });
  }

  function handleComposeFileSelect(event) {
    const files = Array.from(event.target.files || []);
    setComposeFiles((prev) => [...prev, ...files]);
    // Reset input so same file can be selected again
    event.target.value = "";
  }

  function removeComposeFile(index) {
    setComposeFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function clearComposeFiles() {
    setComposeFiles([]);
  }

  async function handleProfilePhotoChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !authUser) return;
    if (!String(file.type || "").startsWith("image/")) {
      setIsError(true);
      setStatus("Only image files are allowed for profile photos.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setIsError(true);
      setStatus("Profile photo is too large. Please upload an image below 7 MB.");
      return;
    }

    setProfilePhotoUploading(true);
    setProfilePhotoProgress(0);
    setIsError(false);
    setStatus("Uploading profile photo...");
    try {
      const uploadedUrl = await uploadImageWithProgress(file, (progress) => {
        setProfilePhotoProgress(progress);
      });
      await updateDoc(doc(db, "users", authUser.uid), {
        photoUrl: uploadedUrl,
        updatedAt: serverTimestamp(),
      });
      setUserProfile((prev) => (prev ? { ...prev, photoUrl: uploadedUrl } : prev));
      setApprovedAuthors((prev) =>
        prev.map((author) =>
          author.uid === authUser.uid ? { ...author, photoUrl: uploadedUrl } : author
        )
      );
      setStatus("Profile photo updated.");
    } catch (error) {
      setIsError(true);
      setStatus(toStatusMessage(error, "Unable to upload profile photo."));
    } finally {
      setProfilePhotoUploading(false);
    }
  }

  async function handleRemoveProfilePhoto() {
    if (!authUser) return;
    setProfilePhotoUploading(true);
    setProfilePhotoProgress(0);
    setIsError(false);
    setStatus("Removing profile photo...");
    try {
      await updateDoc(doc(db, "users", authUser.uid), {
        photoUrl: "",
        updatedAt: serverTimestamp(),
      });
      setUserProfile((prev) => (prev ? { ...prev, photoUrl: "" } : prev));
      setApprovedAuthors((prev) =>
        prev.map((author) =>
          author.uid === authUser.uid ? { ...author, photoUrl: "" } : author
        )
      );
      setStatus("Profile photo removed.");
    } catch (error) {
      setIsError(true);
      setStatus(toStatusMessage(error, "Unable to remove profile photo."));
    } finally {
      setProfilePhotoUploading(false);
    }
  }

  async function handleSaveEdit() {
    if (!editPost) return;
    const title = editForm.title.trim();
    const content = editForm.content.trim();
    const shouldUsePriority = PRIORITY_TYPES.has(editPost.type);

    if (!title || !content) {
      setIsError(true);
      setStatus("Title and content are required.");
      return;
    }

    const deadlineDate = shouldUsePriority && editForm.deadline ? new Date(editForm.deadline) : null;
    if (deadlineDate && Number.isNaN(deadlineDate.getTime())) {
      setIsError(true);
      setStatus("Invalid deadline format.");
      return;
    }

    try {
      const groupKey = editPost.groupKey || getPostGroupKey(editPost);
      const groupItems = authoredPostGroups[groupKey] || [editPost];
      const updatePayload = {
        title,
        content,
        searchTokens: tokenizeText(`${title} ${content} ${editPost.type || ""}`),
        updatedAt: serverTimestamp(),
      };
      if (shouldUsePriority) {
        updatePayload.priority = editForm.priority;
        updatePayload.priorityRank = getPriorityRank(editForm.priority);
        updatePayload.urgencyScore = computeUrgencyScore(editForm.priority, deadlineDate);
        updatePayload.deadlineAt = deadlineDate ? Timestamp.fromDate(deadlineDate) : null;
      }
      await Promise.all(
        groupItems.map((item) =>
          updateDoc(doc(db, "posts", item.id), {
            ...updatePayload,
          })
        )
      );
      setIsError(false);
      setStatus("Post updated.");
      closeEditPost();
      await loadAuthoredPosts();
    } catch (error) {
      setIsError(true);
      setStatus(toStatusMessage(error, "Unable to update post."));
    }
  }

  async function handleDeletePost(post) {
    if (!post) return;
    const ok = window.confirm("Delete this post? This cannot be undone.");
    if (!ok) return;
    try {
      const groupKey = post.groupKey || getPostGroupKey(post);
      const groupItems = authoredPostGroups[groupKey] || [post];
      const deletedIds = new Set(groupItems.map((item) => item.id));
      const cleanupReads = async () => {
        const snapshots = await Promise.all(
          Array.from(deletedIds).map((postId) =>
            getDocs(query(collection(db, "postReads"), where("postId", "==", postId)))
          )
        );
        const deletes = [];
        snapshots.forEach((snapshot) => {
          snapshot.forEach((docSnap) => {
            deletes.push(deleteDoc(doc(db, "postReads", docSnap.id)));
          });
        });
        if (deletes.length > 0) {
          await Promise.all(deletes);
        }
      };
      let cleanupFailed = false;
      try {
        await cleanupReads();
      } catch (cleanupError) {
        cleanupFailed = true;
      }
      await Promise.all(groupItems.map((item) => deleteDoc(doc(db, "posts", item.id))));
      if (cleanupFailed) {
        setIsError(true);
        setStatus("Post deleted, but read analytics could not be removed.");
      } else {
        setIsError(false);
        setStatus("Post deleted.");
      }
      setAuthoredPosts((prev) => prev.filter((item) => item.groupKey !== groupKey && item.id !== post.id));
      setAuthoredPostGroups((prev) => {
        const next = { ...prev };
        delete next[groupKey];
        return next;
      });
      setPosts((prev) => prev.filter((item) => !deletedIds.has(item.id)));
      setCompletedPosts((prev) => prev.filter((item) => !deletedIds.has(item.id)));
      setPendingPosts((prev) => prev.filter((item) => !deletedIds.has(item.id)));
      setStarredPosts((prev) => prev.filter((item) => !deletedIds.has(item.id)));
      setReminders((prev) => prev.filter((item) => !deletedIds.has(item.postId)));
      setReadStatsByPost((prev) => {
        const next = { ...prev };
        deletedIds.forEach((id) => {
          delete next[id];
        });
        return next;
      });
      if (activePost && deletedIds.has(activePost.id)) {
        setActivePost(null);
      }
    } catch (error) {
      setIsError(true);
      setStatus(toStatusMessage(error, "Unable to delete post."));
    }
  }

  async function loadApprovedAuthors() {
    if (!authUser) return;
    setAuthorsLoading(true);
    try {
      const snapshot = await getDocs(
        query(collection(db, "users"), where("authorApproved", "==", true))
      );
      const items = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          uid: data.uid || docSnap.id,
        };
      });
      items.sort((a, b) =>
        String(a.name || a.email || "").localeCompare(String(b.name || b.email || ""))
      );
      setApprovedAuthors(items);
    } catch (error) {
      setApprovedAuthors([]);
    } finally {
      setAuthorsLoading(false);
    }
  }

  const filteredAuthors = useMemo(() => {
    let items = approvedAuthors;
    if (isStudent && studentBoardId) {
      items = items.filter(
        (author) => getBoardIdForDepartment(author.department) === studentBoardId
      );
    }
    if (authorRoleFilter !== "all") {
      items = items.filter((author) => (author.role || "faculty") === authorRoleFilter);
    }
    const term = authorSearch.trim().toLowerCase();
    if (!term) return items;
    return items.filter((author) => {
      const haystack = `${author.name || ""} ${author.email || ""} ${author.department || ""}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [approvedAuthors, authorSearch, isStudent, studentBoardId, authorRoleFilter]);

  function selectAuthor(author) {
    const uid = author?.uid || author?.id;
    if (!uid) return;
    setSelectedAuthorUid(uid);
    setActiveTab(FEED_TAB.FEED);
    setSearchTerm("");
    setFilterType("all");
    setFilterPriority("all");
    if (!isStudent) {
      const boardId = getBoardIdForDepartment(author.department);
      if (boardId) {
        setSelectedBoardId(boardId);
      }
      setDashboardPage(DASHBOARD_PAGE.DEPARTMENT);
    } else {
      setDashboardPage(DASHBOARD_PAGE.HOME);
    }
  }

  function clearAuthorFilter() {
    setSelectedAuthorUid("");
  }

  function openMobileNav() {
    setMobileNavOpen(true);
    setMobileSearchOpen(false);
  }

  function openMobileSearch() {
    setMobileSearchOpen(true);
    setMobileNavOpen(false);
  }

  function closeMobileDrawers() {
    setMobileNavOpen(false);
    setMobileSearchOpen(false);
  }


  async function loadAuthoredPosts() {
    if (!authUser || !canViewAuthorPosts) return;
    setAuthoredLoading(true);
    try {
      const authoredQuery = query(
        collection(db, "posts"),
        where("authorUid", "==", authUser.uid),
        orderBy("createdAt", "desc"),
        limit(80)
      );
      const snapshot = await getDocs(authoredQuery);
      const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      const grouped = new Map();
      items.forEach((post) => {
        const groupKey = getPostGroupKey(post);
        const bucket = grouped.get(groupKey) || [];
        bucket.push(post);
        grouped.set(groupKey, bucket);
      });

      const deduped = Array.from(grouped.entries()).map(([groupKey, groupPosts]) => {
        const sorted = [...groupPosts].sort((a, b) => {
          const timeA = getPostTimestampMs(a) ?? 0;
          const timeB = getPostTimestampMs(b) ?? 0;
          return timeB - timeA;
        });
        const representative = sorted[0] || groupPosts[0];
        return {
          ...representative,
          groupKey,
          groupCount: groupPosts.length,
        };
      });

      deduped.sort((a, b) => {
        const timeA = getPostTimestampMs(a) ?? 0;
        const timeB = getPostTimestampMs(b) ?? 0;
        return timeB - timeA;
      });

      setAuthoredPostGroups(Object.fromEntries(grouped));
      setAuthoredPosts(deduped);
      await loadReadAnalytics(deduped);
    } catch (error) {
      setIsError(true);
      setStatus(toStatusMessage(error, "Unable to load your posts."));
    } finally {
      setAuthoredLoading(false);
    }
  }

  async function handleApproval(postId, action) {
    if (!canModerate || !postId) return;
    const isApprove = action === "approve";
    setApprovingPostId(postId);
    setIsError(false);
    setStatus(isApprove ? "Approving post..." : "Rejecting post...");

    try {
      await updateDoc(doc(db, "posts", postId), {
        visibility: isApprove ? "published" : "rejected",
        approvalStatus: isApprove ? "approved" : "rejected",
        updatedAt: serverTimestamp(),
        approvedByUid: authUser.uid,
        approvedAt: serverTimestamp(),
      });
      await writeAuditLog(isApprove ? "approve_post" : "reject_post", postId, selectedBoard.id, {});
      await loadDepartmentData(selectedBoard.id, userProfile, authUser);
      setStatus(isApprove ? "Post approved." : "Post rejected.");
    } catch (error) {
      setIsError(true);
      setStatus(toStatusMessage(error, "Unable to update approval status."));
    } finally {
      setApprovingPostId("");
    }
  }

  async function handleLogout() {
    await signOut(auth);
    setAuthUser(null);
    setEmail("");
    setUserProfile(null);
    setPosts([]);
    setCompletedPosts([]);
    setPendingPosts([]);
    setReadStatsByPost({});
    setDashboardPage(DASHBOARD_PAGE.HOME);
    setSelectedBoardId(BOARDS[0].id);
    setActiveTab(FEED_TAB.FEED);
    setPushRegistered(false);
    clearFilters();
    setComposeOpen(false);
    setProfileMenuOpen(false);
    setAuthorSearch("");
    setSelectedAuthorUid("");
    setStarredPosts([]);
    setReminders([]);
    setReminderDraft({ postId: "", title: "", date: "" });
    setReminderOpen(false);
    setActivePost(null);
    setFaqDraft(createFaqDraft());
    setFaqItems([]);
    setFaqReplyDrafts({});
    setFaqLoading(false);
    setCalendarSelectedDate(null);
    setAuthoredPosts([]);
    setAuthoredLoading(false);
    setEditPost(null);
    setIsError(false);
    setStatus("Logged out successfully.");
    setView(VIEW.LOGIN);
  }

  function openDepartment(boardId) {
    const nextBoardId = isStudent && studentBoardId ? studentBoardId : boardId;
    setSelectedBoardId(nextBoardId);
    setComposeForm((prev) => ({ ...prev, targetBoardId: nextBoardId, targetMode: "specific" }));
    setActiveTab(FEED_TAB.FEED);
    setSelectedAuthorUid("");
    clearFilters();
    setDashboardPage(isStudent ? DASHBOARD_PAGE.HOME : DASHBOARD_PAGE.DEPARTMENT);
    setProfileMenuOpen(false);
    setActivePost(null);
    setStatus("");
    setIsError(false);
  }

  function handleBoardSelect(event) {
    const nextBoardId = event.target.value;
    const allowedBoardId = isStudent && studentBoardId ? studentBoardId : nextBoardId;
    setSelectedBoardId(allowedBoardId);
    setComposeForm((prev) => ({ ...prev, targetBoardId: allowedBoardId }));
    setSelectedAuthorUid("");
  }

  function shiftCalendar(monthDelta) {
    setCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + monthDelta, 1));
  }

  if (loading) {
    return (
      <main className="app-shell app-shell-loading">
        <section className="surface-card card-loading">
          <p className="description">Loading CampusConnect...</p>
        </section>
      </main>
    );
  }

  return (
    <main className={`app-shell ${theme === "dark" ? "theme-dark" : "theme-light"} view-${view}`}>
      <div className="bg-orb orb-one" aria-hidden="true" />
      <div className="bg-orb orb-two" aria-hidden="true" />

      {view === VIEW.LOGIN && (
        <section className="auth-split" aria-hidden="false">
          <div className="auth-visual">
            <div className="auth-text">
              <p className="eyebrow">CampusConnect</p>
              <h1 className="hero-title">Your campus, connected in one clear feed.</h1>
              <p className="description">
                CampusConnect keeps every department update, event, and deadline in one place so students never miss a chance.
              </p>
              <div className="auth-highlights">
                <div className="highlight-item">Department announcements, verified.</div>
                <div className="highlight-item">Events, deadlines, and reminders.</div>
                <div className="highlight-item">Questions answered by faculty.</div>
              </div>
            </div>
            <img
              src="https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=80"
              alt="College student using a laptop"
              className="auth-illustration"
            />
          </div>
          <div className="auth-panel">
            <div className="auth-panel-card">
              <h2>Sign In</h2>
              <p className="description">Use your institutional Google account to enter CampusConnect.</p>
              <button className="primary-btn" onClick={handleGoogleLogin} type="button">
                Sign in with Google
              </button>
              <p className="domain-note">Only @{ALLOWED_DOMAIN} accounts are allowed.</p>
              <p className={statusClass} role="status" aria-live="polite">
                {status}
              </p>
            </div>
          </div>
        </section>
      )}

      {view === VIEW.DASHBOARD && (
        <section
          className={`dashboard-shell ${isRightPanelOpen ? "right-open" : "right-collapsed"}`}
          aria-hidden="false"
        >
          <div className="mobile-topbar">
            <button
              type="button"
              className="mobile-topbar-btn"
              onClick={openMobileNav}
              aria-label="Open menu"
              title="Open menu"
            >
              <span className="mobile-cc">CC</span>
            </button>
            <button
              type="button"
              className="mobile-topbar-btn"
              onClick={openMobileSearch}
              aria-label="Search approved posters"
              title="Search approved posters"
            >
              <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <line x1="16.2" y1="16.2" x2="20" y2="20" />
              </svg>
            </button>
          </div>

          {(mobileNavOpen || mobileSearchOpen) && (
            <button
              type="button"
              className="mobile-scrim"
              aria-label="Close menu"
              onClick={closeMobileDrawers}
            />
          )}

          <aside className={`mobile-drawer left ${mobileNavOpen ? "open" : ""}`} aria-hidden={!mobileNavOpen}>
            <div className="mobile-drawer-header">
              <span className="mobile-cc">CC</span>
              <div>
                <p className="mobile-drawer-title">CampusConnect</p>
                <p className="mobile-drawer-subtitle">{userProfile?.role || "student"}</p>
              </div>
              <button
                type="button"
                className="ghost-btn icon-btn"
                onClick={closeMobileDrawers}
                aria-label="Close menu"
              >
                Close
              </button>
            </div>
            <nav className="mobile-drawer-nav">
              <button
                type="button"
                className="mobile-drawer-item"
                onClick={() => {
                  navigateTo(DASHBOARD_PAGE.HOME);
                  closeMobileDrawers();
                }}
              >
                Home
              </button>
              <button
                type="button"
                className="mobile-drawer-item"
                onClick={() => {
                  navigateTo(DASHBOARD_PAGE.CALENDAR);
                  closeMobileDrawers();
                }}
              >
                Calendar
              </button>
              <button
                type="button"
                className="mobile-drawer-item"
                onClick={() => {
                  openFaqDirect();
                  closeMobileDrawers();
                }}
              >
                {faqLabel}
              </button>
              {isStudent && (
                <>
                  <button
                    type="button"
                    className="mobile-drawer-item"
                    onClick={() => {
                      navigateTo(DASHBOARD_PAGE.STARRED);
                      closeMobileDrawers();
                    }}
                  >
                    Starred
                  </button>
                  <button
                    type="button"
                    className="mobile-drawer-item"
                    onClick={() => {
                      navigateTo(DASHBOARD_PAGE.REMINDERS);
                      closeMobileDrawers();
                    }}
                  >
                    Reminders
                  </button>
                </>
              )}
              {canCreateGlobalPost && (
                <button
                  type="button"
                  className="mobile-drawer-item"
                  onClick={() => {
                    setComposeOpen(true);
                    setIsError(false);
                    setStatus("");
                    closeMobileDrawers();
                  }}
                >
                  New Post
                </button>
              )}
              <button
                type="button"
                className="mobile-drawer-item"
                onClick={() => {
                  navigateTo(DASHBOARD_PAGE.PROFILE);
                  closeMobileDrawers();
                }}
              >
                Profile
              </button>
              <button
                type="button"
                className="mobile-drawer-item"
                onClick={() => {
                  toggleTheme();
                  closeMobileDrawers();
                }}
              >
                {theme === "dark" ? "Light Mode" : "Dark Mode"}
              </button>
              <button
                type="button"
                className="mobile-drawer-item danger"
                onClick={() => {
                  handleLogout();
                  closeMobileDrawers();
                }}
              >
                Logout
              </button>
            </nav>
          </aside>

          <aside className={`mobile-drawer right ${mobileSearchOpen ? "open" : ""}`} aria-hidden={!mobileSearchOpen}>
            <div className="mobile-drawer-header">
              <p className="mobile-drawer-title">Approved Posters</p>
              <button
                type="button"
                className="ghost-btn icon-btn"
                onClick={closeMobileDrawers}
                aria-label="Close search"
              >
                Close
              </button>
            </div>
            <div className="author-panel">
              <div className="author-search">
                <span aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="presentation">
                    <path d="M11 4a7 7 0 1 0 4.24 12.56l3.6 3.6a1 1 0 0 0 1.42-1.42l-3.6-3.6A7 7 0 0 0 11 4z" />
                  </svg>
                </span>
                <input
                  type="text"
                  placeholder="Search approved posters"
                  name="authorSearchMobile"
                  value={authorSearch}
                  onChange={(event) => setAuthorSearch(event.target.value)}
                />
              </div>
              <div className="author-chips" role="group" aria-label="Filter approved posters by role">
                <button
                  type="button"
                  className={`chip-btn ${authorRoleFilter === "all" ? "active" : ""}`}
                  onClick={() => setAuthorRoleFilter("all")}
                  aria-pressed={authorRoleFilter === "all"}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`chip-btn ${authorRoleFilter === "faculty" ? "active" : ""}`}
                  onClick={() => setAuthorRoleFilter("faculty")}
                  aria-pressed={authorRoleFilter === "faculty"}
                >
                  Faculty
                </button>
                <button
                  type="button"
                  className={`chip-btn ${authorRoleFilter === "admin" ? "active" : ""}`}
                  onClick={() => setAuthorRoleFilter("admin")}
                  aria-pressed={authorRoleFilter === "admin"}
                >
                  Admin
                </button>
              </div>
              <div className="author-list">
                <button
                  type="button"
                  className={`author-item ${selectedAuthorUid ? "" : "active"}`}
                  onClick={() => {
                    clearAuthorFilter();
                    closeMobileDrawers();
                  }}
                >
                  <span className="author-avatar">All</span>
                  <div>
                    <p className="author-name">All Approved Posters</p>
                    <p className="author-meta">Show everything</p>
                  </div>
                </button>
                {authorsLoading && <p className="hint">Loading approved posters...</p>}
                {!authorsLoading && filteredAuthors.length === 0 && (
                  <p className="hint">No approved posters found.</p>
                )}
                {!authorsLoading &&
                  filteredAuthors.map((author) => (
                    <button
                      key={author.uid}
                      type="button"
                      className={`author-item ${selectedAuthorUid === author.uid ? "active" : ""}`}
                      onClick={() => {
                        selectAuthor(author);
                        closeMobileDrawers();
                      }}
                    >
                      <span className="avatar small">
                        {author.photoUrl ? (
                          <img
                            src={getOptimizedImageUrl(author.photoUrl)}
                            alt={`${author.name || "Author"} profile`}
                          />
                        ) : (
                          getInitials(author.name || author.email)
                        )}
                      </span>
                      <div>
                        <p className="author-name">{author.name || author.email}</p>
                        <p className="author-meta">
                          {author.department || "Department"} · {author.role || "faculty"}
                        </p>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          </aside>

          <aside className={`sidebar-rail ${sidebarPinned ? "pinned" : ""}`}>
            <div className="rail-head">
              <button
                type="button"
                className="rail-logo"
                onClick={() => setSidebarPinned((prev) => !prev)}
                aria-label={sidebarPinned ? "Collapse sidebar" : "Expand sidebar"}
                title={sidebarPinned ? "Collapse sidebar" : "Expand sidebar"}
              >
                <span className="rail-logo-mark">CC</span>
                <span className="rail-logo-text">CampusConnect</span>
                <span className="rail-logo-state" aria-hidden="true">
                  {sidebarPinned ? (
                    <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
                      <path d="M14.5 6 9.5 12l5 6" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
                      <path d="m9.5 6 5 6-5 6" />
                    </svg>
                  )}
                </span>
              </button>
              <button
                type="button"
                className="rail-pin"
                onClick={() => setSidebarPinned((prev) => !prev)}
                aria-pressed={sidebarPinned}
                aria-label={sidebarPinned ? "Collapse sidebar" : "Keep sidebar open"}
                title={sidebarPinned ? "Collapse sidebar" : "Keep sidebar open"}
              >
                {sidebarPinned ? (
                  <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
                    <path d="M14.5 6 9.5 12l5 6" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
                    <path d="m9.5 6 5 6-5 6" />
                  </svg>
                )}
              </button>
            </div>
            <nav className="rail-nav" aria-label="Quick navigation">
              <button
                type="button"
                className={dashboardPage === DASHBOARD_PAGE.HOME ? "rail-btn active" : "rail-btn"}
                onClick={() => navigateTo(DASHBOARD_PAGE.HOME)}
                aria-label="Home"
                title="Home"
              >
                <svg viewBox="0 0 24 24" role="presentation">
                  <path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-8.5z" />
                </svg>
                <span className="rail-label">Home</span>
              </button>
              <button
                type="button"
                className={dashboardPage === DASHBOARD_PAGE.CALENDAR ? "rail-btn active" : "rail-btn"}
                onClick={() => navigateTo(DASHBOARD_PAGE.CALENDAR)}
                aria-label="Calendar"
                title="Calendar"
              >
                <svg viewBox="0 0 24 24" role="presentation">
                  <path d="M7 3v3m10-3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" />
                </svg>
                <span className="rail-label">Calendar</span>
              </button>
              <button
                type="button"
                className={dashboardPage === DASHBOARD_PAGE.FAQ ? "rail-btn active" : "rail-btn"}
                onClick={openFaqDirect}
                aria-label={faqLabel}
                title={faqLabel}
              >
                <svg viewBox="0 0 24 24" role="presentation">
                  <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H8l-4 4V6a1 1 0 0 1 1-1z" />
                </svg>
                <span className="rail-label">{faqLabel}</span>
              </button>
              <span className="rail-divider" aria-hidden="true" />
              {isStudent && (
                <button
                  type="button"
                  className={dashboardPage === DASHBOARD_PAGE.STARRED ? "rail-btn active" : "rail-btn"}
                  onClick={() => navigateTo(DASHBOARD_PAGE.STARRED)}
                  aria-label="Starred"
                  title="Starred"
                >
                  <svg viewBox="0 0 24 24" role="presentation">
                    <path d="m12 3 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16l-5.3 2.1 1-5.8-4.2-4.1 5.9-.9L12 3z" />
                  </svg>
                  <span className="rail-label">Starred</span>
                </button>
              )}
              {isStudent && (
                <button
                  type="button"
                  className={dashboardPage === DASHBOARD_PAGE.REMINDERS ? "rail-btn active" : "rail-btn"}
                  onClick={() => navigateTo(DASHBOARD_PAGE.REMINDERS)}
                  aria-label="Reminders"
                  title="Reminders"
                >
                  <svg viewBox="0 0 24 24" role="presentation">
                    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
                    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                  </svg>
                  <span className="rail-label">Reminders</span>
                </button>
              )}
              {canCreateGlobalPost && (
                <button
                  type="button"
                  className="rail-btn rail-create"
                  onClick={() => {
                    setComposeOpen(true);
                    setIsError(false);
                    setStatus("");
                  }}
                  aria-label="New post"
                  title="New post"
                >
                  +
                  <span className="rail-label">New Post</span>
                </button>
              )}
            </nav>
            <div className="rail-footer">
              <div className="rail-footer-menu" ref={profileMenuRef}>
                <button
                  type="button"
                  className={dashboardPage === DASHBOARD_PAGE.PROFILE ? "rail-btn active" : "rail-btn"}
                  onClick={() => setProfileMenuOpen((prev) => !prev)}
                  aria-label="Profile menu"
                  aria-haspopup="menu"
                  aria-expanded={profileMenuOpen}
                  title="Profile menu"
                >
                  <span className="avatar small">
                    {profilePhotoUrl ? (
                      <img src={getOptimizedImageUrl(profilePhotoUrl)} alt="Profile" />
                    ) : (
                      getInitials(userProfile?.name || email)
                    )}
                  </span>
                  <span className="rail-label">{profileLabel}</span>
                  <span className="rail-menu-dots" aria-hidden="true">
                    <svg viewBox="0 0 24 24" role="presentation">
                      <circle cx="12" cy="5" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="12" cy="19" r="2" />
                    </svg>
                  </span>
                </button>
                {profileMenuOpen && (
                  <div className="rail-profile-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        navigateTo(DASHBOARD_PAGE.PROFILE);
                        setProfileMenuOpen(false);
                      }}
                    >
                      <span className="menu-item-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" role="presentation">
                          <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4z" />
                          <path d="M4 20a8 8 0 0 1 16 0" />
                        </svg>
                      </span>
                      Profile
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        toggleTheme();
                        setProfileMenuOpen(false);
                      }}
                    >
                      <span className="menu-item-icon" aria-hidden="true">
                        {theme === "dark" ? (
                          <svg viewBox="0 0 24 24" role="presentation">
                            <path d="M12 4a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1z" />
                            <path d="M12 17a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0v-2a1 1 0 0 1 1-1z" />
                            <path d="M4 12a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1z" />
                            <path d="M17 12a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2h-2a1 1 0 0 1-1-1z" />
                            <path d="M6.34 6.34a1 1 0 0 1 1.42 0l1.42 1.42a1 1 0 1 1-1.42 1.42L6.34 7.76a1 1 0 0 1 0-1.42z" />
                            <path d="M15.82 15.82a1 1 0 0 1 1.42 0l1.42 1.42a1 1 0 1 1-1.42 1.42l-1.42-1.42a1 1 0 0 1 0-1.42z" />
                            <path d="M17.66 6.34a1 1 0 0 1 0 1.42l-1.42 1.42a1 1 0 1 1-1.42-1.42l1.42-1.42a1 1 0 0 1 1.42 0z" />
                            <path d="M8.18 15.82a1 1 0 0 1 0 1.42l-1.42 1.42a1 1 0 1 1-1.42-1.42l1.42-1.42a1 1 0 0 1 1.42 0z" />
                            <circle cx="12" cy="12" r="4" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" role="presentation">
                            <path d="M20.3 15.3A8 8 0 1 1 8.7 3.7a7 7 0 1 0 11.6 11.6z" />
                          </svg>
                        )}
                      </span>
                      {theme === "dark" ? "Light Mode" : "Dark Mode"}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="danger"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        handleLogout();
                      }}
                    >
                      <span className="menu-item-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" role="presentation">
                          <path d="M15 6h-3a1 1 0 0 0-1 1v2" />
                          <path d="M11 15v2a1 1 0 0 0 1 1h3" />
                          <path d="M10 12h10" />
                          <path d="m17 9 3 3-3 3" />
                          <path d="M5 4h6a2 2 0 0 1 2 2" />
                          <path d="M13 18a2 2 0 0 1-2 2H5" />
                        </svg>
                      </span>
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </aside>
          <aside className="sidebar">
            <div className="brand-block">
              <div className="brand-badge">CC</div>
              <div>
                <p className="brand-name">CampusConnect</p>
                <p className="brand-tag">BVRITH Campus Network</p>
              </div>
            </div>

            <button
              className="profile-bar"
              type="button"
              onClick={() => setProfileMenuOpen((prev) => !prev)}
            >
              <span className="profile-handle">{profileHandle}</span>
              <span className={`profile-chevron ${profileMenuOpen ? "open" : ""}`} aria-hidden="true">
                v
              </span>
              <span className="avatar small">
                {profilePhotoUrl ? (
                  <img src={getOptimizedImageUrl(profilePhotoUrl)} alt="Profile" />
                ) : (
                  getInitials(userProfile?.name || email)
                )}
              </span>
            </button>

            {profileMenuOpen && (
              <div className="profile-menu">
                <button type="button" onClick={() => navigateTo(DASHBOARD_PAGE.PROFILE)}>
                  My Profile
                </button>
                {isStudent && (
                  <button type="button" onClick={() => navigateTo(DASHBOARD_PAGE.STARRED)}>
                    Starred
                  </button>
                )}
                {isStudent && (
                  <button type="button" onClick={() => navigateTo(DASHBOARD_PAGE.REMINDERS)}>
                    Reminders
                  </button>
                )}
                <button type="button" onClick={toggleTheme}>
                  {theme === "dark" ? "Light Mode" : "Dark Mode"}
                </button>
                <button type="button" className="danger" onClick={handleLogout}>
                  Logout
                </button>
              </div>
            )}

            <p className="sidebar-section">Project shortcuts</p>
            <nav className="sidebar-nav">
              <button
                type="button"
                className={`nav-btn ${dashboardPage === DASHBOARD_PAGE.HOME ? "active" : ""}`}
                onClick={() => navigateTo(DASHBOARD_PAGE.HOME)}
              >
                <span className="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="presentation">
                    <path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-8.5z" />
                  </svg>
                </span>
                Home
              </button>
              <button
                type="button"
                className={`nav-btn ${dashboardPage === DASHBOARD_PAGE.CALENDAR ? "active" : ""}`}
                onClick={() => navigateTo(DASHBOARD_PAGE.CALENDAR)}
              >
                <span className="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="presentation">
                    <path d="M7 3v3m10-3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" />
                  </svg>
                </span>
                Calendar
              </button>
              <button
                type="button"
                className={`nav-btn ${dashboardPage === DASHBOARD_PAGE.FAQ ? "active" : ""}`}
                onClick={openFaqDirect}
              >
                <span className="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="presentation">
                    <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H8l-4 4V6a1 1 0 0 1 1-1z" />
                  </svg>
                </span>
                {faqLabel}
              </button>
              {canCreateGlobalPost && (
                <button
                  type="button"
                  className="nav-btn nav-create"
                  onClick={() => {
                    setComposeOpen(true);
                    setIsError(false);
                    setStatus("");
                  }}
                >
                  <span className="nav-icon nav-plus" aria-hidden="true">
                    +
                  </span>
                  New Post
                </button>
              )}
            </nav>

            <div className="sidebar-footer">
              <span className="sidebar-pill">Role: {userProfile?.role || "student"}</span>
              <span className="sidebar-pill">Year: {userProfile?.year ? `${userProfile.year}` : "NA"}</span>
              <span className="sidebar-pill">
                Department: {userProfile?.department || "Not set"}
              </span>
            </div>
          </aside>

          <div className="main-panel">
            <header className="main-header">
              <div>
                <p className="eyebrow">Welcome, {userProfile?.name || "Campus member"}</p>
                <h2>{pageTitle}</h2>
                <p className="description">
                  {dashboardPage === DASHBOARD_PAGE.HOME &&
                    (isStudent
                      ? "Your department feed is ready below."
                      : "Choose a department to see notices, events, and deadlines.")}
                  {dashboardPage === DASHBOARD_PAGE.DEPARTMENT &&
                    "Stay updated with verified posts from your department."}
                  {dashboardPage === DASHBOARD_PAGE.CALENDAR &&
                    "Track upcoming events and deadlines by date."}
                  {dashboardPage === DASHBOARD_PAGE.FAQ &&
                    (isStudent
                      ? "Ask a question directly to admins or faculty."
                      : "Questions submitted by students appear here.")}
                  {dashboardPage === DASHBOARD_PAGE.PROFILE &&
                    "Review your profile details and contribution stats."}
                  {dashboardPage === DASHBOARD_PAGE.STARRED &&
                    "Quick access to the posts you marked."}
                  {dashboardPage === DASHBOARD_PAGE.REMINDERS &&
                    "Your saved reminders for important deadlines."}
                </p>
              </div>
              <div className="header-actions">
                {dashboardPage === DASHBOARD_PAGE.DEPARTMENT && (
                  <button
                    className="ghost-btn compact-btn"
                    onClick={() => navigateTo(DASHBOARD_PAGE.HOME)}
                    type="button"
                  >
                    Back to Departments
                  </button>
                )}
                {dashboardPage === DASHBOARD_PAGE.CALENDAR && !isStudent && (
                  <select
                    name="calendarBoard"
                    value={selectedBoardId}
                    onChange={handleBoardSelect}
                  >
                    {BOARDS.map((board) => (
                      <option key={board.id} value={board.id}>
                        {board.shortName}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </header>

            {status && (
              <p className={statusClass} role="status" aria-live="polite">
                {status}
              </p>
            )}

            {dashboardPage === DASHBOARD_PAGE.HOME && !isStudent && (
              <div className="branch-grid">
                {visibleBoards.length === 0 && (
                  <p className="hint">Your department is not set. Contact an admin to update your profile.</p>
                )}
                {visibleBoards.map((board) => (
                  <button
                    key={board.id}
                    className="branch-card"
                    onClick={() => openDepartment(board.id)}
                    type="button"
                  >
                    <div className="branch-media">
                      <img src={board.thumbnail} alt={board.name} />
                      <span className="branch-chip">{board.shortName}</span>
                    </div>
                    <div className="branch-body">
                      <h3>{board.name}</h3>
                      <p>Explore notices, events, and updates from this department.</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {dashboardPage === DASHBOARD_PAGE.HOME && isStudent && !studentBoardId && (
              <section className="panel-card">
                <p className="hint">Your department is not set. Contact an admin to update your profile.</p>
              </section>
            )}

            {dashboardPage === DASHBOARD_PAGE.CALENDAR && (
              <div className="calendar-layout">
                <section className="panel-card calendar-card">
                  <header className="calendar-header">
                    <button className="ghost-btn icon-btn" type="button" onClick={() => shiftCalendar(-1)}>
                      Prev
                    </button>
                    <div>
                      <h3>{formatDateLabel(calendarCursor)}</h3>
                      <p className="description">Showing {selectedBoard?.shortName || "board"} schedule.</p>
                    </div>
                    <button className="ghost-btn icon-btn" type="button" onClick={() => shiftCalendar(1)}>
                      Next
                    </button>
                  </header>

                  <div className="calendar-weekdays">
                    {WEEK_DAYS.map((day) => (
                      <span key={day}>{day}</span>
                    ))}
                  </div>
                  <div className="calendar-grid">
                    {calendarDays.map((day) => {
                      const dayKey = getDateKey(day.date);
                      const dayEvents = calendarEvents.get(dayKey) || [];
                      const isSelected = selectedCalendarKey === dayKey;
                      const isToday = getDateKey(new Date()) === dayKey;
                      return (
                        <button
                          key={`${dayKey}-${day.inMonth ? "in" : "out"}`}
                          type="button"
                          className={`calendar-day ${day.inMonth ? "" : "muted"} ${isSelected ? "selected" : ""} ${
                            isToday ? "today" : ""
                          }`}
                          onClick={() => setCalendarSelectedDate(day.date)}
                        >
                          <span>{day.date.getDate()}</span>
                          <div className="calendar-dots">
                            {dayEvents.slice(0, 3).map((eventItem) => (
                              <span
                                key={`${dayKey}-${eventItem.id}`}
                                className={`calendar-dot ${eventItem.priority}`}
                              />
                            ))}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="calendar-legend">
                    <span>
                      <span className="calendar-dot high" /> High Priority
                    </span>
                    <span>
                      <span className="calendar-dot medium" /> Medium Priority
                    </span>
                    <span>
                      <span className="calendar-dot low" /> Low Priority
                    </span>
                  </div>
                </section>

                <section className="panel-card calendar-events">
                  <h3>
                    {calendarSelectedDate
                      ? calendarSelectedDate.toLocaleDateString("en-IN", { dateStyle: "full" })
                      : "Select a date"}
                  </h3>
                  {selectedDayEvents.length === 0 && <p className="hint">No events or deadlines selected.</p>}
                  {selectedDayEvents.map((eventItem, index) => (
                    <button
                      key={`${eventItem.id}-${eventItem.dateType}-${index}`}
                      type="button"
                      className="event-card"
                      onClick={() => {
                        const post = calendarPostMap.get(eventItem.id);
                        if (post) {
                          openPostPreview(post);
                        }
                      }}
                    >
                      <div>
                        <h4>{eventItem.title}</h4>
                        <p className="event-meta">
                          {eventItem.boardName} · {eventItem.type} ·{" "}
                          {eventItem.dateType === "deadline" ? "Deadline" : "Event date"}
                        </p>
                      </div>
                      {PRIORITY_TYPES.has(eventItem.type) && (
                        <span className={`event-chip ${eventItem.priority}`}>{eventItem.priority}</span>
                      )}
                    </button>
                  ))}
                </section>
              </div>
            )}

            {dashboardPage === DASHBOARD_PAGE.FAQ && (
              <div className="faq-layout">
                <section className="panel-card">
                  <h3>{isStudent ? "Ask a Question" : "Student Questions"}</h3>
                  {isStudent ? (
                    <form className="faq-form" onSubmit={handleFaqSubmit}>
                      {faqDraft.recipientType === "author" ? (
                        <div className="faq-recipient-lock">
                          <label>Send to</label>
                          <div className="recipient-pill">
                            {faqDraft.recipientName ||
                              faqDraft.recipientEmail ||
                              "Post author"}
                          </div>
                        </div>
                      ) : (
                        <label>
                          Send to
                          <select
                            name="faqRecipient"
                            value={faqDraft.recipient}
                            onChange={(event) =>
                              setFaqDraft((prev) => ({
                                ...prev,
                                recipient: event.target.value,
                                recipientType: "group",
                                recipientUid: "",
                                recipientName: "",
                                recipientEmail: "",
                              }))
                            }
                          >
                            {FAQ_RECIPIENTS.map((recipient) => (
                              <option key={recipient} value={recipient}>
                                {recipient}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <textarea
                        name="faqQuestion"
                        placeholder="Write your question..."
                        value={faqDraft.question}
                        onChange={(event) => setFaqDraft((prev) => ({ ...prev, question: event.target.value }))}
                      />
                      <button className="primary-btn" type="submit">
                        Send Question
                      </button>
                    </form>
                  ) : (
                    <p className="description">
                      {userProfile?.role === "faculty" && !facultyRecipientLabel
                        ? "Set your department to receive student questions."
                        : "Questions addressed to faculty will appear in this inbox."}
                    </p>
                  )}
                </section>

                <section className="panel-card">
                  <h3>{isStudent ? "Your Questions" : "Inbox"}</h3>
                  {faqLoading && <p className="hint">Loading questions...</p>}
                  {!faqLoading && faqItems.length === 0 && <p className="hint">No questions yet.</p>}
                  {!faqLoading && faqItems.map((item) => {
                    const statusText = item.status || "Pending";
                    const askedByLabel = item.askedByName || item.askedByEmail || "Student";
                    const repliedByLabel = item.repliedByName || item.repliedByEmail || "Faculty";
                    const recipientLabel =
                      item.recipientType === "author"
                        ? item.recipientName || item.recipientEmail || "Post author"
                        : item.recipient || "Faculty";
                    const canReplyThis =
                      canReplyFaq || (item.recipientType === "author" && item.recipientUid === authUser?.uid);
                    return (
                      <article key={item.id} className="faq-item">
                        <p className="faq-question">{item.question}</p>
                        {isStudent ? (
                          <>
                            <p className="faq-meta">
                              To: {recipientLabel} · Status: {statusText}
                            </p>
                            <p className="faq-meta">Asked: {formatTimestamp(item.createdAt)}</p>
                            {item.replyText && (
                              <div>
                                <p className="faq-meta">Reply from {repliedByLabel}</p>
                                <p>{item.replyText}</p>
                                {item.repliedAt && <p className="faq-meta">Replied: {formatTimestamp(item.repliedAt)}</p>}
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <p className="faq-meta">
                              From: {askedByLabel}
                              {item.askedByDepartment ? ` · ${item.askedByDepartment}` : ""}
                              {item.askedByYear ? ` · Year ${item.askedByYear}` : ""}
                            </p>
                            <p className="faq-meta">
                              To: {recipientLabel} · Status: {statusText}
                            </p>
                            <p className="faq-meta">Asked: {formatTimestamp(item.createdAt)}</p>
                            {item.replyText ? (
                              <div>
                                <p className="faq-meta">Reply from {repliedByLabel}</p>
                                <p>{item.replyText}</p>
                                {item.repliedAt && <p className="faq-meta">Replied: {formatTimestamp(item.repliedAt)}</p>}
                              </div>
                            ) : (
                              canReplyThis && (
                                <div className="faq-reply">
                                  <textarea
                                    name={`faqReply-${item.id}`}
                                    placeholder="Write a reply..."
                                    value={faqReplyDrafts[item.id] || ""}
                                    onChange={(event) =>
                                      setFaqReplyDrafts((prev) => ({ ...prev, [item.id]: event.target.value }))
                                    }
                                  />
                                  <button
                                    type="button"
                                    className="primary-btn"
                                    onClick={() => handleFaqReply(item)}
                                  >
                                    Send Reply
                                  </button>
                                </div>
                              )
                            )}
                          </>
                        )}
                      </article>
                    );
                  })}
                </section>
              </div>
            )}

            {dashboardPage === DASHBOARD_PAGE.PROFILE && (
              <div className="profile-layout">
                <section className="panel-card profile-card">
                  <div className="profile-head">
                    <div className="profile-avatar-wrap">
                      <span className="avatar large profile-avatar">
                        {profilePhotoUrl ? (
                          <img src={getOptimizedImageUrl(profilePhotoUrl)} alt="Profile" />
                        ) : (
                          getInitials(userProfile?.name || email)
                        )}
                      </span>
                      <div className="photo-action-row">
                        <label className="photo-action-btn primary">
                          {profilePhotoUploading
                            ? `Uploading ${profilePhotoProgress}%`
                            : profilePhotoUrl
                              ? "Change photo"
                              : "Add photo"}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleProfilePhotoChange}
                            disabled={profilePhotoUploading}
                          />
                        </label>
                        {profilePhotoUrl && !profilePhotoUploading && (
                          <button
                            type="button"
                            className="photo-action-btn danger"
                            onClick={handleRemoveProfilePhoto}
                          >
                            Remove photo
                          </button>
                        )}
                      </div>
                      {profilePhotoUploading && (
                        <span className="hint">Please keep this tab open.</span>
                      )}
                    </div>
                    <div>
                      <h3>{userProfile?.name || "Campus member"}</h3>
                      <p className="description">{email}</p>
                    </div>
                  </div>
                  <div className="profile-grid">
                    <div>
                      <p className="profile-label">Role</p>
                      <p>{userProfile?.role || "student"}</p>
                    </div>
                    <div>
                      <p className="profile-label">Year</p>
                      <p>{userProfile?.year || "NA"}</p>
                    </div>
                    <div>
                      <p className="profile-label">Department</p>
                      <p>{userProfile?.department || "Not set"}</p>
                    </div>
                    <div>
                      <p className="profile-label">Approved Poster</p>
                      <p>{userProfile?.authorApproved ? "Yes" : "No"}</p>
                    </div>
                  </div>
                </section>

                {canViewAuthorPosts ? (
                  <section className="panel-card">
                    <div className="section-head-row">
                      <h3>Your Posts</h3>
                      <span className="hint">{authoredPosts.length} total</span>
                    </div>
                    {authoredLoading && <p className="hint">Loading your posts...</p>}
                    {!authoredLoading && authoredPosts.length === 0 && (
                      <p className="hint">You have not posted yet.</p>
                    )}
                    {authoredPosts.length > 0 && (
                      <div className="post-list">
                        {authoredPosts.map((post) => {
                          const canDelete =
                            userProfile?.role === "admin" || post.authorUid === authUser?.uid;
                          const mediaUrl = getPostMediaUrl(post);
                          const isPriorityPost = PRIORITY_TYPES.has(post.type);
                          const authorDepartment = getAuthorDepartmentLabel(
                            post,
                            selectedBoardId,
                            userProfile,
                            authUser?.uid
                          );
                          return (
                            <article
                              key={post.id}
                              className="post-card clickable"
                              role="button"
                              tabIndex={0}
                              onClick={() => openPostPreview(post)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  openPostPreview(post);
                                }
                              }}
                            >
                              <header className="post-header">
                                <div>
                                  <p className="post-meta">
                                    Posted by {userProfile?.name || "You"} -{" "}
                                    {authorDepartment || "Department"}
                                  </p>
                                  <h4>{post.title}</h4>
                                </div>
                                <div className="badge-row">
                                  <span className="post-badge">{post.type}</span>
                                  {isPriorityPost && (
                                    <span className={`priority-badge ${post.priority || "medium"}`}>
                                      {post.priority || "medium"}
                                    </span>
                                  )}
                                </div>
                              </header>
                              {mediaUrl && (
                                <div className="post-media-wrap">
                                  <img
                                    src={mediaUrl}
                                    alt={post.title || "Post media"}
                                    className="post-media"
                                  />
                                </div>
                              )}
                              {renderPostBody(post, { stopPropagation: true })}
                              <div className="post-actions">
                                <button
                                  className="action-btn"
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openEditPost(post);
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  className="action-btn danger"
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleDeletePost(post);
                                  }}
                                  disabled={!canDelete}
                                >
                                  Delete
                                </button>
                              </div>
                              <footer className="post-footer">
                                <p className="post-time">{formatTimestamp(post.createdAt)}</p>
                                {isPriorityPost && post.deadlineAt && (
                                  <p>Deadline: {formatTimestamp(post.deadlineAt)}</p>
                                )}
                                {canModerate && readStatsByPost[post.id] ? (
                                  <p>
                                    Views {readStatsByPost[post.id].readCount}/{readStatsByPost[post.id].eligibleCount}
                                  </p>
                                ) : (
                                  <p>Views: restricted</p>
                                )}
                              </footer>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>
                ) : (
                  <section className="panel-card">
                    <h3>Student Overview</h3>
                    <div className="stat-grid">
                      <div>
                        <p className="profile-label">Starred</p>
                        <p>{starredPosts.length}</p>
                      </div>
                      <div>
                        <p className="profile-label">Reminders</p>
                        <p>{reminders.length}</p>
                      </div>
                    </div>
                  </section>
                )}
              </div>
            )}

            {dashboardPage === DASHBOARD_PAGE.STARRED && (
              <section className="panel-card">
                <div className="section-head-row">
                  <h3>Starred Posts</h3>
                  <span className="hint">{starredPosts.length} saved</span>
                </div>
                {starredPosts.length === 0 && <p className="hint">No starred posts yet.</p>}
                {starredPosts.length > 0 && (
                  <div className="post-list">
                    {starredPosts.map((post) => {
                      const mediaUrl = getPostMediaUrl(post);
                      const isPriorityPost = PRIORITY_TYPES.has(post.type);
                      return (
                        <article
                          key={post.id}
                          className="post-card clickable"
                          role="button"
                          tabIndex={0}
                          onClick={() => openPostPreview(post)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openPostPreview(post);
                            }
                          }}
                        >
                          <header className="post-header">
                            <div>
                              <p className="post-meta">{post.boardName || "Board"}</p>
                              <h4>{post.title}</h4>
                            </div>
                            {isPriorityPost && (
                              <span className={`priority-badge ${post.priority || "medium"}`}>
                                {post.priority || "medium"}
                              </span>
                            )}
                          </header>
                          {mediaUrl && (
                            <div className="post-media-wrap">
                              <img
                                src={mediaUrl}
                                alt={post.title || "Post media"}
                                className="post-media"
                              />
                            </div>
                          )}
                          {renderPostBody(post, { stopPropagation: true })}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {dashboardPage === DASHBOARD_PAGE.REMINDERS && (
              <section className="panel-card">
                <div className="section-head-row">
                  <h3>Reminders</h3>
                  <span className="hint">{reminders.length} scheduled</span>
                </div>
                <div className="reminders-list">
                  {reminders.length === 0 && <p className="hint">No reminders set yet.</p>}
                  {reminders.map((reminder) => (
                    <article key={reminder.id} className="reminder-card">
                      <div>
                        <h4>{reminder.title}</h4>
                        <p className="reminder-meta">
                          Remind on {new Date(reminder.remindAt).toLocaleString("en-IN", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                      <button className="ghost-btn" type="button" onClick={() => removeReminder(reminder.id)}>
                        Remove
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {showDepartmentFeed && (
              <div className="department-page">
                <div className="feed-tabs">
                  <button
                    type="button"
                    className={activeTab === FEED_TAB.FEED ? "tab-btn active" : "tab-btn"}
                    onClick={() => setActiveTab(FEED_TAB.FEED)}
                  >
                    Feed
                  </button>
                  {showCompletedTab && (
                    <button
                      type="button"
                      className={activeTab === FEED_TAB.COMPLETED ? "tab-btn active" : "tab-btn"}
                      onClick={() => setActiveTab(FEED_TAB.COMPLETED)}
                    >
                      Completed
                    </button>
                  )}
                  {canModerate && (
                    <button
                      type="button"
                      className={activeTab === FEED_TAB.PENDING ? "tab-btn active" : "tab-btn"}
                      onClick={() => setActiveTab(FEED_TAB.PENDING)}
                    >
                      Pending
                    </button>
                  )}
                </div>

                {selectedAuthorMeta && (
                  <section className="panel-card author-profile-card">
                    <div
                      className="author-cover"
                      style={{ "--author-accent": selectedAuthorMeta.accent }}
                    >
                      <div className="author-avatar-lg">
                        {selectedAuthorMeta.photoUrl ? (
                          <img
                            src={getOptimizedImageUrl(selectedAuthorMeta.photoUrl)}
                            alt={`${selectedAuthorMeta.name} profile`}
                          />
                        ) : (
                          getInitials(selectedAuthorMeta.name || selectedAuthorMeta.email)
                        )}
                      </div>
                    </div>
                    <div className="author-profile-body">
                      <div className="author-name-row">
                        <div>
                          <h3>{selectedAuthorMeta.name}</h3>
                        </div>
                        <button
                          type="button"
                          className="ghost-btn compact-btn"
                          onClick={clearAuthorFilter}
                        >
                          Back to all posts
                        </button>
                      </div>
                      <div className="author-tags">
                        <span className="author-tag">{selectedAuthorMeta.role}</span>
                        <span className="author-tag">{selectedAuthorMeta.department}</span>
                        <span className="author-tag">Approved Poster</span>
                      </div>
                      <div className="author-stat-grid">
                        <div className="author-stat">
                          <span className="author-stat-value">{selectedAuthorStats?.total ?? 0}</span>
                          <span className="author-stat-label">Total Posts</span>
                        </div>
                        <div className="author-stat">
                          <span className="author-stat-value">{selectedAuthorStats?.active ?? 0}</span>
                          <span className="author-stat-label">Active</span>
                        </div>
                        <div className="author-stat">
                          <span className="author-stat-value">{selectedAuthorStats?.completed ?? 0}</span>
                          <span className="author-stat-label">Completed</span>
                        </div>
                        {canModerate && (
                          <div className="author-stat">
                            <span className="author-stat-value">{selectedAuthorStats?.pending ?? 0}</span>
                            <span className="author-stat-label">Pending</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                )}

                <div className="filters-panel">
                  <div className="filters-row">
                    <input
                      type="text"
                      placeholder="Search posts..."
                      name="postSearch"
                      className="filter-search"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                    />
                  </div>
                  <div className="filter-section">
                    <p className="filter-section-title">Browse By Type</p>
                    <div className="type-grid">
                      {POST_TYPE_TILES.map((tile) => {
                        const count = typeCounts[tile.id] ?? 0;
                        const isActive = filterType === tile.id;
                        return (
                          <button
                            key={tile.id}
                            type="button"
                            className={`type-card ${isActive ? "active" : ""}`}
                            style={{ "--type-accent": tile.accent, "--type-tint": tile.tint }}
                            onClick={() => setFilterType(tile.id)}
                            aria-pressed={isActive}
                          >
                            <div className="type-title-row">
                              <span className="type-dot" />
                              <span className="type-title">{tile.label}</span>
                            </div>
                            <span className="type-meta">{tile.description}</span>
                            <span className="type-count">{count} posts</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="filters-row">
                    {showPriorityFilters && (
                      <div className="filter-chip-group">
                        <span className="filter-label">Priority</span>
                        <div className="filter-chips">
                          {PRIORITY_FILTERS.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              className={`filter-chip ${filterPriority === option.id ? "active" : ""}`}
                              onClick={() => setFilterPriority(option.id)}
                              aria-pressed={filterPriority === option.id}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {!(isStudent && userProfile?.year) && (
                      <div className="filter-chip-group">
                        <span className="filter-label">Year</span>
                        <div className="filter-chips">
                          {YEAR_FILTERS.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              className={`filter-chip ${filterYear === option.id ? "active" : ""}`}
                              onClick={() => setFilterYear(option.id)}
                              aria-pressed={filterYear === option.id}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {isAdminUser && showCompletedTab && activeTab === FEED_TAB.COMPLETED && (
                  <div className="filters-panel">
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={handleCleanupCompletedPosts}
                      disabled={cleanupBusy}
                    >
                      {cleanupBusy ? "Cleaning..." : "Cleanup Old Completed Posts"}
                    </button>
                  </div>
                )}

                {selectedAuthorMeta && (
                  <div className="author-posts-header">
                    <div>
                      <h3>Posts by {selectedAuthorMeta.name}</h3>
                      <p className="hint">{activeTabLabel} posts</p>
                    </div>
                    <span className="hint">{typeCounts[filterType] ?? 0} posts</span>
                  </div>
                )}

                {postsLoading && <p className="hint">Loading posts...</p>}

                {!postsLoading && activeTab === FEED_TAB.FEED && (
                  <div className={selectedAuthorMeta ? "post-stack" : "post-list"}>
                    {feedPostsToRender.length === 0 && <p className="hint">{feedEmptyLabel}</p>}
                    {feedPostsToRender.map((post) => {
                      const mediaUrl = getPostMediaUrl(post);
                      const isPriorityPost = PRIORITY_TYPES.has(post.type);
                      const authorDepartment = getAuthorDepartmentLabel(
                        post,
                        selectedBoardId,
                        userProfile,
                        authUser?.uid
                      );
                      return (
                        <article
                          key={post.id}
                          className="post-card clickable"
                          role="button"
                          tabIndex={0}
                          onClick={() => openPostPreview(post)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openPostPreview(post);
                            }
                          }}
                        >
                          <header className="post-header">
                            <div>
                              <p className="post-meta">
                                Posted by {post.authorName || post.authorEmail || "Home"} - {authorDepartment}
                              </p>
                              <h4>{post.title}</h4>
                            </div>
                            <div className="badge-row">
                              <span className="post-badge">{post.type}</span>
                              {isPriorityPost && (
                                <span className={`priority-badge ${post.priority || "medium"}`}>
                                  {post.priority || "medium"}
                                </span>
                              )}
                            </div>
                          </header>

                          {mediaUrl && (
                            <div className="post-media-wrap">
                              <img
                                src={mediaUrl}
                                alt={post.title || "Post media"}
                                className="post-media"
                              />
                            </div>
                          )}

                          {renderPostBody(post, { stopPropagation: true })}

                          <div className="post-actions">
                            <button
                              type="button"
                              className={`action-btn ${starredPostIds.has(post.id) ? "active" : ""}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleStar(post);
                              }}
                            >
                              {starredPostIds.has(post.id) ? "Starred" : "Star"}
                            </button>
                            {isStudent && isPriorityPost && (
                              <button
                                type="button"
                                className="action-btn"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openReminder(post);
                                }}
                              >
                                Reminder
                              </button>
                            )}
                            {isStudent && (
                              <button
                                type="button"
                                className="action-btn"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openFaqForPost(post);
                                }}
                              >
                                Ask
                              </button>
                            )}
                          </div>

                          <footer className="post-footer">
                            <p className="post-time">{formatTimestamp(post.createdAt)}</p>
                            {isPriorityPost && post.deadlineAt && (
                              <p>Deadline: {formatTimestamp(post.deadlineAt)}</p>
                            )}
                            {canModerate && readStatsByPost[post.id] && (
                              <p>
                                Read {readStatsByPost[post.id].readCount}/{readStatsByPost[post.id].eligibleCount} ({
                                  readStatsByPost[post.id].readPercent
                                }%)
                              </p>
                            )}
                          </footer>
                        </article>
                      );
                    })}
                  </div>
                )}

                {!postsLoading && showCompletedTab && activeTab === FEED_TAB.COMPLETED && (
                  <div className={selectedAuthorMeta ? "post-stack" : "post-list"}>
                    {filteredCompletedPosts.length === 0 && <p className="hint">No completed posts yet.</p>}
                    {filteredCompletedPosts.map((post) => {
                      const mediaUrl = getPostMediaUrl(post);
                      const isPriorityPost = PRIORITY_TYPES.has(post.type);
                      const authorDepartment = getAuthorDepartmentLabel(
                        post,
                        selectedBoardId,
                        userProfile,
                        authUser?.uid
                      );
                      return (
                        <article
                          key={post.id}
                          className="post-card completed clickable"
                          role="button"
                          tabIndex={0}
                          onClick={() => openPostPreview(post)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openPostPreview(post);
                            }
                          }}
                        >
                          <header className="post-header">
                            <div>
                              <p className="post-meta">
                                Posted by {post.authorName || post.authorEmail || "Home"} - {authorDepartment}
                              </p>
                              <h4>{post.title}</h4>
                            </div>
                            <div className="badge-row">
                              <span className="post-badge">{post.type}</span>
                              {isPriorityPost && (
                                <span className={`priority-badge ${post.priority || "medium"}`}>
                                  {post.priority || "medium"}
                                </span>
                              )}
                            </div>
                          </header>

                          {mediaUrl && (
                            <div className="post-media-wrap">
                              <img
                                src={mediaUrl}
                                alt={post.title || "Post media"}
                                className="post-media"
                              />
                            </div>
                          )}

                          {renderPostBody(post, { stopPropagation: true })}

                          <div className="post-actions">
                            <button
                              type="button"
                              className={`action-btn ${starredPostIds.has(post.id) ? "active" : ""}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleStar(post);
                              }}
                            >
                              {starredPostIds.has(post.id) ? "Starred" : "Star"}
                            </button>
                            {isStudent && isPriorityPost && (
                              <button
                                type="button"
                                className="action-btn"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openReminder(post);
                                }}
                              >
                                Reminder
                              </button>
                            )}
                            {isStudent && (
                              <button
                                type="button"
                                className="action-btn"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openFaqForPost(post);
                                }}
                              >
                                Ask
                              </button>
                            )}
                          </div>

                          <footer className="post-footer">
                            <p className="post-time">{formatTimestamp(post.createdAt)}</p>
                            {isPriorityPost && post.deadlineAt && (
                              <p>Deadline: {formatTimestamp(post.deadlineAt)}</p>
                            )}
                            {canModerate && readStatsByPost[post.id] && (
                              <p>
                                Read {readStatsByPost[post.id].readCount}/{readStatsByPost[post.id].eligibleCount} ({
                                  readStatsByPost[post.id].readPercent
                                }%)
                              </p>
                            )}
                          </footer>
                        </article>
                      );
                    })}
                  </div>
                )}

                {!postsLoading && activeTab === FEED_TAB.PENDING && canModerate && (
                  <div className={selectedAuthorMeta ? "post-stack" : "post-list"}>
                    {filteredPendingPosts.length === 0 && <p className="hint">No pending posts for approval.</p>}
                    {filteredPendingPosts.map((post) => (
                      <article key={post.id} className="post-card pending">
                        <h4>{post.title}</h4>
                        {renderPostBody(post)}
                        <footer className="pending-actions">
                          <button
                            type="button"
                            className="approve-btn"
                            disabled={approvingPostId === post.id}
                            onClick={() => handleApproval(post.id, "approve")}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="reject-btn"
                            disabled={approvingPostId === post.id}
                            onClick={() => handleApproval(post.id, "reject")}
                          >
                            Reject
                          </button>
                        </footer>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}

            {canCreateGlobalPost && (
              <button
                type="button"
                className="compose-fab"
                onClick={() => {
                  setComposeOpen(true);
                  setIsError(false);
                  setStatus("");
                }}
                aria-label="Create a post"
                title="Create a post"
              >
                +
              </button>
            )}
          </div>

          <button
            type="button"
            className="right-panel-toggle"
            onClick={() => setIsRightPanelOpen((prev) => !prev)}
            aria-label={isRightPanelOpen ? "Collapse approved posters panel" : "Expand approved posters panel"}
            title={isRightPanelOpen ? "Collapse approved posters panel" : "Expand approved posters panel"}
          >
            <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <line x1="16.2" y1="16.2" x2="20" y2="20" />
            </svg>
          </button>

          <aside className={`right-panel ${isRightPanelOpen ? "open" : "collapsed"}`}>
            <div className="author-panel">
              <div className="author-search">
                <span aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="presentation">
                    <path d="M11 4a7 7 0 1 0 4.24 12.56l3.6 3.6a1 1 0 0 0 1.42-1.42l-3.6-3.6A7 7 0 0 0 11 4z" />
                  </svg>
                </span>
                <input
                  type="text"
                  placeholder="Search approved posters"
                  name="authorSearch"
                  value={authorSearch}
                  onChange={(event) => setAuthorSearch(event.target.value)}
                />
              </div>
              <div className="author-chips" role="group" aria-label="Filter approved posters by role">
                <button
                  type="button"
                  className={`chip-btn ${authorRoleFilter === "all" ? "active" : ""}`}
                  onClick={() => setAuthorRoleFilter("all")}
                  aria-pressed={authorRoleFilter === "all"}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`chip-btn ${authorRoleFilter === "faculty" ? "active" : ""}`}
                  onClick={() => setAuthorRoleFilter("faculty")}
                  aria-pressed={authorRoleFilter === "faculty"}
                >
                  Faculty
                </button>
                <button
                  type="button"
                  className={`chip-btn ${authorRoleFilter === "admin" ? "active" : ""}`}
                  onClick={() => setAuthorRoleFilter("admin")}
                  aria-pressed={authorRoleFilter === "admin"}
                >
                  Admin
                </button>
              </div>
              <div className="author-list">
                <button
                  type="button"
                  className={`author-item ${selectedAuthorUid ? "" : "active"}`}
                  onClick={clearAuthorFilter}
                >
                  <span className="author-avatar">All</span>
                  <div>
                    <p className="author-name">All Approved Posters</p>
                    <p className="author-meta">Show everything</p>
                  </div>
                </button>
                {authorsLoading && <p className="hint">Loading approved posters...</p>}
                {!authorsLoading && filteredAuthors.length === 0 && (
                  <p className="hint">No approved posters found.</p>
                )}
                {!authorsLoading &&
                  filteredAuthors.map((author) => (
                    <button
                      key={author.uid}
                      type="button"
                      className={`author-item ${selectedAuthorUid === author.uid ? "active" : ""}`}
                      onClick={() => selectAuthor(author)}
                    >
                      <span className="avatar small">
                        {author.photoUrl ? (
                          <img
                            src={getOptimizedImageUrl(author.photoUrl)}
                            alt={`${author.name || "Author"} profile`}
                          />
                        ) : (
                          getInitials(author.name || author.email)
                        )}
                      </span>
                      <div>
                        <p className="author-name">{author.name || author.email}</p>
                        <p className="author-meta">
                          {author.department || "Department"} · {author.role || "faculty"}
                        </p>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          </aside>
        </section>
      )}

      {reminderOpen && (
        <div className="compose-overlay" role="dialog" aria-modal="true" aria-label="Set reminder">
          <section className="compose-modal reminder-modal">
            <h3>Set Reminder</h3>
            <p className="description">Choose a date and time for this reminder.</p>
            <input
              type="datetime-local"
              name="reminderDate"
              value={reminderDraft.date}
              onChange={(event) => setReminderDraft((prev) => ({ ...prev, date: event.target.value }))}
            />
            <div className="compose-actions">
              <button className="primary-btn" onClick={saveReminder} type="button">
                Save Reminder
              </button>
              <button
                className="ghost-btn"
                onClick={() => {
                  setReminderOpen(false);
                  setReminderDraft({ postId: "", title: "", date: "" });
                }}
                type="button"
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}

      {editPost && (
        <div className="compose-overlay" role="dialog" aria-modal="true" aria-label="Edit post">
          <section className="compose-modal">
            <h3>Edit Post</h3>
            <p className="description">Update your post details.</p>
            <input
              type="text"
              placeholder="Title"
              name="editTitle"
              value={editForm.title}
              onChange={(event) => setEditForm((prev) => ({ ...prev, title: event.target.value }))}
            />
            <textarea
              placeholder="Write your content..."
              name="editContent"
              value={editForm.content}
              onChange={(event) => setEditForm((prev) => ({ ...prev, content: event.target.value }))}
            />
            {editPostHasPriority && (
              <div className="compose-grid">
                <select
                  name="editPriority"
                  value={editForm.priority}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, priority: event.target.value }))}
                >
                  {PRIORITY_OPTIONS.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
                <input
                  type="datetime-local"
                  name="editDeadline"
                  value={editForm.deadline}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, deadline: event.target.value }))}
                />
              </div>
            )}
            <div className="compose-actions">
              <button className="primary-btn" onClick={handleSaveEdit} type="button">
                Save Changes
              </button>
              <button className="ghost-btn" onClick={closeEditPost} type="button">
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}

      {activePost && (
        <div
          className="post-view-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Post preview"
          onClick={closePostPreview}
        >
          <section
            className="post-view-card"
            role="document"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="post-view-media">
              {activePost && Array.isArray(activePost.mediaUrls) && activePost.mediaUrls.length > 0 ? (
                <div className="image-carousel">
                  <img 
                    src={getOptimizedImageUrl(activePost.mediaUrls[activePostImageIndex])} 
                    alt={`${activePost.title || "Post media"} - Image ${activePostImageIndex + 1}`} 
                  />
                  {activePost.mediaUrls.length > 1 && (
                    <>
                      <button
                        type="button"
                        className="carousel-nav prev"
                        onClick={() => setActivePostImageIndex((prev) => 
                          prev === 0 ? activePost.mediaUrls.length - 1 : prev - 1
                        )}
                        aria-label="Previous image"
                        title="Previous image"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        className="carousel-nav next"
                        onClick={() => setActivePostImageIndex((prev) => 
                          prev === activePost.mediaUrls.length - 1 ? 0 : prev + 1
                        )}
                        aria-label="Next image"
                        title="Next image"
                      >
                        ›
                      </button>
                      <div className="carousel-indicators">
                        {activePost.mediaUrls.map((_, index) => (
                          <button
                            key={index}
                            type="button"
                            className={`indicator ${index === activePostImageIndex ? "active" : ""}`}
                            onClick={() => setActivePostImageIndex(index)}
                            aria-label={`Go to image ${index + 1}`}
                            aria-current={index === activePostImageIndex ? "true" : "false"}
                          />
                        ))}
                      </div>
                      <div className="carousel-counter">
                        {activePostImageIndex + 1} / {activePost.mediaUrls.length}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="post-view-placeholder">
                  <span className="post-view-initials">{getInitials(activePost?.title || "CC")}</span>
                  <p>No image provided</p>
                </div>
              )}
            </div>
            <div className="post-view-body">
              <header className="post-view-header">
                <div className="post-view-author">
                  <span className="avatar small">{getInitials(activePostAuthor)}</span>
                  <div>
                    <p className="post-view-author-name">{activePostAuthor}</p>
                    <p className="post-view-author-meta">{activePostDepartment || "CampusConnect"}</p>
                  </div>
                </div>
                <button className="ghost-btn icon-btn" type="button" onClick={closePostPreview}>
                  Close
                </button>
              </header>
              <div className="post-view-scroll">
                <h3>{activePost.title || "Untitled Post"}</h3>
                <div className="badge-row">
                  <span className="post-badge">{activePostType}</span>
                  {activePostHasPriority && (
                    <span className={`priority-badge ${activePostPriority}`}>{activePostPriority}</span>
                  )}
                </div>
                {renderPostBody(activePost, {
                  contentClassName: "post-view-content",
                  emptyFallback: "No additional details shared yet.",
                })}
              </div>
              <footer className="post-view-footer">
                <div className="post-view-actions">
                  <button
                    type="button"
                    className={`action-btn ${starredPostIds.has(activePost.id) ? "active" : ""}`}
                    onClick={() => toggleStar(activePost)}
                  >
                    {starredPostIds.has(activePost.id) ? "Starred" : "Star"}
                  </button>
                  {isStudent && activePostHasPriority && (
                    <button
                      type="button"
                      className="action-btn"
                      onClick={() => {
                        openReminder(activePost);
                        closePostPreview();
                      }}
                    >
                      Reminder
                    </button>
                  )}
                  {isStudent && (
                    <button
                      type="button"
                      className="action-btn"
                      onClick={() => {
                        openFaqForPost(activePost);
                        closePostPreview();
                      }}
                    >
                      Ask
                    </button>
                  )}
                </div>
                <div className="post-view-meta">
                  <span>{formatTimestamp(activePost.createdAt)}</span>
                  {activePostHasPriority && activePost.deadlineAt && (
                    <span>Deadline: {formatTimestamp(activePost.deadlineAt)}</span>
                  )}
                  {activePost.eventAt && (
                    <span>Event: {formatTimestamp(activePost.eventAt)}</span>
                  )}
                  {canModerate && readStatsByPost[activePost.id] && (
                    <span>
                      Read {readStatsByPost[activePost.id].readCount}/{
                        readStatsByPost[activePost.id].eligibleCount
                      } ({readStatsByPost[activePost.id].readPercent}%)
                    </span>
                  )}
                </div>
              </footer>
            </div>
          </section>
        </div>
      )}

      {composeOpen && (
        <div className="compose-overlay" role="dialog" aria-modal="true" aria-label="Create post">
          <section className="compose-modal">
            <h3>Create Post</h3>
            <p className="hint">Post for a specific department or all departments.</p>

            <input
              type="text"
              placeholder="Title"
              name="postTitle"
              value={composeForm.title}
              onChange={(event) => setComposeForm((prev) => ({ ...prev, title: event.target.value }))}
            />

            <textarea
              placeholder="Write your content..."
              name="postContent"
              value={composeForm.content}
              onChange={(event) => setComposeForm((prev) => ({ ...prev, content: event.target.value }))}
            />

            <label className="file-label">
              Upload images (multiple images allowed)
              <input
                type="file"
                name="postImages"
                accept="image/*"
                multiple
                onChange={handleComposeFileSelect}
              />
            </label>
            {composeFiles.length > 0 && (
              <div className="compose-image-preview">
                <p className="hint">{composeFiles.length} image(s) selected</p>
                <div className="image-list">
                  {composeFiles.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="image-item">
                      <span>{file.name}</span>
                      <button
                        type="button"
                        className="ghost-btn compact-btn"
                        onClick={() => removeComposeFile(index)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                {composeFiles.length > 0 && (
                  <button
                    type="button"
                    className="ghost-btn compact-btn"
                    onClick={clearComposeFiles}
                  >
                    Clear All Images
                  </button>
                )}
              </div>
            )}

            <div className="compose-grid">
              <select
                name="postTargetMode"
                value={composeForm.targetMode}
                onChange={(event) => setComposeForm((prev) => ({ ...prev, targetMode: event.target.value }))}
              >
                <option value="specific">Specific Department</option>
                <option value="all">All Departments</option>
              </select>

              <select
                name="postTargetBoard"
                value={composeForm.targetBoardId}
                onChange={(event) => setComposeForm((prev) => ({ ...prev, targetBoardId: event.target.value }))}
                disabled={composeForm.targetMode === "all"}
              >
                {BOARDS.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.shortName}
                  </option>
                ))}
              </select>

              <select
                name="postType"
                value={composeForm.type}
                onChange={(event) => {
                  const nextType = event.target.value;
                  const shouldUseEventDate =
                    nextType === "event" || nextType === "hackathon" || nextType === "workshop";
                  const shouldUsePriority = PRIORITY_TYPES.has(nextType);
                  setComposeForm((prev) => ({
                    ...prev,
                    type: nextType,
                    eventDate: shouldUseEventDate ? prev.eventDate : "",
                    deadline: shouldUsePriority ? prev.deadline : "",
                    priority: shouldUsePriority ? prev.priority : "medium",
                  }));
                }}
              >
                {POST_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>

              {PRIORITY_TYPES.has(composeForm.type) && (
                <select
                  name="postPriority"
                  value={composeForm.priority}
                  onChange={(event) => setComposeForm((prev) => ({ ...prev, priority: event.target.value }))}
                >
                  {PRIORITY_OPTIONS.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              )}

              <select
                name="postTargetYear"
                value={composeForm.targetYear}
                onChange={(event) => setComposeForm((prev) => ({ ...prev, targetYear: event.target.value }))}
              >
                <option value="all">All Years</option>
                <option value="1">1st Year</option>
                <option value="2">2nd Year</option>
                <option value="3">3rd Year</option>
                <option value="4">4th Year</option>
              </select>
            </div>

            <input
              type="text"
              placeholder="Optional link (https://...)"
              name="postLink"
              value={composeForm.link}
              onChange={(event) => setComposeForm((prev) => ({ ...prev, link: event.target.value }))}
            />

            {PRIORITY_TYPES.has(composeForm.type) && (
              <label className="deadline-label">
                Deadline (optional)
                <input
                  type="datetime-local"
                  name="postDeadline"
                  value={composeForm.deadline}
                  onChange={(event) => setComposeForm((prev) => ({ ...prev, deadline: event.target.value }))}
                />
              </label>
            )}
            {(composeForm.type === "event" ||
              composeForm.type === "hackathon" ||
              composeForm.type === "workshop") && (
              <label className="deadline-label">
                Event date (optional)
                <input
                  type="datetime-local"
                  name="postEventDate"
                  value={composeForm.eventDate}
                  onChange={(event) => setComposeForm((prev) => ({ ...prev, eventDate: event.target.value }))}
                />
              </label>
            )}

            <div className="compose-actions">
              <button className="primary-btn" onClick={handleCreatePost} disabled={submittingPost} type="button">
                {submittingPost
                  ? uploadProgress > 0 && uploadProgress < 100
                    ? `Saving ${uploadProgress}%...`
                    : "Saving..."
                  : "Post"}
              </button>
              <button
                className="ghost-btn"
                onClick={() => {
                  setComposeOpen(false);
                  resetComposeForm();
                }}
                type="button"
              >
                Cancel
              </button>
            </div>
            <p className={`compose-status ${statusClass}`} role="status" aria-live="polite">
              {status}
            </p>
          </section>
        </div>
      )}
    </main>
  );
}





