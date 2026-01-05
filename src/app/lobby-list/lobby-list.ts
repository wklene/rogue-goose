import { AsyncPipe } from '@angular/common';
import { Component, Signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { Lobby, LobbyService, Player } from '../lobby';

@Component({
    selector: 'app-lobby-list',
    standalone: true,
    imports: [AsyncPipe],
    templateUrl: './lobby-list.html',
    styleUrl: './lobby-list.css',
})
export class LobbyListComponent {
    protected readonly lobbyService: LobbyService = inject(LobbyService);
    protected readonly lobbies: Signal<Lobby[]> = this.lobbyService.lobbies;
    private readonly playersCache = new Map<string, Observable<Player[]>>();
    private readonly router: Router = inject(Router);

    setPlayerName = (name: string): void => {
        this.lobbyService.setPlayerName(name);
    };

    clearPlayerName = (): void => {
        this.lobbyService.clearPlayerName();
    };

    onCreateLobby = async (): Promise<void> => {
        const name = `Lobby ${Math.floor(Math.random() * 1000)}`;
        // Create the lobby and pass the current player's name as the host
        const lobbyRef = await this.lobbyService.createLobby(name, this.lobbyService.playerName());
        // Navigate to the new lobby
        this.router.navigate(['/lobby', lobbyRef.id]);
    };

    onOpenLobby = (lobbyId: string): void => {
        this.router.navigate(['/lobby', lobbyId]);
    };

    onJoinLobby = async (lobbyId: string): Promise<void> => {
        if (!lobbyId || !this.lobbyService.playerName()) return;
        await this.lobbyService.joinLobby(
            lobbyId,
            this.lobbyService.playerName()
        );
    };

    getPlayers = (lobbyId: string): Observable<Player[]> => {
        if (!this.playersCache.has(lobbyId)) {
            this.playersCache.set(
                lobbyId,
                this.lobbyService.getPlayers(lobbyId)
            );
        }
        return this.playersCache.get(lobbyId)!;
    };

    isPlayerInLobby = (players: Player[]): boolean => {
        return players.some((p) => p.name === this.lobbyService.playerName());
    };

    onLeaveLobby = (lobbyId: string, players: Player[]): void => {
        const currentPlayer = players.find(
            (p) => p.name === this.lobbyService.playerName()
        );
        if (currentPlayer && currentPlayer.id) {
            this.lobbyService.leaveLobby(lobbyId, currentPlayer.id);
        }
    };
}
