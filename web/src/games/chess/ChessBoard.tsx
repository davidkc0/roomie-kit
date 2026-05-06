import { useCallback, useState, useMemo } from 'react';
import { Chessboard } from 'react-chessboard';
import type { Square } from 'chess.js';
import type { ChessGameState } from './ChessGame';

type ChessBoardProps = {
    gameState: ChessGameState;
    playerColor: 'w' | 'b';
    onMove: (from: Square, to: Square) => void;
    getValidMoves: (square: Square) => Square[];
    disabled?: boolean;
};

export function ChessBoard({
    gameState,
    playerColor,
    onMove,
    getValidMoves,
    disabled = false
}: ChessBoardProps) {
    const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
    const [validMoveSquares, setValidMoveSquares] = useState<Square[]>([]);

    // Handle clicking a square to select piece or make move
    const onSquareClick = useCallback((square: Square) => {
        if (disabled) return;

        // If clicking on a valid move square, make the move
        if (selectedSquare && validMoveSquares.includes(square)) {
            onMove(selectedSquare, square);
            setSelectedSquare(null);
            setValidMoveSquares([]);
            return;
        }

        // Check if this square has a piece that can move
        const moves = getValidMoves(square);

        if (moves.length > 0 && gameState.turn === playerColor) {
            // Select this piece and show valid moves
            setSelectedSquare(square);
            setValidMoveSquares(moves);
        } else {
            // Clicked on empty square or opponent's piece - clear selection
            setSelectedSquare(null);
            setValidMoveSquares([]);
        }
    }, [disabled, selectedSquare, validMoveSquares, gameState, playerColor, getValidMoves, onMove]);

    const onPieceDrop = useCallback((sourceSquare: Square, targetSquare: Square) => {
        if (disabled) return false;
        onMove(sourceSquare, targetSquare);
        setSelectedSquare(null);
        setValidMoveSquares([]);
        return true;
    }, [disabled, onMove]);

    // Clear selection when turn changes
    const prevTurn = useMemo(() => gameState.turn, [gameState.turn]);
    useMemo(() => {
        if (selectedSquare) {
            setSelectedSquare(null);
            setValidMoveSquares([]);
        }
    }, [prevTurn]);

    // Build custom square styles for highlighting
    const customSquareStyles = useMemo(() => {
        const styles: { [square: string]: React.CSSProperties } = {};

        // Subtle highlight for selected square
        if (selectedSquare) {
            styles[selectedSquare] = {
                backgroundColor: 'rgba(255, 255, 255, 0.2)', // Subtle white highlight
            };
        }

        // Subtle gray dots for valid move squares
        validMoveSquares.forEach(square => {
            styles[square] = {
                background: 'radial-gradient(circle, rgba(0, 0, 0, 0.15) 20%, transparent 20%)',
            };
        });

        return styles;
    }, [selectedSquare, validMoveSquares]);

    return (
        <div className="w-full max-w-[400px] aspect-square shadow-2xl rounded-lg overflow-hidden border border-border/50">
            <Chessboard
                position={gameState.fen}
                onPieceDrop={onPieceDrop}
                onSquareClick={onSquareClick}
                boardOrientation={playerColor === 'w' ? 'white' : 'black'}
                arePiecesDraggable={!disabled && gameState.turn === playerColor}
                animationDuration={200}
                customDarkSquareStyle={{ backgroundColor: '#B58863' }}
                customLightSquareStyle={{ backgroundColor: '#F0D9B5' }}
                customSquareStyles={customSquareStyles}
            />
        </div>
    );
}
