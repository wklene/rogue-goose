import { CommonModule } from '@angular/common';
import {
    Component,
    InputSignal,
    Signal,
    WritableSignal,
    computed,
    effect,
    inject,
    input,
    signal,
} from '@angular/core';
import { Lobby, LobbyService, Player } from '../lobby';
import { GameSquare } from './game-models';

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

    readonly boardLayout: GameSquare[] = this.generateSpiralBoard();

    // New local signal for animated player positions
    animatedPlayerPositions: WritableSignal<Map<string, number>> = signal(
        new Map<string, number>()
    );

    private movementTracker = effect(() => {
        const playersData = this.players();
        playersData.forEach((player) => {
            const currentAnimatedPosition = this.animatedPlayerPositions().get(
                player.id!
            );

            if (currentAnimatedPosition === undefined) {
                this.animatedPlayerPositions.update(
                    (map) => new Map(map.set(player.id!, player.position!))
                );
            } else if (currentAnimatedPosition < player.position!) {
                setTimeout(() => {
                    const newPos = currentAnimatedPosition + 1;
                    this.animatedPlayerPositions.update(
                        (map) => new Map(map.set(player.id!, newPos))
                    );
                }, 350);
            }
        });
    });

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
            // LobbyService.takeTurn already updates Firestore for current player turn, dice, etc.
            // Player's actual position update will come through the 'players' signal change.
            await this.lobbyService.takeTurn(
                lobby.id,
                players,
                me.id,
                this.boardLayout
            );
            setTimeout(() => this.isRolling.set(false), 500);
        }
    };

    onRestartGame = async (): Promise<void> => {
        const lobby = this.lobby();
        const players = this.players();
        // Reset animated positions when game restarts
        await this.lobbyService.restartGame(lobby.id, players);
        this.animatedPlayerPositions.set(new Map<string, number>());
    };

    getPlayerTransform = (
        playerId: string,
        currentActualPosition: number
    ): string => {
        const animatedPos = this.animatedPlayerPositions().get(playerId);
        const positionToUse =
            animatedPos !== undefined ? animatedPos : currentActualPosition;
        const { x, y } = this.getPositionCoordinates(positionToUse);
        return `translate(${x}px, ${y}px)`;
    };

    private getPositionCoordinates = (
        position: number
    ): { x: number; y: number } => {
        const squareInfo = this.boardLayout.find((s) => s.square === position);
        if (!squareInfo) {
            // initial position before first move
            return { x: 0, y: 0 }; // Adjusted for new top-left start
        }
        const x = squareInfo.x * 65 + (60 / 2 - 10) - 10;
        const y = squareInfo.y * 65 + (60 / 2 - 10) - 10;
        return { x, y };
    };

    private generateSpiralBoard(): GameSquare[] {
        const layout: GameSquare[] = [];
        const gridSize = 9; // For an 8x8 visible grid, 9 is good for coordinates 0-8
        let squareNum = 1; // Start filling from square 1

        const specialSquares: {
            [key: number]: 'goose' | 'bridge' | 'trap' | 'maze' | 'prison' | 'death';
        } = {
            5: 'goose',
            9: 'goose',
            14: 'goose',
            18: 'goose',
            23: 'goose',
            27: 'goose',
            32: 'goose',
            36: 'goose',
            41: 'goose',
            45: 'goose',
            50: 'goose',
            54: 'goose',
            59: 'goose',
            6: 'bridge',
            19: 'trap',
            42: 'maze',
            52: 'prison',
            58: 'death',
        };

        // Explicitly add the start tile at (0,0) as square 0
        layout.push({ square: 0, x: 0, y: 0, special: 'start' });

        let top = 0,
            bottom = gridSize - 1;
        let left = 0,
            right = gridSize - 1;

        while (top <= bottom && left <= right && squareNum <= 63) {
            // Move right (top row)
            for (let i = left; i <= right; i++) {
                if (squareNum > 63) break;
                // Avoid placing square 0 again, it's already in layout
                if (top === 0 && i === 0) {
                    // This is the (0,0) coordinate, which we already pushed as square 0.
                    // Skip if squareNum is 0, which it shouldn't be here now.
                    // This condition is mostly defensive.
                    continue;
                }
                const special = specialSquares[squareNum];
                layout.push({
                    square: squareNum,
                    x: i,
                    y: top,
                    ...(special && { special }),
                });
                squareNum++;
            }
            top++;

            // Move down (rightmost column)
            for (let i = top; i <= bottom; i++) {
                if (squareNum > 63) break;
                const special = specialSquares[squareNum];
                layout.push({
                    square: squareNum,
                    x: right,
                    y: i,
                    ...(special && { special }),
                });
                squareNum++;
            }
            right--;

            // Move left (bottom row)
            if (top <= bottom) {
                for (let i = right; i >= left; i--) {
                    if (squareNum > 63) break;
                    const special = specialSquares[squareNum];
                    layout.push({
                        square: squareNum,
                        x: i,
                        y: bottom,
                        ...(special && { special }),
                    });
                    squareNum++;
                }
                bottom--;
            }

            // Move up (leftmost column)
            if (left <= right) {
                for (let i = bottom; i >= top; i--) {
                    if (squareNum > 63) break;
                    // Avoid placing square 0 again, it's already in layout
                    if (left === 0 && i === 0) {
                        continue; // Defensive, should not happen if squareNum starts at 1
                    }
                    const special = specialSquares[squareNum];
                    layout.push({
                        square: squareNum,
                        x: left,
                        y: i,
                        ...(special && { special }),
                    });
                    squareNum++;
                }
                left++;
            }
        }
        return layout.sort((a, b) => a.square - b.square);
    }
}
