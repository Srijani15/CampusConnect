const admin = require("firebase-admin");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");

admin.initializeApp();

function uniqueTokenDocs(snapshots) {
  const byToken = new Map();
  for (const snapshot of snapshots) {
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (!data || !data.token) return;
      byToken.set(data.token, data);
    });
  }
  return Array.from(byToken.values());
}

function shouldNotifyToken(post, tokenDoc) {
  if (tokenDoc.notificationsEnabled === false) return false;
  if (!tokenDoc.token) return false;

  const targetYears = Array.isArray(post.audienceYears) ? post.audienceYears : [];
  if (targetYears.length === 0) return true;

  if (tokenDoc.year == null) return true;
  return targetYears.includes(tokenDoc.year);
}

async function sendInBatches(tokens, payload) {
  const chunks = [];
  for (let i = 0; i < tokens.length; i += 500) {
    chunks.push(tokens.slice(i, i + 500));
  }

  for (const tokenChunk of chunks) {
    const response = await admin.messaging().sendEachForMulticast({
      tokens: tokenChunk,
      notification: payload.notification,
      data: payload.data,
    });
    logger.info("FCM multicast result", {
      successCount: response.successCount,
      failureCount: response.failureCount,
    });
  }
}

exports.notifyOnPublishedPost = onDocumentCreated("posts/{postId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  const post = snapshot.data();
  if (!post || post.visibility !== "published") return;
  if (!post.boardId || !post.title) return;

  const db = admin.firestore();
  const [boardSubscribers, allSubscribers] = await Promise.all([
    db.collection("notificationTokens").where("boardSubscriptions", "array-contains", post.boardId).get(),
    db.collection("notificationTokens").where("boardSubscriptions", "array-contains", "all").get(),
  ]);

  const tokenDocs = uniqueTokenDocs([boardSubscribers, allSubscribers]);
  const filteredTokens = tokenDocs.filter((tokenDoc) => shouldNotifyToken(post, tokenDoc)).map((item) => item.token);

  if (filteredTokens.length === 0) {
    logger.info("No target tokens for post", { postId: snapshot.id, boardId: post.boardId });
    return;
  }

  const payload = {
    notification: {
      title: `${post.boardName || post.boardId}: ${post.title}`,
      body: post.content || "New post available.",
    },
    data: {
      postId: snapshot.id,
      boardId: post.boardId,
      type: post.type || "notice",
    },
  };

  await sendInBatches(filteredTokens, payload);
});
