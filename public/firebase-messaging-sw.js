/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/11.4.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.4.0/firebase-messaging-compat.js");

const configParams = new URL(self.location.href).searchParams;

const firebaseConfig = {
  apiKey: configParams.get("apiKey"),
  authDomain: configParams.get("authDomain"),
  projectId: configParams.get("projectId"),
  storageBucket: configParams.get("storageBucket"),
  messagingSenderId: configParams.get("messagingSenderId"),
  appId: configParams.get("appId"),
};

const hasMissingFirebaseConfig = Object.values(firebaseConfig).some((value) => !value);

if (!hasMissingFirebaseConfig) {
  firebase.initializeApp(firebaseConfig);

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
}
