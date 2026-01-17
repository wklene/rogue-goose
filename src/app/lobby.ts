import {
    Injectable,
    Signal,
    WritableSignal,
    inject,
    signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
    DocumentReference,
    Firestore,
    addDoc,
    collection,
    collectionData,
    deleteDoc,
    doc,
    docData,
    getDocs,
    query,
    updateDoc,
    where,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { GameSquare } from './game/game-models';

export interface Player {
    id?: string;
    name: string;
    isReady: boolean;
    isHost?: boolean;
    color?: string;
    position?: number;
    turnsToSkip?: number;
}

export interface GameState {
    currentPlayerTurn: string; // playerId
    lastDiceRoll: number | null; // Sum of two dice
    lastDiceRoll1: number | null; // Result of first die
    lastDiceRoll2: number | null; // Result of second die
    winner: string | null;
    turnMessage?: string;
}

export interface Lobby {
    id: string;
    name: string;
    status: 'waiting' | 'in-progress' | 'finished';
    maxPlayers: number;
    players?: Player[];
    gameState?: GameState;
}

@Injectable({
    providedIn: 'root',
})
export class LobbyService {
    private readonly firestore: Firestore = inject(Firestore);
    private readonly lobbiesCollection = collection(this.firestore, 'lobbies');

    public readonly playerName: WritableSignal<string> = signal('');

    constructor() {
        const storedName = localStorage.getItem('rogue-goose-player-name');
        if (storedName) {
            this.playerName.set(storedName);
        }
    }

    setPlayerName = (name: string): void => {
        this.playerName.set(name);
        localStorage.setItem('rogue-goose-player-name', name);
    };

    clearPlayerName = (): void => {
        this.playerName.set('');
        localStorage.removeItem('rogue-goose-player-name');
    };

    private getLobbiesObservable = (): Observable<Lobby[]> => {
        return collectionData(this.lobbiesCollection, {
            idField: 'id',
        }) as Observable<Lobby[]>;
    };

    private readonly playerColors = [
        '#FF0000',
        '#0000FF',
        '#00FF00',
        '#FFFF00',
    ]; // Red, Blue, Green, Yellow

    public lobbies: Signal<Lobby[]> = toSignal(this.getLobbiesObservable(), {
        initialValue: [],
    });

    createLobby = async (
        name: string,
        hostName: string
    ): Promise<DocumentReference> => {
        const lobbyData = {
            name,
            status: 'waiting' as const,
            maxPlayers: 4,
        };
        const lobbyRef = await addDoc(this.lobbiesCollection, lobbyData);
        // Add the host as the first player
        const playersCollection = collection(
            this.firestore,
            'lobbies',
            lobbyRef.id,
            'players'
        );
        const hostData = {
            name: hostName,
            isReady: true,
            isHost: true,
            color: this.playerColors[0],
            position: 0,
        };
        await addDoc(playersCollection, hostData);
        return lobbyRef;
    };

    getLobby = (lobbyId: string): Observable<Lobby> => {
        const lobbyDocRef = doc(this.firestore, `lobbies/${lobbyId}`);
        return docData(lobbyDocRef, { idField: 'id' }) as Observable<Lobby>;
    };

    getPlayers = (lobbyId: string): Observable<Player[]> => {
        const playersCollection = collection(
            this.firestore,
            'lobbies',
            lobbyId,
            'players'
        );
        return collectionData(playersCollection, {
            idField: 'id',
        }) as Observable<Player[]>;
    };

    joinLobby = async (
        lobbyId: string,
        playerName: string
    ): Promise<DocumentReference | null> => {
        const playersCollection = collection(
            this.firestore,
            'lobbies',
            lobbyId,
            'players'
        );

        // Check if player with the same name already exists
        const q = query(playersCollection, where('name', '==', playerName));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            // Player already in the lobby
            console.log('Player already in lobby');
            return null;
        }

        // Get current player count to assign a color
        const playersSnapshot = await getDocs(playersCollection);
        const playerCount = playersSnapshot.size;

        if (playerCount >= 4) {
            console.log('Lobby is full');
            return null;
        }

        const playerData = {
            name: playerName,
            isReady: false,
            isHost: false,
            color: this.playerColors[playerCount],
            position: 0,
        };
        return await addDoc(playersCollection, playerData);
    };

    leaveLobby = async (lobbyId: string, playerId: string): Promise<void> => {
        const playerDocRef = doc(
            this.firestore,
            `lobbies/${lobbyId}/players/${playerId}`
        );
        return await deleteDoc(playerDocRef);
    };

    startGame = async (lobbyId: string): Promise<void> => {
        const lobbyDocRef = doc(this.firestore, `lobbies/${lobbyId}`);

        const playersCollection = collection(
            this.firestore,
            'lobbies',
            lobbyId,
            'players'
        );
        const playersSnapshot = await getDocs(playersCollection);

        const host = playersSnapshot.docs
            .map((d) => ({ ...d.data(), id: d.id } as Player))
            .find((p) => p.isHost);

        if (!host || !host.id) {
            throw new Error('Cannot start game without a host.');
        }

        const initialGameState: GameState = {
            currentPlayerTurn: host.id,
            lastDiceRoll: null,
            lastDiceRoll1: null,
            lastDiceRoll2: null,
            winner: null,
            turnMessage: '',
        };

        return await updateDoc(lobbyDocRef, {
            status: 'in-progress',
            gameState: initialGameState,
        });
    };

    takeTurn = async (
        lobbyId: string,
        players: Player[],
        currentPlayerId: string,
        boardLayout: GameSquare[]
    ): Promise<void> => {
        let currentPlayerIndex = players.findIndex(
            (p) => p.id === currentPlayerId
        );
        let currentPlayer = players[currentPlayerIndex];

        if (!currentPlayer) {
            throw new Error('Current player not found');
        }

        let turnMessage = '';
        let nextPlayerId = currentPlayerId; // Default to current player
        let shouldRollDice = true;
        let dice1: number | null = null; // Declare individual dice rolls
        let dice2: number | null = null;
        let diceRoll: number | null = null; // Declare diceRoll here
        const lobbyDocRef = doc(this.firestore, `lobbies/${lobbyId}`); // Declare lobbyDocRef here

        // 1. Check if current player needs to skip turn
        if (currentPlayer.turnsToSkip && currentPlayer.turnsToSkip > 0) {
            turnMessage = `${currentPlayer.name} skips their turn!`;
            currentPlayer.turnsToSkip--; // Decrement turns to skip
            shouldRollDice = false; // Do not roll dice or move

            // Update player in Firestore immediately for turnsToSkip
            const playerDocRef = doc(
                this.firestore,
                `lobbies/${lobbyId}/players/${currentPlayerId}`
            );
            await updateDoc(playerDocRef, {
                turnsToSkip: currentPlayer.turnsToSkip,
            });

            // Determine next player
            currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
            nextPlayerId = players[currentPlayerIndex].id!;
        } else {
            // Player rolls dice and moves
            // 1. Roll dice
            dice1 = Math.floor(Math.random() * 6) + 1;
            dice2 = Math.floor(Math.random() * 6) + 1;
            diceRoll = dice1 + dice2; // Sum of two dice

            // 2. Calculate new position
            let newPosition = (currentPlayer.position || 0) + diceRoll;
            if (newPosition > 63) {
                newPosition = 63 - (newPosition - 63); // Bounce back from the end
            }

            // 3. Handle special tiles
            const currentSquare = boardLayout.find(
                (s) => s.square === newPosition
            );
            if (currentSquare?.special) {
                switch (currentSquare.special) {
                    case 'goose':
                        newPosition += diceRoll;
                        if (newPosition > 63) {
                            newPosition = 63 - (newPosition - 63);
                        }
                        turnMessage = `Landed on a Goose! Move forward ${diceRoll} spaces.`;
                        break;
                    case 'bridge':
                        newPosition = 12;
                        turnMessage = 'Landed on a Bridge! Move to square 12.';
                        break;
                    case 'trap':
                        currentPlayer.turnsToSkip =
                            (currentPlayer.turnsToSkip || 0) + 1; // Accumulate turns to skip
                        turnMessage = 'Landed in a Trap! Lose your next turn.';
                        break;
                    case 'prison':
                        currentPlayer.turnsToSkip =
                            (currentPlayer.turnsToSkip || 0) + 2; // Accumulate turns to skip
                        turnMessage = 'Landed in Prison! Lose your next 2 turns.';
                        break;
                    case 'death':
                        newPosition = 0;
                        turnMessage = 'Death! Go back to the start.';
                        break;
                    case 'maze':
                        newPosition = 30;
                        turnMessage = 'Lost in a Maze! Go back to square 30.';
                        break;
                    case 'start':
                        // Start tile has no special action for landing on it after initial move
                        break;
                }
            }

            // 4. Update player's position and turnsToSkip (if trap)
            const playerDocRef = doc(
                this.firestore,
                `lobbies/${lobbyId}/players/${currentPlayerId}`
            );
            await updateDoc(playerDocRef, {
                position: newPosition,
                turnsToSkip: currentPlayer.turnsToSkip || 0, // Ensure turnsToSkip is always set
            });

            // 5. Determine next player (after normal turn)
            currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
            nextPlayerId = players[currentPlayerIndex].id!;

            // 6. Handle winner
            if (newPosition === 63) {
                await updateDoc(lobbyDocRef, {
                    status: 'finished',
                    'gameState.winner': currentPlayer.name,
                });
            }
        }

        // 7. Update game state
        await updateDoc(lobbyDocRef, {
            'gameState.currentPlayerTurn': nextPlayerId,
            'gameState.lastDiceRoll': shouldRollDice ? diceRoll : null,
            'gameState.lastDiceRoll1': shouldRollDice ? dice1 : null,
            'gameState.lastDiceRoll2': shouldRollDice ? dice2 : null,
            'gameState.turnMessage': turnMessage,
        });
    };

    restartGame = async (lobbyId: string, players: Player[]): Promise<void> => {
        // 1. Reset all players' positions and turnsToSkip
        const playersCollection = collection(
            this.firestore,
            'lobbies',
            lobbyId,
            'players'
        );
        const playerUpdates = players.map((p) => {
            const playerDocRef = doc(playersCollection, p.id);
            return updateDoc(playerDocRef, { position: 0, turnsToSkip: 0 });
        });
        await Promise.all(playerUpdates);

        // 2. Find the host to set as the first player
        const host = players.find((p) => p.isHost);
        if (!host || !host.id) {
            throw new Error('Cannot restart game without a host.');
        }

        // 3. Reset game state
        const lobbyDocRef = doc(this.firestore, `lobbies/${lobbyId}`);
        const newGameState: GameState = {
            currentPlayerTurn: host.id,
            lastDiceRoll: null,
            lastDiceRoll1: null,
            lastDiceRoll2: null,
            winner: null,
            turnMessage: '',
        };

        await updateDoc(lobbyDocRef, {
            status: 'in-progress',
            gameState: newGameState,
        });
    };
}
