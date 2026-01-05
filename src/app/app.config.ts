import {
    ApplicationConfig,
    provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { routes } from './app.routes';

const firebaseConfig = {
    apiKey: 'AIzaSyChgf_T45v9LmSZFJYj69QBrnkWo9J4AaI',
    authDomain: 'rogue-goose.firebaseapp.com',
    projectId: 'rogue-goose',
    storageBucket: 'rogue-goose.firebasestorage.app',
    messagingSenderId: '785757340742',
    appId: '1:785757340742:web:5304e1df08641aa7d5f647',
};

export const appConfig: ApplicationConfig = {
    providers: [
        provideBrowserGlobalErrorListeners(),
        provideRouter(routes),
        provideFirebaseApp(() => initializeApp(firebaseConfig)),
        provideFirestore(() => getFirestore()),
    ],
};
