import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { GameComponent } from '../game/game';
import { Lobby, LobbyService, Player } from '../lobby';

@Component({
    selector: 'app-lobby',
    standalone: true,
    imports: [RouterLink, CommonModule, GameComponent],
    templateUrl: './lobby.html',
    styleUrl: './lobby.css',
})
export class LobbyComponent implements OnInit {
    private readonly route: ActivatedRoute = inject(ActivatedRoute);
    protected readonly lobbyService: LobbyService = inject(LobbyService);

    lobby$!: Observable<Lobby>;
    players$!: Observable<Player[]>;
    lobbyId!: string;

    ngOnInit(): void {
        this.lobbyId = this.route.snapshot.paramMap.get('id')!;
        if (this.lobbyId) {
            this.lobby$ = this.lobbyService.getLobby(this.lobbyId);
            this.players$ = this.lobbyService.getPlayers(this.lobbyId);
        }
    }

    isPlayerInCurrentLobby = (players: Player[]): boolean => {
        return players.some((p) => p.name === this.lobbyService.playerName());
    };

    isHost = (players: Player[]): boolean => {
        const currentPlayer = players.find(
            (p) => p.name === this.lobbyService.playerName()
        );
        return currentPlayer?.isHost ?? false;
    };

    onJoinCurrentLobby = async (): Promise<void> => {
        if (!this.lobbyId || !this.lobbyService.playerName()) return;
        await this.lobbyService.joinLobby(
            this.lobbyId,
            this.lobbyService.playerName()
        );
    };

    onStartGame = async (): Promise<void> => {
        if (!this.lobbyId) return;
        await this.lobbyService.startGame(this.lobbyId);
    };
}
