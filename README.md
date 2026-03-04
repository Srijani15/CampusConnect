# CampusConnect (React + Firebase)

Phase 1 implemented:
- Welcome dashboard
- Login with Google
- Domain restriction for `@bvrithyderabad.edu.in`

## Run locally

```powershell
cd c:\Users\srija\MINI_PROJECT\CampusConnect
npm install
npm run dev
```

Open the URL shown in terminal (usually `http://localhost:5173`).

## Firebase setup checklist

1. Open Firebase Console.
2. Create/select your project.
3. Authentication -> Sign-in method -> enable Google.
4. Authentication -> Settings -> Authorized domains:
   - add `localhost`
5. Keep your Firebase config in `src/firebase.js`.

## Note on security

Frontend domain checks are good for UX, but strict security should also be enforced using backend rules.

## Firestore data model used by app

- `users/{uid}`
  - `uid`, `name`, `email`, `role` (`student|admin`), `authorApproved` (`boolean`)
- `boards/{boardId}`
  - `boardId`, `name`, `active`, `createdBy`, `updatedAt`
- `notices/{noticeId}`
  - `boardId`, `boardName`, `title`, `content`, `authorUid`, `authorName`, `authorEmail`, `approved`, `createdAt`, `updatedAt`

## Default boards created after login

- `cse` -> CSE
- `cse-aiml` -> CSE(AI & ML)
- `ece` -> ECE
- `eee` -> EEE
- `it` -> IT

## Deploy rules and indexes

If you use Firebase CLI in this project folder:

```powershell
firebase login
firebase use campusconnect-55cca
firebase deploy --only firestore
```
