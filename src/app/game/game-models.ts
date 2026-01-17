export interface GameSquare {
    square: number;
    x: number;
    y: number;
    special?: 'goose' | 'bridge' | 'trap' | 'maze' | 'start' | 'prison' | 'death';
}
