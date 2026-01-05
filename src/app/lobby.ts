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
    where,
    updateDoc,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export interface Player {
    id?: string;
    name: string;
    isReady: boolean;
    isHost?: boolean;
    color?: string;
    position?: number;
}

export interface GameState {
    currentPlayerTurn: string; // playerId
    lastDiceRoll: number | null;
    winner: string | null;
}

export interface Lobby {
    id: string;
    name:string;
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

    private readonly playerColors = ['#FF0000', '#0000FF', '#00FF00', '#FFFF00']; // Red, Blue, Green, Yellow

    public lobbies: Signal<Lobby[]> = toSignal(this.getLobbiesObservable(), {
        initialValue: [],
    });

    createLobby = async (name: string, hostName: string): Promise<DocumentReference> => {
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
    }

    getLobby = (lobbyId: string): Observable<Lobby> => {
        const lobbyDocRef = doc(this.firestore, `lobbies/${lobbyId}`);
        return docData(lobbyDocRef, { idField: 'id' }) as Observable<Lobby>;
    }

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
    }

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
    }

    leaveLobby = async (lobbyId: string, playerId: string): Promise<void> => {
        const playerDocRef = doc(this.firestore, `lobbies/${lobbyId}/players/${playerId}`);
        return await deleteDoc(playerDocRef);
    }

    startGame = async (lobbyId: string): Promise<void> => {
        const lobbyDocRef = doc(this.firestore, `lobbies/${lobbyId}`);
        
        const playersCollection = collection(this.firestore, 'lobbies', lobbyId, 'players');
        const playersSnapshot = await getDocs(playersCollection);
        
        const host = playersSnapshot.docs.map(d => ({...d.data(), id: d.id} as Player)).find(p => p.isHost);

        if (!host || !host.id) {
            throw new Error('Cannot start game without a host.');
        }

        const initialGameState: GameState = {
            currentPlayerTurn: host.id,
            lastDiceRoll: null,
            winner: null,
        };

        return await updateDoc(lobbyDocRef, { 
            status: 'in-progress',
            gameState: initialGameState,
        });
    }

    takeTurn = async (lobbyId: string, players: Player[], currentPlayerId: string): Promise<void> => {
        const currentPlayerIndex = players.findIndex(p => p.id === currentPlayerId);
        const currentPlayer = players[currentPlayerIndex];

        if (!currentPlayer) {
            throw new Error('Current player not found');
        }

        // 1. Roll dice
        const diceRoll = Math.floor(Math.random() * 6) + 1;
        
        // 2. Calculate new position
        let newPosition = (currentPlayer.position || 0) + diceRoll;
        if (newPosition > 63) {
            newPosition = 63 - (newPosition - 63); // Bounce back from the end
        }

        // 3. Update player's position
        const playerDocRef = doc(this.firestore, `lobbies/${lobbyId}/players/${currentPlayerId}`);
        await updateDoc(playerDocRef, { position: newPosition });

        // 4. Determine next player
        const nextPlayerIndex = (currentPlayerIndex + 1) % players.length;
        const nextPlayerId = players[nextPlayerIndex].id!;

        // 5. Update game state
        const lobbyDocRef = doc(this.firestore, `lobbies/${lobbyId}`);
        const newGameState: Partial<GameState> = {
            currentPlayerTurn: nextPlayerId,
            lastDiceRoll: diceRoll,
            winner: newPosition === 63 ? currentPlayer.name : null,
        };

        await updateDoc(lobbyDocRef, { 'gameState.currentPlayerTurn': nextPlayerId, 'gameState.lastDiceRoll': diceRoll });

        if (newPosition === 63) {
            // If there's a winner, update the lobby status and winner
            await updateDoc(lobbyDocRef, {
                status: 'finished',
                'gameState.winner': currentPlayer.name,
            });
        }
    };

    restartGame = async (lobbyId: string, players: Player[]): Promise<void> => {
        // 1. Reset all players' positions
        const playersCollection = collection(
            this.firestore,
            'lobbies',
            lobbyId,
            'players'
        );
        const playerUpdates = players.map((p) => {
            const playerDocRef = doc(playersCollection, p.id);
            return updateDoc(playerDocRef, { position: 0 });
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
            winner: null,
        };

        await updateDoc(lobbyDocRef, {
            status: 'in-progress',
            gameState: newGameState,
        });
    };
}
