// Firebase Cloud Messaging Service Worker
// Handles background push notifications
// Place this file in: frontend/public/firebase-messaging-sw.js

importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCT20gNsOZOaROBnHJuiuujXz5tHHxL6Nw',
  authDomain: 'collegebustracker-1c6d9.firebaseapp.com',
  projectId: 'collegebustracker-1c6d9',
  storageBucket: 'collegebustracker-1c6d9.firebasestorage.app',
  messagingSenderId: '805302719283',
  appId: '1:805302719283:web:740e764134aaddd9de6446',
});

const messaging = firebase.messaging();

// Handle background messages (when the app is not in focus)
messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || '🚌 Bus Tracker', {
    body: body || 'New bus update',
    icon: icon || '/bus-icon.svg',
    badge: '/bus-icon.svg',
    tag: 'bus-update',
    renotify: true,
    data: payload.data,
  });
});
