# CampusConnect Firestore Schema (Social Feed Version)

Collections are auto-created in Firestore when the first document is written.  
So you do not manually "create collection" first; you create the first document with this shape.

## 1) `users/{uid}`
Core user profile.

Required fields:
- `uid` string
- `name` string
- `email` string
- `role` string: `student | faculty | admin`
- `year` number or null (`1..4` for students, `null` for faculty/admin)
- `department` string
- `authorApproved` boolean
- `createdAt` timestamp

## 2) `boards/{boardId}`
Department boards.

Example `boardId`:
- `cse`, `cse-aiml`, `ece`, `eee`, `it`

Fields:
- `boardId` string
- `name` string
- `active` boolean
- `createdBy` string (uid)
- `updatedAt` timestamp

## 3) `posts/{postId}`
Main social-style feed item (supports notice/event/hackathon/workshop/etc).

Required fields:
- `boardId` string
- `type` string: `notice | event | hackathon | workshop | announcement`
- `category` string (free text category for filters)
- `title` string
- `content` string
- `mediaUrls` array of strings (image/video/document URLs)
- `priority` string: `high | medium | low`
- `priorityRank` number (recommended: high=1, medium=2, low=3)
- `urgencyScore` number (lower means more urgent)
- `year` number or null (single year target if needed)
- `audienceYears` array (example: `[1,2]` or `[]` for all)
- `searchTokens` array of strings (normalized keywords)
- `deadlineAt` timestamp or null
- `completedAt` timestamp or null
- `lifecycleStatus` string: `active | completed | archived`
- `visibility` string: `pending | published | rejected`
- `approvalStatus` string: `pending | approved | rejected`
- `authorUid` string
- `authorName` string
- `authorEmail` string
- `createdAt` timestamp
- `updatedAt` timestamp

Workflow:
- Faculty/Admin create directly with `visibility=published`, `approvalStatus=approved`.
- Student create with `visibility=pending`, `approvalStatus=pending`.
- Faculty/Admin approve by updating to published/approved.
- When deadline passes, set `lifecycleStatus=completed`, `completedAt=now`.

## 4) `postReads/{readId}`
Read/unread and engagement tracking.

Recommended `readId` format:
- `${postId}_${viewerUid}`

Fields:
- `postId` string
- `boardId` string
- `viewerUid` string
- `viewerEmail` string
- `viewerYear` number or null
- `viewedAt` timestamp

## 5) `auditLogs/{logId}`
Audit trail for enterprise-style tracking.

Fields:
- `actorUid` string
- `actorEmail` string
- `actorRole` string
- `action` string (`create_post`, `approve_post`, `reject_post`, `mark_completed`, `edit_post`)
- `targetType` string (`post`, `user`, `board`)
- `targetId` string
- `boardId` string
- `createdAt` timestamp
- `metadata` map (optional)

## 6) `notificationTokens/{tokenId}`
FCM device token storage for push delivery.

Fields:
- `uid` string
- `email` string
- `token` string
- `boardSubscriptions` array of strings (example: `["all"]` or `["cse","ece"]`)
- `notificationsEnabled` boolean
- `year` number or null
- `role` string
- `createdAt` timestamp
- `updatedAt` timestamp

## Required Indexes
All required composite indexes are already listed in:
- `firestore.indexes.json`

Deploy them with:

```bash
firebase deploy --only firestore:indexes --project campusconnect-55cca
```

Deploy rules with:

```bash
firebase deploy --only firestore:rules --project campusconnect-55cca
```

Deploy both:

```bash
firebase deploy --only firestore --project campusconnect-55cca
```
