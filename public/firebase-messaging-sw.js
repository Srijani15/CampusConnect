/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/11.4.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.4.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyA1mirE2AJWx5k58gCiauZ05VHf5aPg_7I",
  authDomain: "campusconnect-55cca.firebaseapp.com",
  projectId: "campusconnect-55cca",
  storageBucket: "campusconnect-55cca.firebasestorage.app",
  messagingSenderId: "882891881661",
  appId: "1:882891881661:web:f1610cd134db1c50c54bd4",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || "CampusConnect";
  const options = {
    body: payload?.notification?.body || "New department update is available.",
    icon: "/favicon.ico",
    data: payload?.data || {},
  };

  self.registration.showNotification(title, options);
});
