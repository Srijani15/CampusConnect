import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { getToken } from "firebase/messaging";
import {
  Timestamp,
  addDoc,
  collection,
  doc,
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
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import {
  ALLOWED_DOMAIN,
  auth,
  db,
  getMessagingIfSupported,
  isAllowedEmail,
  provider,
  storage,
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
      "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1000&q=80",
  },
  {
    id: "cse-aiml",
    name: "CSE (AI & ML)",
    shortName: "CSE-AIML",
    thumbnail:
      "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1000&q=80",
  },
  {
    id: "ece",
    name: "Electronics & Communication",
    shortName: "ECE",
    thumbnail:
      "https://images.unsplash.com/photo-1516116216624-53e697fedbea?auto=format&fit=crop&w=1000&q=80",
  },
  {
    id: "eee",
    name: "Electrical & Electronics",
    shortName: "EEE",
    thumbnail:
      "https://images.unsplash.com/photo-1544723795-3fb6469f5b39?auto=format&fit=crop&w=1000&q=80",
  },
  {
    id: "it",
    name: "Information Technology",
    shortName: "IT",
    thumbnail:
      "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1000&q=80",
  },
];

const STUDENT_YEAR_BY_PREFIX = {
  "25": 1,
  "24": 2,
  "23": 3,
  "22": 4,
};

const PRIORITY_RANK = {
  high: 1,
  medium: 2,
  low: 3,
};

const POST_TYPES = ["notice", "event", "hackathon", "workshop", "announcement"];
const PRIORITY_OPTIONS = ["high", "medium", "low"];
const MAX_UPLOAD_BYTES = 7 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 45000;
const PUBLISH_TIMEOUT_MS = 30000;

function parseEmailIdentity(email) {
  const localPart = (email || "").split("@")[0]?.toLowerCase() || "";
  const startsWithDigit = /^[0-9]/.test(localPart);

  if (startsWithDigit) {
    const prefix = localPart.slice(0, 2);
    return {
      role: "student",
      year: STUDENT_YEAR_BY_PREFIX[prefix] ?? null,
      authorApproved: false,
    };
  }

  return {
    role: "faculty",
    year: null,
    authorApproved: true,
  };
}

function toStatusMessage(error, fallback) {
  const code = error?.code || "";
  if (code === "permission-denied") {
    return "You are signed in, but Firestore permissions are denying access.";
  }
  if (code === "storage/unauthorized") {
    return "Image upload denied by Firebase Storage rules. Deploy storage rules: firebase deploy --only storage --project campusconnect-55cca";
  }
  if (code === "storage/unauthenticated") {
    return "Upload failed because your session expired. Please log out and sign in again.";
  }
  if (code === "storage/quota-exceeded") {
    return "Firebase Storage quota exceeded for this project.";
  }
  if (code === "storage/retry-limit-exceeded") {
    return "Upload timed out due to network issues. Try again with a smaller image.";
  }
  if (code === "storage/canceled") {
    return "Upload canceled.";
  }
  if (code === "storage/unknown") {
    return "Image upload failed. Check internet and ensure Firebase Storage is enabled for project campusconnect-55cca.";
  }
  if (code === "deadline-exceeded") {
    return "Request timed out. Please try again with a smaller image or better network.";
  }
  if (String(error?.message || "").toLowerCase().includes("timed out")) {
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

function uploadImageWithProgress(storageRef, file, onProgress, timeoutMs = UPLOAD_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, file);
    const timeoutId = setTimeout(() => {
      uploadTask.cancel();
      const error = new Error("Image upload timed out");
      error.code = "deadline-exceeded";
      reject(error);
    }, timeoutMs);

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        if (!snapshot.totalBytes) return;
        const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        onProgress(progress);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
      async () => {
        clearTimeout(timeoutId);
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(url);
        } catch (error) {
          reject(error);
        }
      }
    );
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
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
  });

  const hasMissingValue = Array.from(params.values()).some((value) => !value);
  if (hasMissingValue) return null;

  return `/firebase-messaging-sw.js?${params.toString()}`;
}

