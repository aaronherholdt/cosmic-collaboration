const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Set proper MIME types
express.static.mime.define({'text/css': ['css']});
express.static.mime.define({'application/javascript': ['js']});

// Serve static files with correct MIME types
app.use(express.static(path.join(__dirname, '/'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// Single game state
const gameState = {
    players: {},
    starSystems: {},
    hubProgress: {
        energy: { required: 100, current: 0 },
        crystal: { required: 100, current: 0 },
        metal: { required: 100, current: 0 },
        gas: { required: 100, current: 0 },
        exotic: { required: 100, current: 0 }
    },
    nexusShards: []
};

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    
    // Player joins game
    socket.on('joinGame', (data) => {
        const { playerName, rocketType } = data;
        
        // Add player to game
        const isHost = Object.keys(gameState.players).length === 0;
        gameState.players[socket.id] = {
            id: socket.id,
            name: playerName,
            rocketType: rocketType,
            isHost: isHost,
            position: { x: 0, y: 0 },
            inventory: {},
            currentStar: null
        };
        
        // Notify everyone about the new player
        io.emit('playerJoined', {
            id: socket.id,
            name: playerName,
            rocketType: rocketType,
            isHost: isHost
        });
        
        // Send current game state to the new player
        socket.emit('gameState', gameState);
    });
    
    // Player position update
    socket.on('updatePosition', (position) => {
        if (!gameState.players[socket.id]) return;
        
        gameState.players[socket.id].position = position;
        socket.broadcast.emit('playerMoved', {
            id: socket.id,
            position: position
        });
    });
    
    // Resource harvested
    socket.on('resourceHarvested', (data) => {
        if (!gameState.players[socket.id]) return;
        
        const { starId, resourceType, amount } = data;
        
        // Update game state
        if (!gameState.starSystems[starId]) {
            gameState.starSystems[starId] = { resources: {} };
        }
        
        if (!gameState.starSystems[starId].resources[resourceType]) {
            gameState.starSystems[starId].resources[resourceType] = 0;
        }
        
        gameState.starSystems[starId].resources[resourceType] += amount;
        
        // Broadcast to other players
        socket.broadcast.emit('resourceHarvested', {
            playerId: socket.id,
            starId: starId,
            playerName: gameState.players[socket.id].name,
            resourceType: resourceType,
            amount: amount
        });
    });
    
    // Hub contribution
    socket.on('hubContribution', (data) => {
        if (!gameState.players[socket.id]) return;
        
        const { resourceType, amount } = data;
        
        // Update hub progress
        if (gameState.hubProgress[resourceType]) {
            gameState.hubProgress[resourceType].current += amount;
            
            // Check if module is complete
            if (gameState.hubProgress[resourceType].current >= gameState.hubProgress[resourceType].required) {
                io.emit('moduleCompleted', resourceType);
            }
            
            // Check if hub is complete
            let hubComplete = true;
            for (const resource in gameState.hubProgress) {
                if (gameState.hubProgress[resource].current < gameState.hubProgress[resource].required) {
                    hubComplete = false;
                    break;
                }
            }
            
            if (hubComplete) {
                io.emit('hubCompleted');
            }
        }
        
        // Broadcast contribution to all players
        io.emit('hubContribution', {
            playerId: socket.id,
            playerName: gameState.players[socket.id].name,
            resourceType: resourceType,
            amount: amount,
            newTotal: gameState.hubProgress[resourceType].current
        });
    });
    
    // Nexus shard activation
    socket.on('activateNexusShard', (data) => {
        if (!gameState.players[socket.id]) return;
        
        const { starId, resourceType } = data;
        
        // Add to activated shards
        gameState.nexusShards.push({
            starId: starId,
            activatedBy: socket.id,
            resourceType: resourceType,
            timestamp: Date.now()
        });
        
        // Broadcast activation to all players
        io.emit('nexusShardActivated', {
            playerId: socket.id,
            playerName: gameState.players[socket.id].name,
            starId: starId,
            resourceType: resourceType,
            totalActivated: gameState.nexusShards.length
        });
    });
    
    // Player ping
    socket.on('sendPing', (data) => {
        if (!gameState.players[socket.id]) return;
        
        const { x, y, message } = data;
        
        io.emit('pingReceived', {
            id: `ping_${Date.now()}_${socket.id}`,
            x: x,
            y: y,
            message: message,
            sender: gameState.players[socket.id].name,
            timestamp: Date.now()
        });
    });
    
    // Disconnect
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        
        if (gameState.players[socket.id]) {
            // Notify other players
            io.emit('playerLeft', {
                id: socket.id,
                name: gameState.players[socket.id].name
            });
            
            // Check if this player was the host
            const wasHost = gameState.players[socket.id].isHost;
            
            // Remove player from game
            delete gameState.players[socket.id];
            
            // If the host left and there are still players, assign a new host
            if (wasHost && Object.keys(gameState.players).length > 0) {
                const newHostId = Object.keys(gameState.players)[0];
                gameState.players[newHostId].isHost = true;
                
                io.emit('newHost', {
                    id: newHostId,
                    name: gameState.players[newHostId].name
                });
            }
        }
    });
});

// Root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
