const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Deployment URL
const DEPLOYMENT_URL = 'https://cosmic-collaboration.onrender.com';

// Initialize express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: ["http://localhost:3000", DEPLOYMENT_URL, "*"],
        methods: ["GET", "POST"],
        credentials: true
    },
    pingInterval: 2000, // More frequent ping to keep connections alive
    pingTimeout: 5000   // Faster timeout detection
});

// Serve static files
app.use(express.static(path.join(__dirname, '/')));

// Add a route for the root path that displays connection info
app.get('/', (req, res, next) => {
    // If there's an index.html, this will pass to the static middleware
    if (path.join(__dirname, '/index.html')) {
        next();
    } else {
        res.send(`
            <h1>Hexagonal Harvest - Cosmic Collaboration</h1>
            <p>Server is running. Connect to: ${DEPLOYMENT_URL}</p>
        `);
    }
});

// Core game state - keeping only essential data
const gameState = {
    players: {},
    isGameStarted: false,
    hubProgress: {
        energy: { current: 0, max: 1000 },
        water: { current: 0, max: 1000 },
        organic: { current: 0, max: 1000 },
        mineral: { current: 0, max: 1000 }
    },
    lastUpdateTime: Date.now() // Track last state update
};

// Enhanced player position tracking
// Store position history for interpolation if needed
const MAX_POSITION_HISTORY = 5;
const MOVEMENT_THRESHOLD = 0.5; // Minimum distance to register movement

