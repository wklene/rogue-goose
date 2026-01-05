import { CommonModule } from '@angular/common';
import {
    Component,
    InputSignal,
    Signal,
    WritableSignal,
    computed,
    inject,
    input,
    signal,
} from '@angular/core';
import { Lobby, LobbyService, Player } from '../lobby';

@Component({
    selector: 'app-game',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './game.html',
    styleUrl: './game.css',
})
export class GameComponent {
    lobby: InputSignal<Lobby> = input.required<Lobby>();
    players: InputSignal<Player[]> = input.required<Player[]>();
    isRolling: WritableSignal<boolean> = signal(false);

    currentPlayerName: Signal<string | undefined> = computed(() => {
        const lobby = this.lobby();
        const players = this.players();
        return players.find((p) => p.id === lobby.gameState?.currentPlayerTurn)
            ?.name;
    });

    private readonly lobbyService: LobbyService = inject(LobbyService);

    readonly boardSquares: number[] = this.generateBoard();

    isMyTurn: Signal<boolean> = computed(() => {
        const lobby = this.lobby();
        const players = this.players();
        const me = players.find(
            (p) => p.name === this.lobbyService.playerName()
        );
        return lobby?.gameState?.currentPlayerTurn === me?.id;
    });

    isHost: Signal<boolean> = computed(() => {
        const players = this.players();
        const me = players.find(
            (p) => p.name === this.lobbyService.playerName()
        );
        return me?.isHost ?? false;
    });

    onRollDice = async (): Promise<void> => {
        const lobby = this.lobby();
        const players = this.players();
        const me = players.find(
            (p) => p.name === this.lobbyService.playerName()
        );

        if (this.isMyTurn() && me?.id) {
            this.isRolling.set(true);
            await this.lobbyService.takeTurn(lobby.id, players, me.id);
            setTimeout(() => this.isRolling.set(false), 500);
        }
    };

    onRestartGame = async (): Promise<void> => {
        const lobby = this.lobby();
        const players = this.players();
        await this.lobbyService.restartGame(lobby.id, players);
    };

    getPlayerTransform = (position: number): string => {
        const { x, y } = this.getPositionCoordinates(position);
        return `translate(${x}px, ${y}px)`;
    };

    private getPositionCoordinates = (
        position: number
    ): { x: number; y: number } => {
        const squareIndex = this.boardSquares.indexOf(position);
        if (squareIndex === -1) {
            // initial position before first move
            return { x: 15, y: 15 };
        }
        const row = Math.floor(squareIndex / 9);
        const col = squareIndex % 9;

        const x = col * (60 + 5) + (60 / 2 - 10) + 5; // 60 is square size, 5 is gap, 10 is padding
        const y = row * (60 + 5) + (60 / 2 - 10) + 5;

        return { x, y };
    };

    private generateBoard(): number[] {
        const rows = 7;
        const cols = 9; // 63 squares
        const board: number[][] = [];
        let count = 1;
        for (let i = 0; i < rows; i++) {
            const row: number[] = [];
            for (let j = 0; j < cols; j++) {
                row.push(count++);
            }
            if (i % 2 !== 0) {
                row.reverse();
            }
            board.push(row);
        }
        return board.flat();
    }
}
