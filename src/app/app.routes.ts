import { Routes } from '@angular/router';
import { LobbyListComponent } from './lobby-list/lobby-list';
import { LobbyComponent } from './lobby/lobby';

export const routes: Routes = [
    { path: '', component: LobbyListComponent },
    { path: 'lobby/:id', component: LobbyComponent },
];