// Helper function to calculate distance between two points
function calculateDistance(pos1, pos2) {
    return Math.sqrt(Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.y - pos2.y, 2));
}

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log(`New connection: ${socket.id}`);

    // Send connection confirmation with server info
    socket.emit('connectionEstablished', {
        serverId: socket.id,
        serverUrl: DEPLOYMENT_URL,
        timestamp: Date.now()
    });

    // Core player join functionality
    socket.on('playerJoin', ({ playerName, rocketType }) => {
        gameState.players[socket.id] = {
            id: socket.id,
            name: playerName,
            rocketType: rocketType,
            position: { x: 0, y: 0 },
            previousPositions: [],
            velocity: { x: 0, y: 0 },
            direction: 0,
            lastMoveTime: Date.now(),
            isMoving: false,
            isHost: Object.keys(gameState.players).length === 0
        };
        io.emit('playerJoined', {
            id: socket.id,
            name: playerName,
            isHost: gameState.players[socket.id].isHost,
            rocketType: rocketType,
            position: { x: 0, y: 0 },
            direction: 0
        });
        socket.emit('playerList', Object.values(gameState.players).map(player => ({
            id: player.id,
            name: player.name,
            isHost: player.isHost,
            rocketType: player.rocketType,
            position: player.position,
            direction: player.direction,
            isMoving: player.isMoving
        })));
        // Sync game state for late joiners
        socket.emit('fullGameState', {
            players: gameState.players,
            hubProgress: gameState.hubProgress,
            isGameStarted: gameState.isGameStarted
        });
        if (gameState.isGameStarted) {
            socket.emit('gameStarted');
            console.log(`Notified late joiner ${socket.id} that game has started`);
        }
    });

    // Game start handler
    socket.on('startGame', () => {
        if (gameState.players[socket.id] && gameState.players[socket.id].isHost) {
            console.log(`Host ${socket.id} started the game. Broadcasting to ${Object.keys(gameState.players).length} players.`);
            gameState.isGameStarted = true;
            io.emit('gameStarted');
        } else {
            console.log(`Non-host ${socket.id} attempted to start the game. Ignoring.`);
        }
    });

    // Enhanced player position synchronization
    socket.on('playerMove', (moveData) => {
        const player = gameState.players[socket.id];
        if (!player) return;
        
        const currentTime = Date.now();
        const { position, velocity, direction } = moveData;
        
        // Store previous position for history
        if (player.position.x !== 0 || player.position.y !== 0) {
            // Only store if it's a significant enough movement
            if (calculateDistance(player.position, position) > MOVEMENT_THRESHOLD) {
                player.previousPositions.unshift({
                    position: {...player.position},
                    timestamp: player.lastMoveTime
                });
                
                // Limit history size
                if (player.previousPositions.length > MAX_POSITION_HISTORY) {
                    player.previousPositions.pop();
                }
            }
        }
        
        // Update player position and movement data
        player.position = position;
        player.velocity = velocity || { x: 0, y: 0 };
        player.direction = direction || 0;
        player.lastMoveTime = currentTime;
        player.isMoving = velocity && (Math.abs(velocity.x) > 0.01 || Math.abs(velocity.y) > 0.01);
        
        // Broadcast updated position to ALL players (not just other players)
        // This ensures everyone has the most current data
        io.emit('playerMoved', {
            id: socket.id,
            position: player.position,
            velocity: player.velocity,
            direction: player.direction,
            timestamp: currentTime,
            isMoving: player.isMoving
        });
    });

    // Player stopped moving event
    socket.on('playerStopMove', () => {
        const player = gameState.players[socket.id];
        if (!player) return;
        
        player.isMoving = false;
        player.velocity = { x: 0, y: 0 };
        
        io.emit('playerStoppedMoving', {
            id: socket.id,
            position: player.position,
            timestamp: Date.now()
        });
    });

    // Request for full game state - useful when a client needs to sync
    socket.on('requestGameState', () => {
        socket.emit('fullGameState', {
            players: Object.values(gameState.players).map(player => ({
                id: player.id,
                name: player.name,
                position: player.position,
                velocity: player.velocity,
                direction: player.direction,
                isMoving: player.isMoving,
                rocketType: player.rocketType,
                isHost: player.isHost
            })),
            hubProgress: gameState.hubProgress,
            isGameStarted: gameState.isGameStarted
        });
    });

    // Connection status check
    socket.on('pingServer', (callback) => {
        const timestamp = Date.now();
        if (typeof callback === 'function') {
            callback({
                status: 'connected',
                timestamp: timestamp,
                playerCount: Object.keys(gameState.players).length
            });
        } else {
            socket.emit('pongServer', {
                status: 'connected',
                timestamp: timestamp,
                playerCount: Object.keys(gameState.players).length
            });
        }
    });

    // Essential resource contribution functionality
    socket.on('contributeToHub', ({ resourceType, amount }) => {
        if (!gameState.players[socket.id]) return;
        
        // Update hub progress
        gameState.hubProgress[resourceType].current += amount;
        
        // Cap at maximum
        if (gameState.hubProgress[resourceType].current > gameState.hubProgress[resourceType].max) {
            gameState.hubProgress[resourceType].current = gameState.hubProgress[resourceType].max;
        }
        
        // Broadcast contribution to all players
        io.emit('hubContribution', {
            playerId: socket.id,
            playerName: gameState.players[socket.id].name,
            resourceType,
            amount,
            hubProgress: gameState.hubProgress
        });
        
        // Check if hub is complete
        const isHubComplete = Object.keys(gameState.hubProgress).every(
            resource => gameState.hubProgress[resource].current >= gameState.hubProgress[resource].max
        );
        
        if (isHubComplete) {
            io.emit('hubComplete');
        }
    });

    // Basic ping system for player coordination
    socket.on('addPing', ({ x, y, message }) => {
        if (!gameState.players[socket.id]) return;
        
        io.emit('newPing', {
            id: Date.now().toString(),
            x,
            y,
            message,
            sender: gameState.players[socket.id].name,
            senderId: socket.id,
            timestamp: Date.now()
        });
    });

    // Core player disconnect handling
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        
        if (gameState.players[socket.id]) {
            const wasHost = gameState.players[socket.id].isHost;
            
            // Remove player from game state
            delete gameState.players[socket.id];
            
            // Broadcast player left to all clients
            io.emit('playerLeft', { id: socket.id });
            
            // If the host left and there are still players, assign a new host
            if (wasHost && Object.keys(gameState.players).length > 0) {
                const newHostId = Object.keys(gameState.players)[0];
                gameState.players[newHostId].isHost = true;
                
                io.emit('newHost', { id: newHostId });
            }
            
            // If no players left, reset game state
            if (Object.keys(gameState.players).length === 0) {
                gameState.isGameStarted = false;
                gameState.hubProgress = {
                    energy: { current: 0, max: 1000 },
                    water: { current: 0, max: 1000 },
                    organic: { current: 0, max: 1000 },
                    mineral: { current: 0, max: 1000 }
                };
            }
        }
    });
});

// Periodic state updates (broadcasting positions at regular intervals)
// This ensures clients stay in sync even with packet loss
const STATE_UPDATE_INTERVAL = 1000; // ms
setInterval(() => {
    // Only send if there are active players
    if (Object.keys(gameState.players).length > 0) {
        const currentTime = Date.now();
        const playerPositions = {};
        
        Object.keys(gameState.players).forEach(id => {
            const player = gameState.players[id];
            playerPositions[id] = {
                position: player.position,
                velocity: player.velocity,
                direction: player.direction,
                isMoving: player.isMoving
            };
        });
        
        io.emit('gameStateUpdate', {
            playerPositions,
            timestamp: currentTime
        });
        
        gameState.lastUpdateTime = currentTime;
    }
}, STATE_UPDATE_INTERVAL);

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok',
        uptime: process.uptime(),
        timestamp: Date.now(),
        playerCount: Object.keys(gameState.players).length,
        deployment: DEPLOYMENT_URL
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`External URL: ${DEPLOYMENT_URL}`);
    console.log(`Local URL: http://localhost:${PORT}`);
}); 