export default function App() {
  const [view, setView] = useState(VIEW.WELCOME);
  const [status, setStatus] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [authUser, setAuthUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
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
  const [composeFile, setComposeFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pushRegistered, setPushRegistered] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterYear, setFilterYear] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [readStatsByPost, setReadStatsByPost] = useState({});
  const [composeForm, setComposeForm] = useState({
    title: "",
    content: "",
    type: "notice",
    category: "general",
    priority: "medium",
    targetYear: "all",
    deadline: "",
    targetMode: "specific",
    targetBoardId: BOARDS[0].id,
  });

  const selectedBoard = useMemo(
    () => BOARDS.find((board) => board.id === selectedBoardId) || BOARDS[0],
    [selectedBoardId]
  );
  const statusClass = useMemo(() => (isError ? "status error" : "status success"), [isError]);
  const canModerate = isModerator(userProfile);
  const canCreateGlobalPost = Boolean(userProfile?.role === "faculty" || userProfile?.role === "admin" || userProfile?.authorApproved === true);

  const allCategoryValues = useMemo(() => {
    const values = [...posts, ...completedPosts, ...pendingPosts]
      .map((item) => (item.category || "").toLowerCase().trim())
      .filter(Boolean);
    return Array.from(new Set(values)).sort();
  }, [posts, completedPosts, pendingPosts]);

  function resetComposeForm() {
    setComposeForm({
      title: "",
      content: "",
      type: "notice",
      category: "general",
      priority: "medium",
      targetYear: "all",
      deadline: "",
      targetMode: "specific",
      targetBoardId: selectedBoardId,
    });
    setComposeFile(null);
    setUploadProgress(0);
  }

  function clearFilters() {
    setSearchTerm("");
    setFilterType("all");
    setFilterPriority("all");
    setFilterYear("all");
    setFilterCategory("all");
  }

  function applyFilters(list) {
    const keyword = searchTerm.toLowerCase().trim();
    const selectedYear = filterYear === "all" ? null : Number(filterYear);

    return list.filter((post) => {
      if (filterType !== "all" && post.type !== filterType) return false;
      if (filterPriority !== "all" && post.priority !== filterPriority) return false;
      if (filterCategory !== "all" && (post.category || "").toLowerCase() !== filterCategory) return false;
      if (selectedYear && !isVisibleForYear(post, selectedYear)) return false;

      if (!keyword) return true;
      const haystack = `${post.title || ""} ${post.content || ""} ${post.category || ""}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }

  const filteredFeedPosts = useMemo(() => applyFilters(posts), [
    posts,
    searchTerm,
    filterType,
    filterPriority,
    filterYear,
    filterCategory,
  ]);
  const filteredCompletedPosts = useMemo(() => applyFilters(completedPosts), [
    completedPosts,
    searchTerm,
    filterType,
    filterPriority,
    filterYear,
    filterCategory,
  ]);
  const filteredPendingPosts = useMemo(() => applyFilters(pendingPosts), [
    pendingPosts,
    searchTerm,
    filterType,
    filterPriority,
    filterYear,
    filterCategory,
  ]);

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

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;

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
        role: inferredIdentity.role,
        department: "",
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
        authorApproved: nextAuthorApproved,
      },
      { merge: true }
    );

    return {
      ...existing,
      uid: user.uid,
      name: user.displayName || existing.name || "",
      email: user.email || existing.email || "",
      role: nextRole,
      year: nextYear,
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

  async function autoCompleteExpiredPosts(boardId) {
    if (!canModerate) return;
    try {
      const expiryQuery = query(
        collection(db, "posts"),
        where("boardId", "==", boardId),
        where("lifecycleStatus", "==", "active"),
        where("deadlineAt", "<=", Timestamp.now()),
        orderBy("deadlineAt", "asc"),
        limit(30)
      );
      const expiredSnapshot = await getDocs(expiryQuery);
      for (const item of expiredSnapshot.docs) {
        const data = item.data();
        if (data.visibility !== "published") continue;
        await updateDoc(doc(db, "posts", item.id), {
          lifecycleStatus: "completed",
          completedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog("mark_completed", item.id, boardId, { automated: true });
      }
    } catch (error) {
      // Non-blocking.
    }
  }

  async function loadDepartmentData(boardId, profile, user, options = {}) {
    const silentErrors = options.silentErrors === true;
    setPostsLoading(true);
    try {
      await autoCompleteExpiredPosts(boardId);

      const feedQuery = query(
        collection(db, "posts"),
        where("boardId", "==", boardId),
        where("visibility", "==", "published"),
        where("lifecycleStatus", "==", "active"),
        orderBy("urgencyScore", "asc"),
        orderBy("createdAt", "desc"),
        limit(80)
      );

      const completedQuery = canModerate
        ? query(
            collection(db, "posts"),
            where("boardId", "==", boardId),
            where("lifecycleStatus", "==", "completed"),
            orderBy("completedAt", "desc"),
            limit(80)
          )
        : query(
            collection(db, "posts"),
            where("boardId", "==", boardId),
            where("visibility", "==", "published"),
            where("lifecycleStatus", "==", "completed"),
            orderBy("completedAt", "desc"),
            limit(80)
          );

      const pendingQuery = canModerate
        ? query(
            collection(db, "posts"),
            where("boardId", "==", boardId),
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

      const nextFeedPosts = feedSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      const nextCompletedPosts = completedSnapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => item.visibility === "published");
      const nextPendingPosts = pendingSnapshot
        ? pendingSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
        : [];

      setPosts(nextFeedPosts);
      setCompletedPosts(nextCompletedPosts);
      setPendingPosts(nextPendingPosts);

      await markFeedPostsRead(nextFeedPosts, user, profile);
      await loadReadAnalytics(nextFeedPosts);
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
    if (!authUser || !userProfile || pushRegistered === true) return;
    registerPushToken(authUser, userProfile);
  }, [authUser, userProfile, pushRegistered]);

  useEffect(() => {
    if (view !== VIEW.DASHBOARD || dashboardPage !== DASHBOARD_PAGE.DEPARTMENT || !authUser || !userProfile) {
      return;
    }
    loadDepartmentData(selectedBoardId, userProfile, authUser);
  }, [view, dashboardPage, selectedBoardId, authUser, userProfile]);

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
    const category = composeForm.category.trim().toLowerCase();

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

    if (composeFile && !String(composeFile.type || "").startsWith("image/")) {
      setIsError(true);
      setStatus("Only image files are allowed.");
      return;
    }

    if (composeFile && composeFile.size > MAX_UPLOAD_BYTES) {
      setIsError(true);
      setStatus("Image is too large. Please upload an image below 7 MB.");
      return;
    }

    const deadlineDate = composeForm.deadline ? new Date(composeForm.deadline) : null;
    if (deadlineDate && Number.isNaN(deadlineDate.getTime())) {
      setIsError(true);
      setStatus("Invalid deadline format.");
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

    setSubmittingPost(true);
    setUploadProgress(0);
    setIsError(false);
    setStatus("Publishing post...");

    try {
      let mediaUrl = "";
      if (composeFile) {
        const safeName = composeFile.name.replace(/\s+/g, "-");
        const storageRef = ref(storage, `posts/${authUser.uid}/${Date.now()}-${safeName}`);
        setStatus("Uploading image... 0%");
        mediaUrl = await uploadImageWithProgress(storageRef, composeFile, (progress) => {
          setUploadProgress(progress);
          if (progress < 100) {
            setStatus(`Uploading image... ${progress}%`);
          }
        }, UPLOAD_TIMEOUT_MS);
        setStatus("Publishing post...");
      }

      const urgencyScore = computeUrgencyScore(composeForm.priority, deadlineDate);

      await withTimeout(Promise.all(
        targetBoardIds.map(async (boardId) => {
          const board = BOARDS.find((item) => item.id === boardId);
          const postRef = await addDoc(collection(db, "posts"), {
            boardId,
            boardName: board?.name || boardId,
            type: composeForm.type,
            category: category || "general",
            title,
            content,
            mediaUrls: mediaUrl ? [mediaUrl] : [],
            priority: composeForm.priority,
            priorityRank: getPriorityRank(composeForm.priority),
            urgencyScore,
            year: targetYear,
            audienceYears: targetYear ? [targetYear] : [],
            searchTokens: tokenizeText(`${title} ${content} ${category} ${composeForm.type}`),
            deadlineAt: deadlineDate ? Timestamp.fromDate(deadlineDate) : null,
            completedAt: null,
            lifecycleStatus: "active",
            visibility: "published",
            approvalStatus: "approved",
            authorUid: authUser.uid,
            authorName: authUser.displayName || "",
            authorEmail: authUser.email || "",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          await writeAuditLog("create_post", postRef.id, boardId, {
            targetMode: composeForm.targetMode,
            priority: composeForm.priority,
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
    setIsError(false);
    setStatus("Logged out successfully.");
    setView(VIEW.LOGIN);
  }

  function openDepartment(boardId) {
    setSelectedBoardId(boardId);
    setComposeForm((prev) => ({ ...prev, targetBoardId: boardId, targetMode: "specific" }));
    setActiveTab(FEED_TAB.FEED);
    clearFilters();
    setDashboardPage(DASHBOARD_PAGE.DEPARTMENT);
    setStatus("");
    setIsError(false);
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
    <main className="app-shell">
      <div className="aurora" aria-hidden="true" />
      <div className="aurora aurora-two" aria-hidden="true" />

      {view === VIEW.WELCOME && (
        <section className="surface-card landing-card minimal-card">
          <h1 className="hero-title">CampusConnect</h1>
          <p className="description">
            A clean social notice network for campus departments. Stay updated with events, workshops,
            hackathons, and announcements.
          </p>
          <button className="primary-btn" onClick={() => setView(VIEW.LOGIN)} type="button">
            Go to Sign In
          </button>
        </section>
      )}

      {view === VIEW.LOGIN && (
        <section className="surface-card auth-card minimal-card" aria-hidden="false">
          <h2>Sign In</h2>
          <p className="description">Use your institutional Google account to enter CampusConnect.</p>
          <button className="primary-btn" onClick={handleGoogleLogin} type="button">
            Sign in with Google
          </button>
          <p className={statusClass} role="status" aria-live="polite">
            {status}
          </p>
        </section>
      )}

      {view === VIEW.DASHBOARD && (
        <section className="surface-card dashboard-shell" aria-hidden="false">
          <header className="dashboard-header compact-header">
            <div>
              <h2>CampusConnect</h2>
              <p className="description">Welcome, {userProfile?.name || email}</p>
            </div>
            <button className="ghost-btn compact-btn" onClick={handleLogout} type="button">
              Log out
            </button>
          </header>

          <section className="profile-brief">
            <span className="profile-pill">Role: {userProfile?.role || "student"}</span>
            <span className="profile-pill">
              Year: {userProfile?.year ? `${userProfile.year}` : "NA"}
            </span>
            <span className="profile-pill">Email: {email}</span>
          </section>

          {dashboardPage === DASHBOARD_PAGE.HOME && (
            <div className="thumbnail-grid">
              {BOARDS.map((board) => (
                <button
                  key={board.id}
                  className="thumbnail-card"
                  onClick={() => openDepartment(board.id)}
                  type="button"
                >
                  <img src={board.thumbnail} alt={board.name} className="thumbnail-img" />
                  <div className="thumbnail-body">
                    <p className="thumbnail-chip">{board.shortName}</p>
                    <h3>{board.name}</h3>
                    <span className="thumbnail-link">Open Board</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {dashboardPage === DASHBOARD_PAGE.DEPARTMENT && (
            <div className="department-page">
              <section className="section-head section-head-row">
                <div>
                  <h3>{selectedBoard.name}</h3>
                </div>
                <button
                  className="ghost-btn compact-btn"
                  onClick={() => setDashboardPage(DASHBOARD_PAGE.HOME)}
                  type="button"
                >
                  Back
                </button>
              </section>

              <div className="feed-tabs">
                <button
                  type="button"
                  className={activeTab === FEED_TAB.FEED ? "tab-btn active" : "tab-btn"}
                  onClick={() => setActiveTab(FEED_TAB.FEED)}
                >
                  Feed
                </button>
                <button
                  type="button"
                  className={activeTab === FEED_TAB.COMPLETED ? "tab-btn active" : "tab-btn"}
                  onClick={() => setActiveTab(FEED_TAB.COMPLETED)}
                >
                  Completed
                </button>
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

              <div className="filters-panel">
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
                <select value={filterType} onChange={(event) => setFilterType(event.target.value)}>
                  <option value="all">All Types</option>
                  {POST_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <select value={filterPriority} onChange={(event) => setFilterPriority(event.target.value)}>
                  <option value="all">All Priority</option>
                  {PRIORITY_OPTIONS.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
                <select value={filterYear} onChange={(event) => setFilterYear(event.target.value)}>
                  <option value="all">All Years</option>
                  <option value="1">1st Year</option>
                  <option value="2">2nd Year</option>
                  <option value="3">3rd Year</option>
                  <option value="4">4th Year</option>
                </select>
                <select value={filterCategory} onChange={(event) => setFilterCategory(event.target.value)}>
                  <option value="all">All Categories</option>
                  {allCategoryValues.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              {postsLoading && <p className="hint">Loading posts...</p>}

              {!postsLoading && activeTab === FEED_TAB.FEED && (
                <div className="post-list">
                  {filteredFeedPosts.length === 0 && <p className="hint">No active posts found.</p>}
                  {filteredFeedPosts.map((post) => (
                    <article key={post.id} className="post-card">
                      <header className="post-header">
                        <div className="badge-row">
                          <span className="post-badge">{post.type}</span>
                          <span className={`priority-badge ${post.priority || "medium"}`}>
                            {post.priority || "medium"}
                          </span>
                          {post.category && <span className="post-badge soft">{post.category}</span>}
                        </div>
                        <p className="post-time">{formatTimestamp(post.createdAt)}</p>
                      </header>

                      {Array.isArray(post.mediaUrls) && post.mediaUrls[0] && (
                        <div className="post-media-wrap">
                          <img src={post.mediaUrls[0]} alt={post.title || "Post media"} className="post-media" />
                        </div>
                      )}

                      <h4>{post.title}</h4>
                      <p>{post.content}</p>

                      <footer className="post-footer">
                        <p>By {post.authorName || post.authorEmail || "Unknown"}</p>
                        {post.deadlineAt && <p>Deadline: {formatTimestamp(post.deadlineAt)}</p>}
                        {canModerate && readStatsByPost[post.id] && (
                          <p>
                            Read {readStatsByPost[post.id].readCount}/{readStatsByPost[post.id].eligibleCount} (
                            {readStatsByPost[post.id].readPercent}%)
                          </p>
                        )}
                      </footer>
                    </article>
                  ))}
                </div>
              )}

              {!postsLoading && activeTab === FEED_TAB.COMPLETED && (
                <div className="post-list">
                  {filteredCompletedPosts.length === 0 && <p className="hint">No completed posts yet.</p>}
                  {filteredCompletedPosts.map((post) => (
                    <article key={post.id} className="post-card completed">
                      <h4>{post.title}</h4>
                      <p>{post.content}</p>
                    </article>
                  ))}
                </div>
              )}

              {!postsLoading && activeTab === FEED_TAB.PENDING && canModerate && (
                <div className="post-list">
                  {filteredPendingPosts.length === 0 && <p className="hint">No pending posts for approval.</p>}
                  {filteredPendingPosts.map((post) => (
                    <article key={post.id} className="post-card pending">
                      <h4>{post.title}</h4>
                      <p>{post.content}</p>
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

          <p className={statusClass} role="status" aria-live="polite">
            {status}
          </p>

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
        </section>
      )}

      {composeOpen && (
        <div className="compose-overlay" role="dialog" aria-modal="true" aria-label="Create post">
          <section className="compose-modal">
            <h3>Create Post</h3>
            <p className="hint">Post for a specific department or all departments.</p>

            <input
              type="text"
              placeholder="Title"
              value={composeForm.title}
              onChange={(event) => setComposeForm((prev) => ({ ...prev, title: event.target.value }))}
            />

            <textarea
              placeholder="Write your content..."
              value={composeForm.content}
              onChange={(event) => setComposeForm((prev) => ({ ...prev, content: event.target.value }))}
            />

            <label className="file-label">
              Upload image
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setComposeFile(event.target.files?.[0] || null)}
              />
            </label>
            {composeFile && <p className="hint">Selected file: {composeFile.name}</p>}

            <div className="compose-grid">
              <select
                value={composeForm.targetMode}
                onChange={(event) => setComposeForm((prev) => ({ ...prev, targetMode: event.target.value }))}
              >
                <option value="specific">Specific Department</option>
                <option value="all">All Departments</option>
              </select>

              <select
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
                value={composeForm.type}
                onChange={(event) => setComposeForm((prev) => ({ ...prev, type: event.target.value }))}
              >
                {POST_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>

              <select
                value={composeForm.priority}
                onChange={(event) => setComposeForm((prev) => ({ ...prev, priority: event.target.value }))}
              >
                {PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>

              <select
                value={composeForm.targetYear}
                onChange={(event) => setComposeForm((prev) => ({ ...prev, targetYear: event.target.value }))}
              >
                <option value="all">All Years</option>
                <option value="1">1st Year</option>
                <option value="2">2nd Year</option>
                <option value="3">3rd Year</option>
                <option value="4">4th Year</option>
              </select>

              <input
                type="text"
                placeholder="Category"
                value={composeForm.category}
                onChange={(event) => setComposeForm((prev) => ({ ...prev, category: event.target.value }))}
              />
            </div>

            <label className="deadline-label">
              Deadline (optional)
              <input
                type="datetime-local"
                value={composeForm.deadline}
                onChange={(event) => setComposeForm((prev) => ({ ...prev, deadline: event.target.value }))}
              />
            </label>

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

